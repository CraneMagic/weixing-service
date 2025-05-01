import express from "express";
import { z } from "zod";
import { rebootDevice, executeCommand, disconnectSSH } from "../services/ssh";
import { logger } from "../utils/logger";

// 命令验证模式
const commandSchema = z.object({
  command: z.string().min(1),
});

/**
 * 设置设备管理路由
 */
export function setupDeviceRoutes(): express.Router {
  const router = express.Router();

  // 重启设备
  router.post("/reboot", async (req, res) => {
    try {
      const result = await rebootDevice();

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.message,
        });
      }

      res.json(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`设备重启失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // 执行命令
  router.post("/command", async (req, res) => {
    try {
      const validation = commandSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "命令验证失败",
          details: validation.error.format(),
        });
      }

      const { command } = req.body;
      const result = await executeCommand(command);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error,
        });
      }

      res.json({
        success: true,
        output: result.output,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`执行命令失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // 断开SSH连接
  router.post("/disconnect", (req, res) => {
    try {
      disconnectSSH();
      res.json({
        success: true,
        message: "SSH连接已断开",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`断开SSH连接失败: ${errorMessage}`);
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  return router;
}
