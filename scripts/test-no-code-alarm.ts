/**
 * 无喷码报警 + 报警原因集合 测试
 *
 * 运行：npx ts-node scripts/test-no-code-alarm.ts
 *
 * 状态机接受显式 now，外部依赖（质量跳过、报警动作、灯控）全部可注入，
 * 因此可以纯同步推进虚拟时钟，不需要真的等 30 秒，也不碰串口和数据库。
 */

process.env.NO_CODE_ALARM_ENABLED = "true";

// 必须用 require：import 语句会被提升到上面的赋值之前，模块就读不到这个开关了
const noCodeAlarm: typeof import("../src/services/no-code-alarm") = require("../src/services/no-code-alarm");
const alarmState: typeof import("../src/services/alarm-state") = require("../src/services/alarm-state");

const {
  reportCamera,
  evaluate,
  getStatus,
  resetNoCodeAlarmState,
  __setDepsForTest,
} = noCodeAlarm;

const CAMS = ["192.168.1.120", "192.168.1.121", "192.168.1.122"];
const T0 = 1_700_000_000_000;

let passed = 0;
let failed = 0;

/**
 * 排空微任务队列。
 * evaluate() 触发的报警动作是异步的（先 await 质量跳过查询），
 * 同步的上报循环跑完时它还没落地，断言前必须先 flush。
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const check = (name: string, actual: unknown, expected: unknown) => {
  if (actual === expected) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name} —— 期望 ${expected}，实际 ${actual}`);
    failed++;
  }
};

// ==================== 无喷码状态机 ====================

let alarms: { detail: string }[] = [];
let bypassed = false;
// 模拟报警原因集合，用于验证 active 的派生
let noCodeReasonActive = false;

const setup = () => {
  resetNoCodeAlarmState();
  alarms = [];
  bypassed = false;
  noCodeReasonActive = false;
  __setDepsForTest({
    isBypassActive: async () => bypassed,
    raiseAlarm: async (detail) => {
      alarms.push({ detail });
      noCodeReasonActive = true;
    },
    isNoCodeAlarmActive: () => noCodeReasonActive,
  });
};

/** 三路相机在 [from, to] 区间内每秒各上报一次，frameAgeMs 视为 0（刚拿到新帧） */
const reportAll = (from: number, to: number, hasCode: boolean, cams = CAMS) => {
  for (let t = from; t <= to; t += 1000) {
    for (const ip of cams) reportCamera(ip, hasCode, 0, t);
  }
};

async function main() {
console.log("---- 无喷码状态机 ----");

// 1. 三路持续无喷码 30s → 报警一次
setup();
reportAll(T0, T0 + 30_000, false);
await flush();
check("三路持续无喷码 30 秒触发报警", alarms.length, 1);

// 2. 只持续 29s → 不报警
setup();
reportAll(T0, T0 + 29_000, false);
await flush();
check("持续 29 秒不报警", alarms.length, 0);

// 3. 中途某路检出喷码 → 计时清零
setup();
reportAll(T0, T0 + 20_000, false);
reportCamera(CAMS[1], true, 0, T0 + 21_000);
reportAll(T0 + 21_000, T0 + 40_000, false); // 距打断仅 19s
await flush();
check("中途检出喷码后计时清零", alarms.length, 0);

// 3b. 打断后重新满 30s → 报警
setup();
reportAll(T0, T0 + 20_000, false);
reportCamera(CAMS[1], true, 0, T0 + 21_000);
reportAll(T0 + 21_000, T0 + 55_000, false);
await flush();
check("打断后重新满 30 秒再报警", alarms.length, 1);

// 4. 只有 2 路上报 → 永不报警
setup();
reportAll(T0, T0 + 60_000, false, CAMS.slice(0, 2));
await flush();
check("只有 2 路相机时不报警", alarms.length, 0);

// 5. 某路 tcp-server 停止上报（停机/断线）→ 不报警
setup();
reportAll(T0, T0 + 5_000, false);
for (let t = T0 + 6_000; t <= T0 + 60_000; t += 1000) {
  reportCamera(CAMS[0], false, 0, t);
  reportCamera(CAMS[1], false, 0, t);
}
await flush();
check("某路停止上报时不报警", alarms.length, 0);

// 6. 相机还在上报，但那一路的帧本身很旧（相机卡死）→ 不报警
setup();
for (let t = T0; t <= T0 + 60_000; t += 1000) {
  reportCamera(CAMS[0], false, 0, t);
  reportCamera(CAMS[1], false, 0, t);
  reportCamera(CAMS[2], false, 10_000, t); // 最新帧已是 10 秒前
}
await flush();
check("某路帧陈旧时不报警", alarms.length, 0);

// 7. 报警后条件持续 → 每 30 秒再报一次
setup();
reportAll(T0, T0 + 60_000, false);
await flush();
check("条件持续时每 30 秒重复报警", alarms.length, 2);

// 8. 数据新鲜但未满 30s 不报警
setup();
reportAll(T0, T0 + 3_000, false);
evaluate(T0 + 4_000);
await flush();
check("数据新鲜但未满 30 秒不报警", alarms.length, 0);

// 9. 历史上出现过的第 4 个 IP 会被剔除，不能让判定永久失效
//    幽灵条目要等满 NO_CODE_STALE_MS 才被剔除，期间 size===4 判定不成立，
//    所以 30 秒窗口整体后移约 6 秒，60 秒内只够报一次（修复前是一次都不报）。
setup();
reportCamera("192.168.1.199", false, 0, T0); // 换 IP / 临时调试相机，只出现一次
reportAll(T0, T0 + 60_000, false);
await flush();
check("出现过第 4 个 IP 后仍能正常报警", alarms.length, 1);
await flush();
check(
  "陈旧的第 4 个 IP 已被移出状态表",
  getStatus(T0 + 60_000).cameras.length,
  3
);

// 10. 质量跳过期间：既不报警，也不能把 active 置起来（否则前端会弹横幅）
setup();
bypassed = true;
reportAll(T0, T0 + 60_000, false);
await flush();
check("质量跳过期间不报警", alarms.length, 0);
await flush();
check("质量跳过期间 active 保持 false", getStatus(T0 + 60_000).active, false);
await flush();
check("质量跳过期间不记录报警时刻", getStatus(T0 + 60_000).lastAlarmAt, null);

// 11. active 由报警原因集合派生：原因被清除后立刻变 false
setup();
reportAll(T0, T0 + 30_000, false);
await flush();
check("报警后 active 为 true", getStatus(T0 + 30_000).active, true);
noCodeReasonActive = false; // 模拟 /api/alarm/clear { reason: "noCode" }
await flush();
check("清除原因后 active 为 false", getStatus(T0 + 30_000).active, false);

// 12. 清除报警后条件仍成立 → 30 秒后再次报警
setup();
reportAll(T0, T0 + 30_000, false);
noCodeReasonActive = false;
reportAll(T0 + 31_000, T0 + 61_000, false);
await flush();
check("清除后问题未解决会再次报警", alarms.length, 2);

// ==================== 报警原因集合 ====================

console.log("\n---- 报警原因集合（共享的那盏灯）----");

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
check("重复 raise 每次都执行硬件动作", lightActions.length, 3);

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

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("测试执行异常:", err);
  process.exit(1);
});
