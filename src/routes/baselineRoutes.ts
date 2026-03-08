import { Router, Request, Response } from "express";
import { saveParameter } from "../services/db";
import { logger } from "../utils/logger";

const router = Router();

const CV_CALIBRATION_URL =
  process.env.CV_CALIBRATION_URL || "http://weixing-cv:3001";

/**
 * POST /api/baseline/run-calibration
 *
 * 1. 调用 CV 服务的 /run-baseline-calibration 获取新的 baseline 值
 * 2. 将新 baseline 写入 parameters (computerVisionBaselineMat)
 */
router.post("/run-calibration", async (req: Request, res: Response) => {
  try {
    const cvUrl = `${CV_CALIBRATION_URL}/run-baseline-calibration`;
    logger.info(`调用 CV 标定: ${cvUrl}`);

    // 转发请求体（如 min_images_per_camera: 10）
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const cvResponse = await fetch(cvUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // 120s 超时（多帧标定更耗时）
    });

    if (!cvResponse.ok) {
      const text = await cvResponse.text();
      throw new Error(`CV 服务返回 ${cvResponse.status}: ${text}`);
    }

    const cvData = await cvResponse.json();

    if (!cvData.success || !cvData.baseline) {
      const errMsg = cvData.error || "CV 标定失败";
      logger.error(`CV 标定失败: ${errMsg}`);
      return res.status(400).json({
        success: false,
        error: errMsg,
      });
    }

    const baseline = cvData.baseline;

    // 写入 parameters
    await saveParameter("computerVisionBaselineMat", baseline);

    logger.info("Baseline 已更新并写入数据库");
    return res.json({
      success: true,
      message: "Baseline 标定完成并已保存",
      baseline,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Baseline 标定失败: ${errMsg}`);

    // 网络错误（CV 服务不可达）
    if (
      errMsg.includes("fetch failed") ||
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("ETIMEDOUT")
    ) {
      return res.status(503).json({
        success: false,
        error: `无法连接 CV 标定服务 (${CV_CALIBRATION_URL})，请确认 weixing-cv 已启动`,
      });
    }

    return res.status(500).json({
      success: false,
      error: errMsg,
    });
  }
});

export default router;
