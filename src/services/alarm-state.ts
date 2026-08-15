import { applyAlarmState, applyNormalState } from "./light-hardware";
import { logger } from "../utils/logger";

/**
 * 报警原因集合。
 *
 * 红绿灯是全系统共用的一盏，有两个报警来源：
 *   - defect：表面检测 label=fail（tcp-server 每帧触发）
 *   - noCode：三路同时无喷码持续 30 秒
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
): Promise<void> => {
  activeReasons.add(reason);
  await lightControl.applyAlarm();
  logger.info(
    `报警已触发: ${reason}${detail ? ` (${detail})` : ""}，当前报警原因: ${[
      ...activeReasons,
    ].join(", ")}`
  );
};

/**
 * 清除某一个报警原因。只有所有原因都清除后才恢复绿灯。
 * 返回是否已恢复到正常状态。
 */
export const clearAlarm = async (reason: AlarmReason): Promise<boolean> => {
  activeReasons.delete(reason);

  if (activeReasons.size > 0) {
    logger.info(
      `已清除报警原因 ${reason}，仍有未清除的原因: ${[...activeReasons].join(
        ", "
      )}，保持报警状态`
    );
    return false;
  }

  await lightControl.applyNormal();
  logger.info(`已清除报警原因 ${reason}，无剩余原因，已恢复正常状态`);
  return true;
};

/** 清除全部报警原因并恢复绿灯（/api/light/normal 走这条路，保证状态自洽） */
export const clearAllAlarms = async (): Promise<void> => {
  activeReasons.clear();
  await lightControl.applyNormal();
  logger.info("已清除全部报警原因，恢复正常状态");
};

export const isReasonActive = (reason: AlarmReason): boolean =>
  activeReasons.has(reason);

export const getAlarmState = () => ({
  alarming: activeReasons.size > 0,
  reasons: [...activeReasons],
});

/** 仅供测试 */
export const __resetAlarmStateForTest = (): void => {
  activeReasons.clear();
};

/** 仅供测试：替换灯控动作，避免真的去操作串口 */
export const __setLightControlForTest = (control: LightControl | null): void => {
  lightControl = control ?? {
    applyAlarm: applyAlarmState,
    applyNormal: applyNormalState,
  };
};
