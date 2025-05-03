import express from "express";
import { z } from "zod";
import { rebootDevice, executeCommand, disconnectSSH } from "../services/ssh";
import { logger } from "../utils/logger";

// 命令验证模式
const commandSchema = z.object({
  command: z.string().min(1),
  ip: z.string().optional(), // 可选的设备 IP 地址
});

// 设备 IP 验证模式
const deviceSchema = z.object({
  ip: z.string().optional(), // 可选的设备 IP 地址
});

/**
 * 设置设备管理路由
 */
export function setupDeviceRoutes(): express.Router {
  const router = express.Router();

  // 重启设备
  router.post("/reboot", async (req, res) => {
    try {
      const validation = deviceSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "设备参数验证失败",
          details: validation.error.format(),
        });
      }

      const { ip } = req.body;
      const result = await rebootDevice(ip);

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

      const { command, ip } = req.body;
      const result = await executeCommand(command, ip);

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
      const validation = deviceSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "设备参数验证失败",
          details: validation.error.format(),
        });
      }

      const { ip } = req.body;
      disconnectSSH(ip);

      res.json({
        success: true,
        message: ip ? `与设备 ${ip} 的SSH连接已断开` : "所有SSH连接已断开",
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
