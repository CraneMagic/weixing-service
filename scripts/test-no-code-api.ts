import assert from "node:assert/strict";
import express from "express";
import router from "../src/routes/noCodeAlarmRoutes";
import { __setDepsForTest } from "../src/services/no-code-alarm";

let saved: unknown = {enabled: true, frameThreshold: 300};
__setDepsForTest({
  loadConfig: async () => saved as {enabled: boolean; frameThreshold: number},
  saveConfig: async value => {saved = value;},
  isBypassActive: async () => false,
  clearAlarm: async () => {},
  raiseAlarm: async () => {},
  isNoCodeAlarmActive: () => false,
});
async function main() {
  const app = express(); app.use(express.json()); app.use("/api/no-code", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as {port: number};
  const base = `http://127.0.0.1:${address.port}/api/no-code`;
  const post = (path: string, body: unknown) => fetch(base+path, {
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
  });
  try {
    let res = await fetch(base+"/status");
    const data = (await res.json() as any).data;
    assert.equal(data.frameThreshold,300);
    for(const value of [0,-1,1.5,"300",null]) {
      res = await post("/config",{frameThreshold:value}); assert.equal(res.status,400);
    }
    res=await post("/config",{enabled:"false"}); assert.equal(res.status,400);
    res=await post("/report",{clientIp:"a",hasCode:false,frameAgeMs:0});
    assert.equal(res.status,400,"legacy status-only report is not a frame count");
    const report={clientIp:"a",hasCode:false,consecutiveNoCodeFrames:300,frameAgeMs:0,resetToken:null,sessionId:"test",sequence:1};
    res=await post("/report",report); assert.equal(res.status,200);
    assert.equal((await res.json() as any).data.cameras[0].consecutiveNoCodeFrames,0,"handshake must not count old frames");
    res=await post("/report",{...report,hasCode:true});
    assert.equal(res.status,400,"code=true cannot carry no-code counts");
    res=await post("/config",{frameThreshold:450}); assert.equal(res.status,200);
    assert.deepEqual(saved,{enabled:true,frameThreshold:450});
    res=await post("/clear",{}); assert.equal(res.status,200);
    console.log("PASS: actual HTTP routes, input validation, reset handshake, partial configuration");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
