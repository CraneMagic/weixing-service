import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import express from 'express';

// Replace only the physical driver; use the real serial, hardware, alarm queue and HTTP controller.
process.env.SERIAL_OPERATION_TIMEOUT_MS = '40';
let loseRelayOn = false;
let loseOpen = false;
let failRelayOff = false;
let loseClose = false;
const ports: FakePort[] = [];
let lateWrite: (() => void) | undefined;
let lateOpen: (() => void) | undefined;
class FakePort extends EventEmitter {
  isOpen = false;
  destroyed = false;
  writes: string[] = [];
  path: string;
  baudRate: number;
  constructor(options: {path: string; baudRate: number}) {
    super(); this.path = options.path; this.baudRate = options.baudRate; ports.push(this);
  }
  pipe(parser: unknown) { return parser; }
  unpipe() { return this; }
  open(callback: (error?: Error) => void) {
    const complete = () => { this.isOpen = true; this.emit('open'); callback(); };
    if (loseOpen) { loseOpen = false; lateOpen = complete; return; }
    setImmediate(complete);
  }
  write(data: Buffer, callback: (error?: Error) => void) {
    const hex = data.toString('hex'); this.writes.push(hex);
    if (this.path.includes('relay') || this.path.endsWith('USB1')) {
      if (loseRelayOn && hex === 'a00201a3') { loseRelayOn = false; lateWrite = () => callback(); return; }
      if (failRelayOff && hex === 'a00200a2') { failRelayOff = false; setImmediate(() => callback(new Error('relay off failed'))); return; }
    }
    setImmediate(() => callback());
  }
  close(callback: (error?: Error) => void) {
    if (loseClose) { loseClose = false; return; }
    this.isOpen = false; this.emit('close'); callback();
  }
  destroy() { this.destroyed = true; return this; }
}
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name: string, ...args: unknown[]) {
  return name === 'serialport' ? {SerialPort: FakePort} : originalLoad.call(this, name, ...args);
};
const serial = require('../src/services/serial');
const alarm = require('../src/services/alarm-state');
const router = require('../src/routes/alarmRoutes').default;
Module._load = originalLoad;

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer=setTimeout(() => reject(new Error(label)), 800); })]); }
  finally { clearTimeout(timer!); }
}
async function main() {
  const app=express(); app.use(express.json()); app.use('/api/alarm',router);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/alarm`;
  const post=(path:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'defect'})});
  try {
    // First onsite cycle: an explicit relay error must stay retryable.
    assert.equal((await post('/raise')).status,200);
    failRelayOff=true;
    assert.equal((await post('/clear')).status,500);
    assert.equal(alarm.getAlarmState().normalSyncPending,true);
    assert.equal((await post('/clear')).status,200);

    // Second cycle: the relay write callback never arrives. Clear must not wait forever behind raise.
    loseRelayOn=true;
    const raising=post('/raise'); void raising.catch(()=>{});
    await bounded((async()=>{while(!lateWrite) await new Promise(r=>setImmediate(r));})(),'relay write did not start');
    assert.deepEqual(alarm.getAlarmState().reasons,['defect']);
    const cleared=await bounded(post('/clear'),'lost serial callback permanently blocked the alarm clear queue');
    assert.equal(cleared.status,200);
    assert.equal((await raising).status,200,'superseded alarm request settles after current green target succeeds');
    assert.deepEqual(alarm.getAlarmState().reasons,[]);
    assert.equal(alarm.getAlarmState().normalSyncPending,false);
    const writeCount=ports.reduce((n,p)=>n+p.writes.length,0);
    lateWrite!(); await new Promise(r=>setImmediate(r));
    assert.equal(ports.reduce((n,p)=>n+p.writes.length,0),writeCount,'late driver callback must not resume old alarm commands');
    console.log('PASS: two HTTP alarm cycles recover explicit errors and lost relay callbacks without a stuck clear');

    await serial.closeSerialPort(serial.SerialPortType.ALARM);
    loseOpen=true;
    await assert.rejects(bounded(serial.initializeSerialPort(serial.SerialPortType.ALARM),'serial open never returned'),/超时/);
    const openingPort=ports[ports.length-1];
    const before=ports.length;
    await Promise.all([serial.initializeSerialPort(serial.SerialPortType.ALARM),serial.initializeSerialPort(serial.SerialPortType.ALARM)]);
    assert.equal(ports.length,before+1,'concurrent reconnects must share one open');
    const currentPath=serial.getSerialStatus(serial.SerialPortType.ALARM);
    lateOpen!(); await new Promise(r=>setImmediate(r));
    assert.equal(openingPort.isOpen,false,'late open must be closed instead of becoming an orphan connection');
    assert.deepEqual(serial.getSerialStatus(serial.SerialPortType.ALARM),currentPath);
    console.log('PASS: lost open callback is bounded; reconnect is shared and late open cannot replace the current port');

    loseClose=true;
    assert.equal(await bounded(serial.closeSerialPort(serial.SerialPortType.ALARM),'serial close never returned'),false);
    assert.equal(serial.getSerialStatus(serial.SerialPortType.ALARM).isOpen,false);
    await serial.initializeSerialPort(serial.SerialPortType.ALARM);
    ports[ports.length-1].emit('error',new Error('device disconnected'));
    assert.equal(serial.getSerialStatus(serial.SerialPortType.ALARM).isOpen,false);
    console.log('PASS: close timeout and device error leave a reconnectable port without an unhandled error event');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
