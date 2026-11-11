import assert from 'node:assert/strict';
const a: any = require('../src/services/no-code-alarm');
let active = false, raised = 0, bypass = false, saved: any = null;
const testDeps = {
 isBypassActive: async () => bypass,
 raiseAlarm: async () => { raised++; active = true; },
 isNoCodeAlarmActive: () => active,
 clearAlarm: async () => { active = false; },
 loadConfig: async () => saved,
 saveConfig: async (c: any) => { saved = c; },
};
a.__setDepsForTest(testDeps);
async function main() {
 await a.updateConfig({enabled:true, frameThreshold:300});
 let token = a.getStatus().resetToken;
 const sequences: Record<string, number> = {};
 const report = (ip:string, count:number, now=1000, sequence?:number) => {
   const seq = sequence ?? ((sequences[ip] ?? 0) + 1);
   sequences[ip] = Math.max(sequences[ip] ?? 0, seq);
   return a.reportCamera({clientIp:ip,hasCode:count===0,consecutiveNoCodeFrames:count,frameAgeMs:0,resetToken:token,sessionId:ip,sequence:seq},now);
 };
 await report('a',0); await report('b',0); await report('c',0);
 await report('a',300); await report('b',299); await report('c',350);
 assert.equal(raised,0,'all online cameras must reach threshold');
 await report('b',300); assert.equal(raised,1);
 assert.equal(a.getStatus(7000).alarmCameras.length,3,'alarm snapshot survives camera going offline');
 await report('a',301); assert.equal(raised,1,'active alarm must not repeat');
 await a.clearNoCodeAlarm(); await report('a',900);
 assert.equal(raised,1,'old token cannot retrigger');
 token=a.getStatus().resetToken;
 await report('a',300); assert.equal(raised,1,'other online cameras still need fresh counts');
 await report('b',300); await report('c',300); assert.equal(raised,2);
 await a.clearNoCodeAlarm(); await a.evaluate(7000); token=a.getStatus().resetToken;
 await report('a',0); await report('b',0);
 await report('a',300); await report('b',0,1000,301);
 await report('b',300,1000,300); assert.equal(raised,2,'out of order ignored');
 await a.evaluate(7000); assert.equal(a.getStatus(7000).cameras.length,0);
 assert.equal(raised,2,'zero online cameras cannot alarm');
 await a.reportCamera({clientIp:'b',hasCode:false,consecutiveNoCodeFrames:999,frameAgeMs:0,resetToken:'old',sessionId:'b-new',sequence:1},7000);
 await report('a',300,7000,1000);
 assert.equal(raised,2,'online camera awaiting reset handshake blocks alarm');
 await report('b',300,7000,1001); assert.equal(raised,3);
 await a.clearNoCodeAlarm();

 await a.updateConfig({enabled:false}); token=a.getStatus().resetToken;
 await report('a',300); assert.equal(raised,3);
 await a.updateConfig({enabled:true,frameThreshold:10}); token=a.getStatus().resetToken;
 bypass=true; await report('a',10); await report('b',10); assert.equal(raised,3); assert.equal(active,false);
 bypass=false; await a.evaluate(1000); token=a.getStatus().resetToken;
 await report('a',9); await report('b',9); assert.equal(raised,3);
 await report('a',10); await report('b',10); assert.equal(raised,4);
 await assert.rejects(a.updateConfig({frameThreshold:0}));
 await assert.rejects(a.updateConfig({enabled:'false'}));
 assert.deepEqual(saved,{enabled:true,frameThreshold:10});
 await a.clearNoCodeAlarm(); token=a.getStatus().resetToken;
 let attempts=0;
 a.__setDepsForTest({...testDeps, raiseAlarm: async () => { attempts++; active=true; throw new Error('serial unavailable'); }, retryAlarm: async () => { attempts++; }});
 await report('a',10); await assert.rejects(report('b',10));
 assert.equal(active,true);
 assert.ok(a.getStatus().lastAlarmAt,'logical alarm keeps timestamp even on hardware failure');
 await a.evaluate(1000); assert.equal(attempts,2,'failed hardware action must retry');
 await a.evaluate(1000); assert.equal(attempts,2,'successful alarm must not repeat');

 console.log('PASS: all-online counts, stale/duplicate reports, reset, bypass, config persistence/validation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
