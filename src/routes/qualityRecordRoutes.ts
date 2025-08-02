import { Router } from "express";
import {
  createQualityRecord,
  batchCreateQualityRecords,
  getQualityRecords,
  getQualityRecordsStatsBySecond,
  getQualityRecordsStatsBySecondAndIp,
  getQualityRecord,
  updateQualityRecord,
  updatePassToIgnored,
  updateFailToInReview,
  deleteQualityRecord,
  getImage,
  getStorageInfo,
  triggerEmergencyCleanup,
  checkAndAutoClean,
  triggerRegularCleanup,
} from "../controllers/qualityRecordController";
import { Request, Response } from "express";
import { checkPoolHealth } from "../services/pg-pool";

const router = Router();

// 图片获取路由 - 支持子目录结构
router.get("/images/*", getImage);

// 存储空间信息路由
router.get("/storage-info", getStorageInfo);

// 常规清理路由
router.post("/regular-cleanup", triggerRegularCleanup);

// 紧急清理路由
router.post("/emergency-cleanup", triggerEmergencyCleanup);

// 自动检查并清理路由
router.post("/auto-check-cleanup", checkAndAutoClean);

// 批量创建质量检测记录
router.post("/batch", batchCreateQualityRecords);

// 创建质量检测记录
router.post("/", createQualityRecord);

// 批量更新状态
router.post("/update-status/pass-to-ignored", updatePassToIgnored);
router.post("/update-status/fail-to-inreview", updateFailToInReview);

// 获取按秒分组的统计信息
router.get("/by-second", getQualityRecordsStatsBySecond);

// 获取按秒和IP分组的统计信息
router.get("/by-second/by-ip", getQualityRecordsStatsBySecondAndIp);

// 获取质量检测记录列表
router.get("/", getQualityRecords);

// 获取单条质量检测记录
router.get("/:client_ip/:timestamp", getQualityRecord);

// 更新质量检测记录
router.put("/:client_ip/:timestamp", updateQualityRecord);

// 删除质量检测记录
router.delete("/:client_ip/:timestamp", deleteQualityRecord);

// 添加连接池状态监控端点
router.get("/pool-status", async (req: Request, res: Response) => {
  try {
    const poolHealth = await checkPoolHealth();

    res.status(200).json({
      success: true,
      data: {
        healthy: poolHealth.healthy,
        connections: {
          total: poolHealth.totalConnections,
          idle: poolHealth.idleConnections,
          waiting: poolHealth.waitingClients,
          active: poolHealth.totalConnections - poolHealth.idleConnections,
        },
        error: poolHealth.error,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: `获取连接池状态失败: ${errorMessage}`,
    });
  }
});

export default router;
