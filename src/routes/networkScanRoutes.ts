import { Router, Request, Response } from "express";
import {
  scanNetwork,
  quickScan,
  DeviceInfo,
  NetworkScanResult,
} from "../controllers/networkScanController";
import { logger } from "../utils/logger";

const router = Router();

// 完整网络扫描接口
router.get("/scan", async (req: Request, res: Response) => {
  try {
    const { subnet } = req.query;

    logger.info(
      `收到网络扫描请求: ${subnet ? `子网=${subnet}` : "自动检测子网"}`
    );

    const result = await scanNetwork(subnet as string);

    if (result.success) {
      res.json({
        success: true,
        message: "网络扫描完成",
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "网络扫描失败",
        error: result.error,
        data: result,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("网络扫描接口错误:", errorMessage);

    res.status(500).json({
      success: false,
      message: "网络扫描接口错误",
      error: errorMessage,
    });
  }
});

// 快速网络扫描接口
router.get("/quick-scan", async (req: Request, res: Response) => {
  try {
    logger.info("收到快速网络扫描请求");

    const result = await quickScan();

    if (result.success) {
      res.json({
        success: true,
        message: "快速网络扫描完成",
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "快速网络扫描失败",
        error: result.error,
        data: result,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("快速网络扫描接口错误:", errorMessage);

    res.status(500).json({
      success: false,
      message: "快速网络扫描接口错误",
      error: errorMessage,
    });
  }
});

// 获取在线设备接口
router.get("/devices/online", async (req: Request, res: Response) => {
  try {
    logger.info("收到获取在线设备请求");

    const result = await quickScan();

    if (result.success) {
      const onlineDevices = result.devices.filter((device) => device.isAlive);

      res.json({
        success: true,
        message: "获取在线设备完成",
        data: {
          devices: onlineDevices,
          count: onlineDevices.length,
          scanTime: result.scanDuration,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "获取在线设备失败",
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("获取在线设备接口错误:", errorMessage);

    res.status(500).json({
      success: false,
      message: "获取在线设备接口错误",
      error: errorMessage,
    });
  }
});

// 获取所有设备接口（包括离线设备）
router.get("/devices/all", async (req: Request, res: Response) => {
  try {
    logger.info("收到获取所有设备请求");

    const result = await quickScan();

    if (result.success) {
      res.json({
        success: true,
        message: "获取所有设备完成",
        data: {
          devices: result.devices,
          totalCount: result.devices.length,
          onlineCount: result.aliveCount,
          offlineCount: result.devices.length - result.aliveCount,
          scanTime: result.scanDuration,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "获取所有设备失败",
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("获取所有设备接口错误:", errorMessage);

    res.status(500).json({
      success: false,
      message: "获取所有设备接口错误",
      error: errorMessage,
    });
  }
});

// 搜索特定设备接口
router.get("/devices/search", async (req: Request, res: Response) => {
  try {
    const { ip, mac, hostname } = req.query;

    if (!ip && !mac && !hostname) {
      return res.status(400).json({
        success: false,
        message: "请提供搜索条件（ip、mac或hostname）",
      });
    }

    logger.info(`收到设备搜索请求: ip=${ip}, mac=${mac}, hostname=${hostname}`);

    const result = await quickScan();

    if (result.success) {
      let filteredDevices = result.devices;

      if (ip) {
        filteredDevices = filteredDevices.filter((device) =>
          device.ip.includes(ip as string)
        );
      }

      if (mac) {
        filteredDevices = filteredDevices.filter(
          (device) =>
            device.mac &&
            device.mac.toLowerCase().includes((mac as string).toLowerCase())
        );
      }

      if (hostname) {
        filteredDevices = filteredDevices.filter(
          (device) =>
            device.hostname &&
            device.hostname
              .toLowerCase()
              .includes((hostname as string).toLowerCase())
        );
      }

      res.json({
        success: true,
        message: "设备搜索完成",
        data: {
          devices: filteredDevices,
          count: filteredDevices.length,
          searchCriteria: { ip, mac, hostname },
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "设备搜索失败",
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("设备搜索接口错误:", errorMessage);

    res.status(500).json({
      success: false,
      message: "设备搜索接口错误",
      error: errorMessage,
    });
  }
});

// 网络状态检查接口
router.get("/status", async (req: Request, res: Response) => {
  try {
    logger.info("收到网络状态检查请求");

    const result = await quickScan();

    res.json({
      success: true,
      message: "网络状态检查完成",
      data: {
        networkHealthy: result.success,
        totalDevices: result.devices.length,
        onlineDevices: result.aliveCount,
        offlineDevices: result.devices.length - result.aliveCount,
        scanDuration: result.scanDuration,
        lastScan: new Date().toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("网络状态检查接口错误:", errorMessage);

    res.status(500).json({
      success: false,
      message: "网络状态检查接口错误",
      error: errorMessage,
    });
  }
});

export default router;
