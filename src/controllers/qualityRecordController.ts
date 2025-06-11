import { Request, Response } from "express";
import { logger } from "../utils/logger";
import {
  saveQualityRecord,
  getQualityRecords as getRecords,
  getQualityRecord as getRecord,
  updateQualityRecord as updateRecord,
  deleteQualityRecord as deleteRecord,
  getQualityRecordsGroupedBySecond,
  getQualityRecordsGroupedBySecondAndIp,
  updateStatusFromPassToIgnored as updatePassService,
  updateStatusFromFailToInReview as updateFailService,
} from "../services/db-sqlite";

/**
 * 创建管材质量检测记录
 */
export async function createQualityRecord(req: Request, res: Response) {
  try {
    const data = req.body;
    if (!data || !data.client_ip || !data.timestamp) {
      return res.status(400).json({
        success: false,
        message: "缺少 client_ip 或 timestamp",
      });
    }

    const result = await saveQualityRecord(data);

    return res.status(201).json({
      success: true,
      message: "质量检测记录已保存或更新",
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`保存质量检测记录失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `保存失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取管材质量检测记录列表
 */
export async function getQualityRecords(req: Request, res: Response) {
  try {
    const {
      limit = 20,
      page = 1,
      client_ip,
      pcNum,
      model_type,
      status,
      label,
      startTime,
      endTime,
      sortBy = "timestamp",
      sortOrder = "DESC",
    } = req.query;

    const options = {
      limit: parseInt(limit as string, 10),
      offset:
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      client_ip: client_ip as string | undefined,
      pcNum: pcNum as string | undefined,
      model_type: model_type as string | undefined,
      status: status as string | undefined,
      label: label as string | undefined,
      startTime: startTime as string | undefined,
      endTime: endTime as string | undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "ASC" | "DESC",
    };

    const result = await getRecords(options);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取质量检测记录列表失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 按秒获取质量检测记录统计
 */
export async function getQualityRecordsStatsBySecond(
  req: Request,
  res: Response
) {
  try {
    const { limit = 100, page = 1, include_image = "false" } = req.query;

    const options = {
      limit: parseInt(limit as string, 10),
      offset:
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      include_image: ["true", "1"].includes(
        (include_image as string).toLowerCase()
      ),
    };

    const result = await getQualityRecordsGroupedBySecond(options);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取记录统计失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 批量更新 "pass" 记录的状态为 "IGNORED"
 */
export async function updatePassToIgnored(req: Request, res: Response) {
  try {
    const result = await updatePassService();
    return res.status(200).json({
      success: true,
      message: `成功将 ${result.updated} 条 "pass" 记录的状态更新为 "IGNORED"`,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`批量更新 "pass" 记录状态失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `批量更新失败: ${errorMessage}`,
    });
  }
}

/**
 * 批量更新指定记录的状态为 "INREVIEW"
 */
export async function updateFailToInReview(req: Request, res: Response) {
  try {
    const records = req.body;

    // 如果请求体为空或不是一个数组，则执行全量更新
    if (!records || !Array.isArray(records) || records.length === 0) {
      const result = await updateFailService();
      return res.status(200).json({
        success: true,
        message: `成功将 ${result.updated} 条 (全量) "fail" 记录的状态更新为 "INREVIEW"`,
        data: result,
      });
    }

    // 否则，执行精确更新
    const result = await updateFailService(records);
    return res.status(200).json({
      success: true,
      message: `成功将 ${result.updated} 条 (指定) 记录的状态更新为 "INREVIEW"`,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`批量更新记录状态失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `批量更新失败: ${errorMessage}`,
    });
  }
}

/**
 * 按秒和IP获取质量检测记录
 */
export async function getQualityRecordsStatsBySecondAndIp(
  req: Request,
  res: Response
) {
  try {
    const { limit = 100, page = 1, include_image = "false" } = req.query;

    const options = {
      limit: parseInt(limit as string, 10),
      offset:
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      include_image: ["true", "1"].includes(
        (include_image as string).toLowerCase()
      ),
    };

    const result = await getQualityRecordsGroupedBySecondAndIp(options);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取记录统计失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取单条管材质量检测记录
 */
export async function getQualityRecord(req: Request, res: Response) {
  try {
    const { client_ip, timestamp } = req.params;
    if (!client_ip || !timestamp) {
      return res.status(400).json({
        success: false,
        message: "缺少 client_ip 或 timestamp",
      });
    }

    const data = await getRecord(client_ip, timestamp);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "未找到质量检测记录",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取质量检测记录详情失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 更新管材质量检测记录
 */
export async function updateQualityRecord(req: Request, res: Response) {
  try {
    const { client_ip, timestamp } = req.params;
    const data = req.body;

    if (!client_ip || !timestamp) {
      return res.status(400).json({
        success: false,
        message: "缺少 client_ip 或 timestamp",
      });
    }

    const result = await updateRecord(client_ip, timestamp, data);

    if (result.updated === 0) {
      return res.status(404).json({
        success: false,
        message: "未找到要更新的质量检测记录",
      });
    }

    return res.status(200).json({
      success: true,
      message: "质量检测记录已更新",
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`更新质量检测记录失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `更新失败: ${errorMessage}`,
    });
  }
}

/**
 * 删除管材质量检测记录
 */
export async function deleteQualityRecord(req: Request, res: Response) {
  try {
    const { client_ip, timestamp } = req.params;
    if (!client_ip || !timestamp) {
      return res.status(400).json({
        success: false,
        message: "缺少 client_ip 或 timestamp",
      });
    }

    await deleteRecord(client_ip, timestamp);

    return res.status(200).json({
      success: true,
      message: "质量检测记录已删除",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`删除质量检测记录失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `删除失败: ${errorMessage}`,
    });
  }
}
