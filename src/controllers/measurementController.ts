import { Request, Response } from "express";
import {
  saveMeasurement,
  getRecentMeasurements,
  getMeasurementById,
  getComplianceStats,
  getStatsBySpec,
  getTrendData,
  cleanupOldData,
  optimizeDatabase,
} from "../services/db-sqlite";
import { getParameter } from "../services/db";
import { logger } from "../utils/logger";

/**
 * 保存测量数据
 */
export async function createMeasurement(req: Request, res: Response) {
  try {
    const data = req.body;

    if (
      !data ||
      !data.timestamp ||
      !data.specId ||
      !data.correctedData ||
      !data.resultData
    ) {
      return res.status(400).json({
        success: false,
        message: "缺少必要的测量数据",
      });
    }

    // 获取关联的规格信息
    const specKey = req.body.specId || (req.query.specKey as string);
    let specInfo = undefined;

    if (specKey) {
      try {
        // 从nedb获取规格详情
        const pipeSpecifications = await getParameter("pipeSpecification");

        if (
          pipeSpecifications &&
          pipeSpecifications.value &&
          pipeSpecifications.value[specKey]
        ) {
          const specs = pipeSpecifications.value[specKey];
          specInfo = {
            id: specKey,
            name: specs.materialSpec || specKey,
            specs,
          };
        }
      } catch (error) {
        logger.warn(
          `获取规格信息失败: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const result = await saveMeasurement(data, specInfo);

    return res.status(201).json({
      success: true,
      message: "测量数据已保存",
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`保存测量数据失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `保存失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取最近的测量数据
 */
export async function getRecentData(req: Request, res: Response) {
  try {
    const hours = parseInt((req.query.hours as string) || "24", 10);
    const limit = parseInt((req.query.limit as string) || "1000", 10);
    const specId = req.query.specId as string;

    const data = await getRecentMeasurements(hours, limit, specId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取最近测量数据失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取单条测量数据
 */
export async function getMeasurement(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "无效的ID",
      });
    }

    const data = await getMeasurementById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "未找到测量数据",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取测量数据详情失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取合规性统计
 */
export async function getCompliance(req: Request, res: Response) {
  try {
    const startTime =
      (req.query.startTime as string) ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = (req.query.endTime as string) || new Date().toISOString();
    const specId = req.query.specId as string;

    const stats = await getComplianceStats(startTime, endTime, specId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取合规性统计失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取按规格分组的统计
 */
export async function getSpecStats(req: Request, res: Response) {
  try {
    const startTime =
      (req.query.startTime as string) ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = (req.query.endTime as string) || new Date().toISOString();

    const stats = await getStatsBySpec(startTime, endTime);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取规格统计失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取趋势数据
 */
export async function getTrend(req: Request, res: Response) {
  try {
    const startTime =
      (req.query.startTime as string) ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = (req.query.endTime as string) || new Date().toISOString();
    const interval = (req.query.interval as "hour" | "day") || "hour";
    const specId = req.query.specId as string;

    const data = await getTrendData(startTime, endTime, interval, specId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取趋势数据失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 清理过期数据
 */
export async function cleanup(req: Request, res: Response) {
  try {
    const daysToKeep = parseInt((req.query.days as string) || "90", 10);

    const count = await cleanupOldData(daysToKeep);

    return res.status(200).json({
      success: true,
      message: `已清理 ${count} 条过期数据`,
      data: { count },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`清理过期数据失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `清理失败: ${errorMessage}`,
    });
  }
}

/**
 * 优化数据库
 */
export async function optimize(req: Request, res: Response) {
  try {
    const result = await optimizeDatabase();

    return res.status(200).json({
      success: result,
      message: result ? "数据库优化成功" : "数据库优化失败",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`数据库优化失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `优化失败: ${errorMessage}`,
    });
  }
}
