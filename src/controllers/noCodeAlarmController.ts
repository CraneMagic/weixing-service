import { Request, Response } from "express";
import { z } from "zod";
import { reportCamera, getStatus, initializeNoCodeAlarm, updateConfig, validateConfig, clearNoCodeAlarm } from "../services/no-code-alarm";
import { logger } from "../utils/logger";

const reportSchema = z.object({
  clientIp: z.string().min(1).max(100),
  hasCode: z.boolean(),
  frameAgeMs: z.number().finite().nonnegative(),
  consecutiveNoCodeFrames: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resetToken: z.string().nullable(),
  sessionId: z.string().min(1).max(100),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine(r => !r.hasCode || r.consecutiveNoCodeFrames === 0, "有喷码时连续计数必须为零");

export async function reportNoCode(req: Request, res: Response) {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "无效的逐帧计数上报", details: parsed.error.flatten() });
  try {
    const data = await reportCamera(parsed.data);
    return res.json({ success: true, data });
  } catch (error) { return fail(res, error); }
}
function fail(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`无喷码报警操作失败: ${message}`);
  return res.status(500).json({ success: false, message });
}
export async function getNoCodeStatus(req: Request, res: Response) {
  try { await initializeNoCodeAlarm(); return res.json({ success: true, data: getStatus() }); }
  catch (error) { return fail(res, error); }
}
export async function setNoCodeConfig(req: Request, res: Response) {
  try { validateConfig(req.body); }
  catch (error) { return res.status(400).json({ success: false, message: (error as Error).message }); }
  try { return res.json({ success: true, data: await updateConfig(req.body) }); }
  catch (error) { return fail(res, error); }
}
export async function clearNoCode(req: Request, res: Response) {
  try { await clearNoCodeAlarm(); return res.json({ success: true, data: getStatus() }); }
  catch (error) { return fail(res, error); }
}
