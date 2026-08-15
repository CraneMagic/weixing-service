import { Request, Response } from "express";
import { reportCamera, getStatus } from "../services/no-code-alarm";
import { logger } from "../utils/logger";

/**
 * 接收单路相机的喷码状态上报（由各 tcp-server 实例每秒调用）。
 *
 * body: { clientIp: string, hasCode: boolean, frameAgeMs: number }
 */
export async function reportNoCode(req: Request, res: Response) {
  try {
    const { clientIp, hasCode, frameAgeMs } = req.body ?? {};

    if (typeof clientIp !== "string" || !clientIp) {
      return res
        .status(400)
        .json({ success: false, message: "clientIp 不能为空" });
    }
    if (typeof hasCode !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "hasCode 必须是布尔值" });
    }

    reportCamera(clientIp, hasCode, Number(frameAgeMs) || 0);

    return res.status(200).json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`无喷码状态上报失败: ${message}`);
    return res.status(500).json({ success: false, message });
  }
}

/** 无喷码报警状态，供前端轮询 */
export async function getNoCodeStatus(req: Request, res: Response) {
  return res.status(200).json({ success: true, data: getStatus() });
}
