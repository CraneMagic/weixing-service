/** Shared light regression. Frame-count state machine: test-no-code-frames.ts. */
const alarmState: typeof import("../src/services/alarm-state") = require("../src/services/alarm-state");
let passed = 0, failed = 0;
const flush = () => new Promise(resolve => setImmediate(resolve));
const check = (name: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { console.log(`✅ ${name}`); passed++; }
  else { console.error(`❌ ${name}: expected ${expected}, got ${actual}`); failed++; }
};
async function main() {
let lightActions: string[] = [];
alarmState.__setLightControlForTest({
  applyAlarm: async () => {
    lightActions.push("alarm");
  },
  applyNormal: async () => {
    lightActions.push("normal");
  },
});

const setupAlarmState = () => {
  alarmState.__resetAlarmStateForTest();
  lightActions = [];
};

// 13. 每次 raise 都要执行硬件动作（继电器4脉冲是逐件信号，不能去重）
setupAlarmState();
await alarmState.raiseAlarm("defect");
await alarmState.raiseAlarm("defect");
await alarmState.raiseAlarm("defect");
await flush();
check("重复 raise 不重复发送红灯状态", lightActions.length, 1);

// 14. 两种报警并存时，清除其一不能灭灯
setupAlarmState();
await alarmState.raiseAlarm("defect");
await alarmState.raiseAlarm("noCode");
lightActions = [];
const recoveredAfterFirst = await alarmState.clearAlarm("noCode");
await flush();
check("清除 noCode 时仍有 defect，未恢复正常", recoveredAfterFirst, false);
await flush();
check("清除 noCode 时没有下发绿灯指令", lightActions.length, 0);
await flush();
check("defect 仍然挂着", alarmState.isReasonActive("defect"), true);

// 15. 最后一个原因清除后才恢复绿灯
const recoveredAfterSecond = await alarmState.clearAlarm("defect");
await flush();
check("清除最后一个原因后恢复正常", recoveredAfterSecond, true);
await flush();
check("恢复正常时下发了绿灯指令", lightActions.join(","), "normal");

// 16. 清除不存在的原因不应误灭灯
setupAlarmState();
await alarmState.raiseAlarm("defect");
lightActions = [];
await alarmState.clearAlarm("noCode"); // 本来就没有
await flush();
check("清除未挂起的原因不影响仍挂起的报警", alarmState.isReasonActive("defect"), true);
await flush();
check("清除未挂起的原因不下发绿灯", lightActions.length, 0);

// 17. clearAllAlarms（/api/light/normal 的语义）清空全部并恢复绿灯
setupAlarmState();
await alarmState.raiseAlarm("defect");
await alarmState.raiseAlarm("noCode");
lightActions = [];
await alarmState.clearAllAlarms();
await flush();
check("clearAllAlarms 后无剩余原因", alarmState.getAlarmState().reasons.length, 0);
await flush();
check("clearAllAlarms 下发了绿灯指令", lightActions.join(","), "normal");

const noCode = require("../src/services/no-code-alarm");
const lightController = require("../src/controllers/lightController");
noCode.__setDepsForTest({
  loadConfig: async () => null, saveConfig: async () => {}, isBypassActive: async () => false,
});
await noCode.updateConfig({enabled: true, frameThreshold: 300});
const before = noCode.getStatus().resetToken;
await alarmState.raiseAlarm("defect");
await noCode.reportCamera({clientIp:"a",hasCode:false,consecutiveNoCodeFrames:300,frameAgeMs:0,resetToken:before,sessionId:"test",sequence:1});
const response = {status: (_: number) => response, json: (body: unknown) => body};
await lightController.setNormalState({}, response);
check("全局恢复绿灯也重置无喷码计数", noCode.getStatus().resetToken !== before, true);
await noCode.evaluate();
check("全局清除后旧计数不会再次报警", alarmState.getAlarmState().alarming, false);

let failNormal = true;
alarmState.__setLightControlForTest({
  applyAlarm: async () => {},
  applyNormal: async () => { if (failNormal) { failNormal = false; throw new Error("normal hardware failed"); } },
});
let clearFailed = false;
try { await noCode.clearNoCodeAlarm(true); } catch { clearFailed = true; }
check("模拟恢复绿灯失败", clearFailed, true);
await alarmState.raiseAlarm("defect");
await noCode.evaluate();
check("重试恢复绿灯不能清除新来的缺陷报警", alarmState.isReasonActive("defect"), true);

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("测试执行异常:", err);
  process.exit(1);
});
