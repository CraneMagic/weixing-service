import express from "express";
import { z } from "zod";
import {
  initializeSerialPort,
  sendData,
  closeSerialPort,
  getSerialStatus,
} from "../services/serial";
import { logger } from "../utils/logger";

// 数据验证模式
const dataSchema = z.object({
  data: z.string().min(1),
});

/**
 * 设置串口通信路由
 */
export function setupSerialRoutes(): express.Router {
  const router = express.Router();

  // 打开串口
  router.post("/open", async (req, res) => {
    try {
      const success = await initializeSerialPort();

      if (!success) {
        return res.status(500).json({
          success: false,
          message: "无法打开串口",
        });
      }

      res.json({
        success: true,
        message: "串口已打开",
        status: getSerialStatus(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`打开串口失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // 关闭串口
  router.post("/close", async (req, res) => {
    try {
      const success = await closeSerialPort();

      if (!success) {
        return res.status(500).json({
          success: false,
          message: "关闭串口失败",
        });
      }

      res.json({
        success: true,
        message: "串口已关闭",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`关闭串口失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // 获取串口状态
  router.get("/status", (req, res) => {
    try {
      const status = getSerialStatus();
      res.json({
        success: true,
        status,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`获取串口状态失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // 发送数据
  router.post("/send", async (req, res) => {
    try {
      const validation = dataSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "数据验证失败",
          details: validation.error.format(),
        });
      }

      const { data } = req.body;
      const success = await sendData(data);

      if (!success) {
        return res.status(500).json({
          success: false,
          message: "发送数据失败",
        });
      }

      res.json({
        success: true,
        message: "数据已发送",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`发送数据失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  return router;
}
