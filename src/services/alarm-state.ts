import { applyAlarmState, applyNormalState } from "./light-hardware";
import { logger } from "../utils/logger";

/**
 * 报警原因集合。
 *
 * 红绿灯是全系统共用的一盏，有两个报警来源：
 *   - defect：表面检测 label=fail（tcp-server 每帧触发）
 *   - noCode：所有在线相机各自连续无喷码达到配置张数
 *
 * 之前两者都直接调 /api/light/alarm 和 /api/light/normal，导致清除任一种报警
 * 都会把另一种的灯一起灭掉。这里用一个原因集合收口：
 *   - raise：每次都执行硬件动作（fail 每帧要触发继电器4脉冲给下游剔除设备，不能去重），
 *            同时把原因记进集合
 *   - clear：移除该原因，只有集合空了才恢复绿灯
 */

export type AlarmReason = "defect" | "noCode";

export const ALARM_REASONS: AlarmReason[] = ["defect", "noCode"];

export const isAlarmReason = (v: unknown): v is AlarmReason =>
  typeof v === "string" && (ALARM_REASONS as string[]).includes(v);

const activeReasons = new Set<AlarmReason>();
let normalSyncPending = false;
let normalSyncError: string | null = null;
let operations: Promise<unknown> = Promise.resolve();
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let recovering = false;

// All alarm sources share the lamp: never interleave a normal sequence with a newer raise.
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = operations.then(work);
  operations = result.catch(() => {});
  return result;
}
async function applyNormalTracked(): Promise<void> {
  normalSyncPending = true;
  try {
    await lightControl.applyNormal();
    normalSyncPending = false;
    normalSyncError = null;
  } catch (error) {
    normalSyncError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// 灯控动作，测试时可注入替身
interface LightControl {
  applyAlarm: () => Promise<void>;
  applyNormal: () => Promise<void>;
}

let lightControl: LightControl = {
  applyAlarm: applyAlarmState,
  applyNormal: applyNormalState,
};

/**
 * 触发报警。每次调用都执行硬件动作（红灯+蜂鸣+继电器2+继电器4脉冲），
 * 因为继电器4脉冲是逐件信号，不能因为灯已经红着就跳过。
 */
export const raiseAlarm = async (
  reason: AlarmReason,
  detail?: string
): Promise<void> => serialize(async () => {
  activeReasons.add(reason);
  // A new alarm supersedes a pending green command. Never retry green against it.
  normalSyncPending = false;
  normalSyncError = null;
  await lightControl.applyAlarm();
  logger.info(
    `报警已触发: ${reason}${detail ? ` (${detail})` : ""}，当前报警原因: ${[
      ...activeReasons,
    ].join(", ")}`
  );
});

/**
 * 清除某一个报警原因。只有所有原因都清除后才恢复绿灯。
 * 返回是否已恢复到正常状态。
 */
export const clearAlarm = (reason: AlarmReason): Promise<boolean> => serialize(async () => {
  activeReasons.delete(reason);

  if (activeReasons.size > 0) {
    logger.info(
      `已清除报警原因 ${reason}，仍有未清除的原因: ${[...activeReasons].join(
        ", "
      )}，保持报警状态`
    );
    return false;
  }

  await applyNormalTracked();
  logger.info(`已清除报警原因 ${reason}，无剩余原因，已恢复正常状态`);
  return true;
});

/** 清除全部报警原因并恢复绿灯（/api/light/normal 走这条路，保证状态自洽） */
export const clearAllAlarms = (): Promise<void> => serialize(async () => {
  activeReasons.clear();
  await applyNormalTracked();
  logger.info("已清除全部报警原因，恢复正常状态");
});

/** Startup uses the same queue and must not overwrite an alarm raised during initialization. */
export const initializeAlarmLight = (): Promise<void> => serialize(async () => {
  if (activeReasons.size === 0) await applyNormalTracked();
});

/** Retry only the failed normal transition; never replay an alarm/eject pulse. */
export const retryPendingNormal = (): Promise<void> => serialize(async () => {
  if (!normalSyncPending) return;
  if (activeReasons.size > 0) {
    normalSyncPending = false;
    normalSyncError = null;
    return;
  }
  await applyNormalTracked();
  logger.info("恢复绿灯指令重试成功");
});

export function startAlarmRecoveryMonitor(): void {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(() => {
    if (!normalSyncPending || recovering) return;
    recovering = true;
    retryPendingNormal()
      .catch(error => logger.error(`恢复绿灯指令失败，将继续重试: ${error}`))
      .finally(() => { recovering = false; });
  }, 2000);
}
export function stopAlarmRecoveryMonitor(): void {
  if (recoveryTimer) clearInterval(recoveryTimer);
  recoveryTimer = null;
}

export const isReasonActive = (reason: AlarmReason): boolean =>
  activeReasons.has(reason);

export const getAlarmState = () => ({
  alarming: activeReasons.size > 0,
  reasons: [...activeReasons],
  // This describes command delivery, not physical feedback from the lamp.
  normalSyncPending,
  normalSyncError,
});

/** 仅供测试 */
export const __resetAlarmStateForTest = (): void => {
  activeReasons.clear();
  normalSyncPending = false;
  normalSyncError = null;
};

/** 仅供测试：替换灯控动作，避免真的去操作串口 */
export const __setLightControlForTest = (control: LightControl | null): void => {
  lightControl = control ?? {
    applyAlarm: applyAlarmState,
    applyNormal: applyNormalState,
  };
};
