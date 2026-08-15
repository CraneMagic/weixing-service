import { Request, Response } from "express";
import {
  raiseAlarm,
  clearAlarm,
  getAlarmState,
  isAlarmReason,
  ALARM_REASONS,
} from "../services/alarm-state";
import { logger } from "../utils/logger";

/**
 * 触发报警。body: { reason: "defect" | "noCode", detail?: string }
 *
 * 每次调用都会执行硬件动作（继电器4脉冲是逐件信号，不能去重）。
 */
export async function raiseAlarmByReason(req: Request, res: Response) {
  const { reason, detail } = req.body ?? {};

  if (!isAlarmReason(reason)) {
    return res.status(400).json({
      success: false,
      message: `reason 必须是 ${ALARM_REASONS.join(" | ")} 之一`,
    });
  }

  try {
    await raiseAlarm(reason, typeof detail === "string" ? detail : undefined);
    return res.status(200).json({ success: true, data: getAlarmState() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`触发报警失败 (${reason}): ${message}`);
    return res.status(500).json({ success: false, message });
  }
}

/**
 * 清除某一个报警原因。body: { reason: "defect" | "noCode" }
 * 只有所有原因都清除后才恢复绿灯。
 */
export async function clearAlarmByReason(req: Request, res: Response) {
  const { reason } = req.body ?? {};

  if (!isAlarmReason(reason)) {
    return res.status(400).json({
      success: false,
      message: `reason 必须是 ${ALARM_REASONS.join(" | ")} 之一`,
    });
  }

  try {
    const recovered = await clearAlarm(reason);
    return res
      .status(200)
      .json({ success: true, recovered, data: getAlarmState() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`清除报警失败 (${reason}): ${message}`);
    return res.status(500).json({ success: false, message });
  }
}

/** 当前报警状态（哪些原因还挂着） */
export async function getAlarmStatus(req: Request, res: Response) {
  return res.status(200).json({ success: true, data: getAlarmState() });
}
