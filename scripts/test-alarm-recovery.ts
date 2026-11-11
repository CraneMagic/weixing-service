import assert from 'node:assert/strict';
const alarm: any = require('../src/services/alarm-state');
const hardware: any = require('../src/services/light-hardware');
const serial: any = require('../src/services/serial');
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

async function main() {
  let red = false, normalAttempts = 0, alarmSignals = 0;
  const control = {
    applyAlarm: async () => { red = true; alarmSignals++; },
    applyNormal: async () => {
      normalAttempts++;
      if (normalAttempts === 1) throw new Error('serial temporarily unavailable');
      red = false;
    },
  };
  alarm.__resetAlarmStateForTest(); alarm.__setLightControlForTest(control);
  await alarm.raiseAlarm('defect');
  await assert.rejects(alarm.clearAlarm('defect'));
  assert.equal(alarm.getAlarmState().normalSyncPending, true, 'failed green command must remain pending');
  assert.match(alarm.getAlarmState().normalSyncError, /serial temporarily unavailable/);
  assert.equal(red, true);
  await alarm.retryPendingNormal();
  assert.equal(red, false); assert.equal(alarm.getAlarmState().normalSyncPending, false);
  assert.equal(alarmSignals, 1, 'green retry must never replay the eject pulse');

  // A new alarm after failed normal supersedes the old normal retry.
  alarm.__resetAlarmStateForTest(); normalAttempts = 0; alarmSignals = 0;
  await alarm.raiseAlarm('noCode'); await assert.rejects(alarm.clearAllAlarms());
  await alarm.raiseAlarm('defect'); await alarm.retryPendingNormal();
  assert.equal(alarm.isReasonActive('defect'), true); assert.equal(red, true);
  assert.equal(normalAttempts, 1, 'retry must not green a newly active alarm');

  // Shared hardware transitions cannot interleave a clear with a newer raise.
  alarm.__resetAlarmStateForTest();
  let releaseNormal!: () => void;
  const order: string[] = [];
  alarm.__setLightControlForTest({
    applyAlarm: async () => { order.push('alarm'); red = true; },
    applyNormal: async () => { order.push('normal-start'); await new Promise<void>(r => {releaseNormal=r;}); red=false; order.push('normal-end'); },
  });
  await alarm.raiseAlarm('defect');
  const clearing = alarm.clearAlarm('defect'); await flush();
  const raising = alarm.raiseAlarm('defect'); await flush();
  assert.deepEqual(order, ['alarm', 'normal-start']);
  releaseNormal(); await Promise.all([clearing, raising]);
  assert.deepEqual(order, ['alarm', 'normal-start', 'normal-end', 'alarm']); assert.equal(red, true);
  await alarm.raiseAlarm('defect'); assert.equal(order.filter(x => x==='alarm').length, 2, 'repeated defect does not resend static red state');

  const beforeStartup = order.length;
  await alarm.initializeAlarmLight();
  assert.equal(order.length, beforeStartup, 'startup must not green an active alarm');

  // The scheduled recovery uses the same reconciliation without external traffic.
  alarm.__resetAlarmStateForTest(); normalAttempts=0;
  alarm.__setLightControlForTest(control);
  await alarm.raiseAlarm('defect'); await assert.rejects(alarm.clearAlarm('defect'));
  alarm.startAlarmRecoveryMonitor();
  try {
    const deadline = Date.now()+3500;
    while (alarm.getAlarmState().normalSyncPending && Date.now()<deadline) await new Promise(r=>setTimeout(r,20));
    assert.equal(red,false,'background monitor must retry without user clicking again');
  } finally { alarm.stopAlarmRecoveryMonitor(); }

  // Boolean transport failures must not be logged/reported as a successful normal transition.
  const originalSend=serial.sendHexCommand, originalRelay=serial.turnOffRelay2;
  try {
    serial.sendHexCommand=async()=>false; serial.turnOffRelay2=async()=>true;
    await assert.rejects(hardware.applyNormalState(), /失败/);
    serial.sendHexCommand=async()=>true; serial.turnOffRelay2=async()=>false;
    await assert.rejects(hardware.applyNormalState(), /失败/);
  } finally {serial.sendHexCommand=originalSend;serial.turnOffRelay2=originalRelay;}
  console.log('PASS: normal recovery retry, no extra alarm pulse, new-alarm safety, serial order, transport failures');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
