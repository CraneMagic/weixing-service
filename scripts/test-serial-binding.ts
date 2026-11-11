import assert from 'node:assert/strict';
const { SerialPortStream } = require('@serialport/stream');
const locks = new Map<string, BindingPort>();
let failClose = true;
class BindingPort {
  isOpen = true;
  constructor(readonly path: string) {}
  async write(_data: Buffer) { if (!this.isOpen) throw new Error('closed'); }
  async close() {
    if (failClose) throw new Error('native close failed while holding exclusive lock');
    this.isOpen = false; locks.delete(this.path);
  }
  read() { return new Promise(() => {}); }
}
class DriverPort extends SerialPortStream {
  constructor(options: unknown) {
    super({...(options as object), binding: {open: async ({path}: {path:string}) => {
      if (locks.has(path)) throw new Error('exclusive serial lock is still held');
      const binding=new BindingPort(path); locks.set(path,binding); return binding;
    }}});
  }
}
const Module=require('node:module');
const load=Module._load;
Module._load=function(name:string,...args:unknown[]) {return name==='serialport'?{SerialPort:DriverPort}:load.call(this,name,...args);};
const serial=require('../src/services/serial');
Module._load=load;
async function main() {
  const type=serial.SerialPortType.ALARM;
  await serial.initializeSerialPort(type);
  assert.equal(await serial.closeSerialPort(type),false);
  assert.equal(locks.size,1,'native close failure still holds the device lock, even if the Node stream was destroyed');
  failClose=false;
  assert.equal(await serial.sendHexCommand([0xa0,0x02,0x01,0xa3],type),true,'next request must reclaim the old binding before opening another connection');
  assert.equal(locks.size,1);
  assert.equal(await serial.closeSerialPort(type),true);
  assert.equal(locks.size,0);
  console.log('PASS: real SerialPortStream reclaims a failed close before reconnecting to an exclusive device');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
