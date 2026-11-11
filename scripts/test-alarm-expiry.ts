import assert from 'node:assert/strict';
const alarm = require('../src/services/alarm-state');
const { runAlarmExpiry, ALARM_EXPIRY_MS } = require('../src/services/alarm-expiry');
async function main() {
 const originalNow=Date.now;let now=1_800_000_000_000,green=0;
 Date.now=()=>now;
 alarm.__setLightControlForTest({applyAlarm:async()=>{},applyNormal:async()=>{green++;}});
 try {
  alarm.__resetAlarmStateForTest();await alarm.raiseAlarm('defect');
  now+=ALARM_EXPIRY_MS-1;
  await runAlarmExpiry(now,async()=>({expired:0,hasPending:false}));
  assert.equal(alarm.isReasonActive('defect'),true,'not yet two hours');
  now+=1;await runAlarmExpiry(now,async()=>({expired:1,hasPending:false}));
  assert.equal(alarm.isReasonActive('defect'),false);assert.equal(green,1);
  await alarm.raiseAlarm('defect');await alarm.raiseAlarm('noCode');now+=ALARM_EXPIRY_MS;
  await runAlarmExpiry(now,async()=>({expired:1,hasPending:false}));
  assert.deepEqual(alarm.getAlarmState().reasons,['noCode']);assert.equal(green,1,'other reason keeps lamp red');
  alarm.__resetAlarmStateForTest();await alarm.raiseAlarm('defect');now+=ALARM_EXPIRY_MS;
  await runAlarmExpiry(now,async()=>({expired:1,hasPending:true}));
  assert.equal(alarm.isReasonActive('defect'),true,'a newer pending record prevents clearing');
  await runAlarmExpiry(now,async()=>{await alarm.raiseAlarm('defect');return {expired:1,hasPending:false};});
  assert.equal(alarm.isReasonActive('defect'),true,'new alarm arriving during DB scan must survive');
  now+=ALARM_EXPIRY_MS;
  alarm.__setLightControlForTest({applyAlarm:async()=>{},applyNormal:async()=>{throw Error('relay failed');}});
  await assert.rejects(runAlarmExpiry(now,async()=>({expired:0,hasPending:false})),/relay failed/);
  assert.equal(alarm.getAlarmState().normalSyncPending,true);
  console.log('PASS: two-hour boundary, independent causes, live records, concurrent new raise, hardware recovery');
 } finally {Date.now=originalNow;alarm.__setLightControlForTest(null);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
