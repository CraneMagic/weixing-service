import assert from 'node:assert/strict';
const alarm = require('../src/services/alarm-state');
const hardware = require('../src/services/light-hardware');
const serial = require('../src/services/serial');
const flush = () => new Promise<void>(r => setImmediate(r));
async function main() {
  let reds=0, greens=0, pulses=0;
  alarm.__resetAlarmStateForTest();
  alarm.__setLightControlForTest({applyAlarm:async()=>{reds++;},applyNormal:async()=>{greens++;},signalPiece:()=>{pulses++;}});
  await Promise.all(Array.from({length:100},()=>alarm.raiseAlarm('defect')));
  assert.equal(reds,1,'100 repeated raises send one static red sequence');
  assert.equal(pulses,100,'every raise still invokes the per-piece signal');
  await alarm.raiseAlarm('noCode'); await alarm.clearAlarm('defect');
  assert.equal(greens,0); await alarm.clearAlarm('noCode'); assert.equal(greens,1);

  alarm.__resetAlarmStateForTest();
  let lateRaise:Promise<void>|undefined; let lateReds=0;
  alarm.__setLightControlForTest({
    applyAlarm:async()=>{lateReds++;},
    applyNormal:async()=>{queueMicrotask(()=>queueMicrotask(()=>{lateRaise=alarm.raiseAlarm('defect');}));},
  });
  await alarm.initializeAlarmLight();await lateRaise;
  assert.equal(lateReds,1,'raise in synchronization completion window waits for red delivery');
  assert.equal(alarm.getAlarmState().syncPending,false);

  let offs=0;
  alarm.__setLightControlForTest({applyAlarm:async()=>{reds++;},applyNormal:async()=>{},applyOff:async()=>{offs++;}});
  await alarm.raiseAlarm('defect');
  await alarm.turnOffAlarmLights(); assert.equal(offs,1);
  const before=reds;await alarm.raiseAlarm('defect');assert.equal(reds,before+1,'raise after manual off must restore red');

  const originalSend=serial.sendHexCommand, originalOn=serial.turnOnRelay2, originalOff=serial.turnOffRelay2;
  try {
    let release!:()=>void; const commands:string[]=[];
    serial.sendHexCommand=async(bytes:number[])=>{const cmd=Buffer.from(bytes).toString('hex');commands.push(cmd);if(commands.length===1)await new Promise<void>(r=>{release=r;});return true;};
    serial.turnOnRelay2=async()=>{commands.push('relay-on');return true;};
    serial.turnOffRelay2=async()=>{commands.push('relay-off');return true;};
    alarm.__resetAlarmStateForTest();
    alarm.__setLightControlForTest({applyAlarm:hardware.applyAlarmState,applyNormal:hardware.applyNormalState,signalPiece:()=>{}});
    const raising=alarm.raiseAlarm('defect'); await flush();
    const clearing=alarm.clearAlarm('defect'); release(); await Promise.all([raising,clearing]);
    assert.equal(commands.includes('a00301a4'),false,'clear skips unstarted stale red command');
    assert.equal(commands.includes('relay-on'),false);
    assert.equal(commands.at(-1),'relay-off');
  } finally {serial.sendHexCommand=originalSend;serial.turnOnRelay2=originalOn;serial.turnOffRelay2=originalOff;}

  // A new alarm interrupts a partially delivered green sequence as well.
  const savedSend=serial.sendHexCommand;
  try {
    let release!:()=>void; let block=false; const commands:string[]=[];
    serial.sendHexCommand=async(bytes:number[])=>{const cmd=Buffer.from(bytes).toString('hex');commands.push(cmd);if(block){block=false;await new Promise<void>(r=>{release=r;});}return true;};
    serial.turnOnRelay2=async()=>true;serial.turnOffRelay2=async()=>true;
    alarm.__resetAlarmStateForTest();
    alarm.__setLightControlForTest({applyAlarm:hardware.applyAlarmState,applyNormal:hardware.applyNormalState});
    await alarm.raiseAlarm('defect');commands.length=0;block=true;
    const clearing=alarm.clearAlarm('defect');await flush();
    const raising=alarm.raiseAlarm('defect');release();await Promise.all([clearing,raising]);
    assert.equal(commands.includes('a00201a3'),false,'new red skips obsolete green-on');
    assert.equal(commands.at(-1),'a00301a4');
    assert.equal(alarm.getAlarmState().alarming,true);
  } finally {serial.sendHexCommand=savedSend;serial.turnOnRelay2=originalOn;serial.turnOffRelay2=originalOff;}

  alarm.__resetAlarmStateForTest(); reds=0;pulses=0;
  alarm.__setLightControlForTest({applyAlarm:async()=>{reds++;if(reds===1)throw Error('offline');},applyNormal:async()=>{},signalPiece:()=>{pulses++;}});
  await assert.rejects(alarm.raiseAlarm('defect'));
  await alarm.retryPendingNormal(); assert.equal(reds,2);assert.equal(pulses,1,'retry does not repeat pulse');

  // A rejected previous synchronization must not reject a newer target.
  alarm.__resetAlarmStateForTest();let failureWindowRaise:Promise<void>|undefined;reds=0;
  alarm.__setLightControlForTest({applyAlarm:async()=>{reds++;},applyNormal:async()=>{
    queueMicrotask(()=>queueMicrotask(()=>{failureWindowRaise=alarm.raiseAlarm('defect');void failureWindowRaise!.catch(()=>{});}));
    throw Error('obsolete green failure');
  }});
  await assert.rejects(alarm.initializeAlarmLight(),/obsolete green/);
  await failureWindowRaise;assert.equal(reds,1);assert.equal(alarm.getAlarmState().syncPending,false);

  // Disconnect/reconnect invalidates delivery, but never replays a piece signal.
  alarm.__resetAlarmStateForTest();reds=0;pulses=0;
  alarm.__setLightControlForTest({applyAlarm:async()=>{reds++;},applyNormal:async()=>{},signalPiece:()=>{pulses++;}});
  await alarm.raiseAlarm('defect');
  serial.getSerialEventEmitter().emit('close',serial.SerialPortType.ALARM);
  serial.getSerialEventEmitter().emit('open',serial.SerialPortType.ALARM);
  assert.equal(alarm.getAlarmState().syncPending,true);
  await alarm.retryPendingNormal();assert.equal(reds,2);assert.equal(pulses,1);
  serial.getSerialEventEmitter().emit('error',Error('relay disconnected'),serial.SerialPortType.RELAY);
  await alarm.retryPendingNormal();assert.equal(reds,3);assert.equal(pulses,1);

  // Exercise the real no-code retry path, rather than just the lamp retry helper.
  const noCode=require('../src/services/no-code-alarm');
  alarm.__resetAlarmStateForTest();reds=0;pulses=0;
  alarm.__setLightControlForTest({applyAlarm:async()=>{if(++reds===1)throw Error('red unavailable');},applyNormal:async()=>{},signalPiece:()=>{pulses++;}});
  noCode.__setDepsForTest({loadConfig:async()=>null,saveConfig:async()=>{},isBypassActive:async()=>false});
  await noCode.updateConfig({enabled:true,frameThreshold:300});
  await assert.rejects(noCode.reportCamera({clientIp:'a',hasCode:false,consecutiveNoCodeFrames:300,frameAgeMs:0,resetToken:noCode.getStatus().resetToken,sessionId:'a',sequence:1}));
  await noCode.evaluate();assert.equal(reds,2);assert.equal(pulses,1,'no-code retry must not replay piece signal');
  console.log('PASS: latest target deduplication, independent pulse, stale command cancellation, red retry');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
