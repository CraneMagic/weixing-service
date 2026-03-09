import { Router, Request, Response } from "express";
import { saveParameter } from "../services/db";
import { logger } from "../utils/logger";

const CV_SERVICE_URL =
  process.env.CV_SERVICE_URL || "http://weixing-cv:3001";

const router = Router();

router.post("/run-calibration", async (req: Request, res: Response) => {
  try {
    logger.info("收到 baseline 标定请求，转发至 CV 服务...");

    const response = await fetch(
      `${CV_SERVICE_URL}/run-baseline-calibration`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(120_000),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      logger.warn(`CV 服务返回错误: ${response.status}`);
      return res.status(response.status).json(data);
    }

    // 标定成功 → 将新 baseline 写回 NeDB
    if (data.success && data.baseline) {
      try {
        await saveParameter("computerVisionBaselineMat", data.baseline);
        logger.info("新 baseline 已写入数据库");
      } catch (dbErr) {
        const dbMsg =
          dbErr instanceof Error ? dbErr.message : String(dbErr);
        logger.error(`baseline 写入数据库失败: ${dbMsg}`);
        // 标定本身成功，DB 写入失败不阻断返回
        data.db_warning = "标定成功但写入数据库失败，请手动刷新";
      }
    }

    return res.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`baseline 标定转发失败: ${msg}`);
    return res
      .status(502)
      .json({ success: false, error: `CV 服务请求失败: ${msg}` });
  }
});

export default router;
