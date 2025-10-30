import { Request, Response } from "express";
import { logger } from "../utils/logger";
import {
  isQualityBypassActive,
  enableBypass,
  disableBypass,
  getBypassStateWithRemaining,
} from "../utils/qualityBypass";
import {
  saveQualityRecord,
  batchSaveQualityRecords,
  getQualityRecords as getRecords,
  getQualityRecord as getRecord,
  updateQualityRecord as updateRecord,
  deleteQualityRecord as deleteRecord,
  getQualityRecordsGroupedBySecond,
  getQualityRecordsGroupedBySecondAndIp,
  updateStatusFromPassToIgnored as updatePassService,
  updateStatusFromFailToInReview as updateFailService,
  updateReviewResult as updateReviewResultService,
  batchUpdateReviewResult as batchUpdateReviewResultService,
  getFalsePositiveRateStats as getFalsePositiveRateStatsService,
  getPendingReviewRecords as getPendingReviewRecordsService,
  getQualityRecordsStatistics as getStatisticsService,
} from "../services/db-postgres";
import {
  getImagePath,
  getErrorImagePath,
  getDiskSpaceInfo,
  getImageDirStats,
} from "../utils/imageStore";
import {
  emergencyCleanup,
  checkAndCleanIfNeeded,
  cleanupOldImages,
} from "../utils/cleanup";

/**
 * 批量创建管材质量检测记录
 */
export async function batchCreateQualityRecords(req: Request, res: Response) {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "请提供有效的记录数组",
      });
    }

    // 验证每条记录的必要字段
    const invalidRecords: number[] = [];
    records.forEach((record, index) => {
      if (!record || !record.client_ip || !record.timestamp) {
        invalidRecords.push(index + 1);
      }
    });

    if (invalidRecords.length > 0) {
      return res.status(400).json({
        success: false,
        message: `记录 ${invalidRecords.join(
          ", "
        )} 缺少必要字段 (client_ip 或 timestamp)`,
      });
    }

    // 限制批量大小，防止过大的请求
    const MAX_BATCH_SIZE = 100;
    if (records.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        message: `批量大小不能超过 ${MAX_BATCH_SIZE} 条记录，当前: ${records.length} 条`,
      });
    }

    // 如果开启了质量检验跳过，则覆盖入库记录的审核结果与状态
    const bypass = await isQualityBypassActive();
    const recordsToSave = Array.isArray(records)
      ? records.map((r: any) =>
          bypass
            ? {
                ...r,
                review_result: "pass",
                status: "IGNORED",
                bypass_reason: "quality-bypass",
              }
            : r
        )
      : records;

    const result = await batchSaveQualityRecords(recordsToSave);

    // 构建响应
    let message = `批量处理完成: 成功 ${result.success} 条, 失败 ${result.failed} 条`;
    if (result.warnings.length > 0) {
      message += `, 有 ${result.warnings.length} 个警告`;
    }

    const statusCode =
      result.failed === 0 ? 201 : result.success > 0 ? 207 : 400;

    return res.status(statusCode).json({
      success: result.failed === 0,
      message: message,
      data: {
        total: records.length,
        success: result.success,
        failed: result.failed,
        results: result.results,
      },
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`批量保存质量检测记录失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `批量保存失败: ${errorMessage}`,
    });
  }
}

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

    // // 临时性能优化：只保存 label 为 "fail" 的记录
    // if (data.label !== "fail") {
    //   return res.status(200).json({
    //     success: true,
    //     message: `非 "fail" 记录已跳过保存 (label: ${data.label})`,
    //   });
    // }

    // 若开启质量检验跳过，覆盖本条记录
    if (await isQualityBypassActive()) {
      data.review_result = "pass";
      data.status = "IGNORED";
      data.bypass_reason = "quality-bypass";
    }

    const result = await saveQualityRecord(data);

    // 构建响应消息
    let message = "质量检测记录已保存或更新";
    if (result.imageWarning) {
      message += `，但${result.imageWarning}`;
    }

    return res.status(201).json({
      success: true,
      message: message,
      data: result.record,
      warning: result.imageWarning,
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
      review_result,
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
      pc_num: pcNum as string | undefined,
      model_type: model_type as string | undefined,
      status: status as string | undefined,
      label: label as string | undefined,
      review_result: review_result as string | undefined,
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
    const {
      limit = 60,
      page = 1,
      startTime,
      endTime,
      summary,
    } = req.query as any;

    const options = {
      limit: parseInt(limit as string, 10),
      offset:
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      startTime: startTime as string | undefined,
      endTime: endTime as string | undefined,
    };

    // 新增：默认使用高性能摘要接口，除非显式声明 summary=false
    const useSummary = String(summary ?? "true").toLowerCase() !== "false";

    const result = useSummary
      ? await (
          await import("../services/db-postgres")
        ).getQualityRecordsGroupedBySecondSummary(options)
      : await getQualityRecordsGroupedBySecond(options);

    return res.status(200).json(result);
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
 * 获取图片文件
 */
export async function getImage(req: Request, res: Response) {
  try {
    // 使用 req.params[0] 获取通配符匹配的完整路径
    const imagePath = req.params[0];
    if (!imagePath) {
      return res.status(400).json({
        success: false,
        message: "缺少图片路径",
      });
    }

    const fullImagePath = getImagePath(imagePath);

    if (fullImagePath) {
      res.sendFile(fullImagePath);
    } else {
      res.status(404).json({
        success: false,
        message: `未找到图片文件: ${imagePath}`,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取图片失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取图片失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取错误图片文件
 */
export async function getErrorImage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    // 使用 req.params[0] 获取通配符匹配的完整路径
    const imagePath = req.params[0];
    if (!imagePath) {
      return res.status(400).json({
        success: false,
        message: "缺少图片路径",
      });
    }

    const fullImagePath = getErrorImagePath(imagePath);

    if (fullImagePath) {
      res.sendFile(fullImagePath);
      return res;
    } else {
      return res.status(404).json({
        success: false,
        message: `未找到错误图片文件: ${imagePath}`,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取错误图片失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取错误图片失败: ${errorMessage}`,
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
    const {
      limit = 60,
      page = 1,
      startTime: startTimeStr,
      endTime: endTimeStr,
      summary,
    } = req.query as any;

    const options = {
      limit: parseInt(limit as string, 10),
      offset:
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      startTime: startTimeStr as string | undefined,
      endTime: endTimeStr as string | undefined,
    };

    // 新增：默认使用高性能摘要接口，除非显式声明 summary=false
    const useSummary = String(summary ?? "true").toLowerCase() !== "false";

    const result = useSummary
      ? await (
          await import("../services/db-postgres")
        ).getQualityRecordsGroupedBySecondAndIpSummary(options)
      : await getQualityRecordsGroupedBySecondAndIp(options);

    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`按秒和IP获取记录失败: ${errorMessage}`);
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

/**
 * 获取存储空间信息
 */
export async function getStorageInfo(req: Request, res: Response) {
  try {
    const [diskInfo, imageStats] = await Promise.all([
      getDiskSpaceInfo(),
      getImageDirStats(),
    ]);

    const response = {
      success: true,
      data: {
        disk: {
          ...diskInfo,
          freeSpaceFormatted: formatBytes(diskInfo.freeSpace),
          totalSpaceFormatted: formatBytes(diskInfo.totalSpace),
          usedSpaceFormatted: formatBytes(diskInfo.usedSpace),
        },
        images: {
          ...imageStats,
          totalSizeFormatted: formatBytes(imageStats.totalSizeBytes),
          avgFileSizeFormatted: formatBytes(imageStats.avgFileSizeBytes),
        },
      },
    };

    // 如果有磁盘空间警告，设置相应的HTTP状态码
    if (diskInfo.warning) {
      const statusCode = diskInfo.freeSpacePercent < 5 ? 507 : 200; // 507 Insufficient Storage
      return res.status(statusCode).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取存储信息失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取存储信息失败: ${errorMessage}`,
    });
  }
}

/**
 * 格式化字节数为人类可读的格式
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 手动触发紧急清理
 */
export async function triggerEmergencyCleanup(req: Request, res: Response) {
  try {
    logger.warn("🚨 手动触发紧急清理");

    // 先获取当前磁盘信息
    const beforeDiskInfo = await getDiskSpaceInfo();

    // 执行紧急清理
    const cleanupResult = await emergencyCleanup();

    // 获取清理后的磁盘信息
    const afterDiskInfo = await getDiskSpaceInfo();

    return res.status(200).json({
      success: true,
      message: `紧急清理完成，删除了 ${
        cleanupResult.deleted
      } 个文件，释放了 ${Math.round(
        cleanupResult.spaceFreed / 1024 / 1024
      )}MB 空间`,
      data: {
        cleanup: cleanupResult,
        diskSpace: {
          before: {
            freeSpacePercent: beforeDiskInfo.freeSpacePercent,
            freeSpaceFormatted: formatBytes(beforeDiskInfo.freeSpace),
          },
          after: {
            freeSpacePercent: afterDiskInfo.freeSpacePercent,
            freeSpaceFormatted: formatBytes(afterDiskInfo.freeSpace),
          },
          improvement:
            Math.round(
              (afterDiskInfo.freeSpacePercent -
                beforeDiskInfo.freeSpacePercent) *
                100
            ) / 100,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`手动紧急清理失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `紧急清理失败: ${errorMessage}`,
    });
  }
}

/**
 * 检查磁盘空间并自动清理（如果需要）
 */
export async function checkAndAutoClean(req: Request, res: Response) {
  try {
    const result = await checkAndCleanIfNeeded();

    if (result.emergencyTriggered) {
      return res.status(200).json({
        success: true,
        message: "检测到磁盘空间不足，已自动执行紧急清理",
        data: {
          emergencyTriggered: true,
          cleanupResult: result.cleanupResult,
        },
      });
    } else {
      const diskInfo = await getDiskSpaceInfo();
      return res.status(200).json({
        success: true,
        message: "磁盘空间正常，无需清理",
        data: {
          emergencyTriggered: false,
          diskSpacePercent: diskInfo.freeSpacePercent,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`自动检查清理失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `检查失败: ${errorMessage}`,
    });
  }
}

/**
 * 手动触发常规清理
 */
export async function triggerRegularCleanup(req: Request, res: Response) {
  try {
    logger.info("🧹 手动触发常规清理");

    // 先获取当前磁盘信息
    const beforeDiskInfo = await getDiskSpaceInfo();
    const beforeImageStats = await getImageDirStats();

    // 执行常规清理
    await cleanupOldImages();

    // 获取清理后的信息
    const afterDiskInfo = await getDiskSpaceInfo();
    const afterImageStats = await getImageDirStats();

    const deletedFiles =
      beforeImageStats.totalFiles - afterImageStats.totalFiles;
    const spaceFreed =
      beforeImageStats.totalSizeBytes - afterImageStats.totalSizeBytes;

    return res.status(200).json({
      success: true,
      message: `常规清理完成，删除了 ${deletedFiles} 个文件，释放了 ${Math.round(
        spaceFreed / 1024 / 1024
      )}MB 空间`,
      data: {
        cleanup: {
          deleted: deletedFiles,
          spaceFreed: spaceFreed,
          success: true,
        },
        diskSpace: {
          before: {
            freeSpacePercent: beforeDiskInfo.freeSpacePercent,
            freeSpaceFormatted: formatBytes(beforeDiskInfo.freeSpace),
          },
          after: {
            freeSpacePercent: afterDiskInfo.freeSpacePercent,
            freeSpaceFormatted: formatBytes(afterDiskInfo.freeSpace),
          },
          improvement:
            Math.round(
              (afterDiskInfo.freeSpacePercent -
                beforeDiskInfo.freeSpacePercent) *
                100
            ) / 100,
        },
        images: {
          before: {
            totalFiles: beforeImageStats.totalFiles,
            totalSizeFormatted: formatBytes(beforeImageStats.totalSizeBytes),
          },
          after: {
            totalFiles: afterImageStats.totalFiles,
            totalSizeFormatted: formatBytes(afterImageStats.totalSizeBytes),
          },
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`手动常规清理失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `常规清理失败: ${errorMessage}`,
    });
  }
}

/**
 * 更新单条记录审核结果
 */
export async function updateReviewResult(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { client_ip, timestamp } = req.params;
    const { review_result, reviewer, review_notes, status } = req.body;

    if (!client_ip || !timestamp) {
      return res.status(400).json({
        success: false,
        message: "缺少 client_ip 或 timestamp",
      });
    }

    // 如果status为IGNORED，则不需要review_result和reviewer
    if (status === "IGNORED") {
      if (!reviewer) {
        return res.status(400).json({
          success: false,
          message: "缺少 reviewer",
        });
      }
    } else {
      // 其他情况需要review_result和reviewer
      if (!review_result || !reviewer) {
        return res.status(400).json({
          success: false,
          message: "缺少 review_result 或 reviewer",
        });
      }

      if (!["pass", "fail", "unclear"].includes(review_result)) {
        return res.status(400).json({
          success: false,
          message: "review_result 必须是 pass、fail 或 unclear",
        });
      }
    }

    const result = await updateReviewResultService(client_ip, timestamp, {
      review_result,
      reviewer,
      review_notes,
      status,
    });

    if (result.updated === 0) {
      return res.status(404).json({
        success: false,
        message: "未找到要更新的质量检测记录",
      });
    }

    return res.status(200).json({
      success: true,
      message: "审核结果已更新",
      data: {
        updated: result.updated,
        record: result.record, // 返回完整的修改后记录
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`更新审核结果失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `更新失败: ${errorMessage}`,
    });
  }
}

/**
 * 批量更新审核结果
 */
export async function batchUpdateReviewResult(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { records, reviewer, review_notes } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "请提供有效的记录数组",
      });
    }

    if (!reviewer) {
      return res.status(400).json({
        success: false,
        message: "缺少审核人信息",
      });
    }

    // 验证记录格式
    const invalidRecords: number[] = [];
    records.forEach((record: any, index: number) => {
      if (!record.client_ip || !record.timestamp || !record.review_result) {
        invalidRecords.push(index + 1);
      }
      if (!["pass", "fail", "unclear"].includes(record.review_result)) {
        invalidRecords.push(index + 1);
      }
    });

    if (invalidRecords.length > 0) {
      return res.status(400).json({
        success: false,
        message: `记录 ${invalidRecords.join(", ")} 格式无效`,
      });
    }

    // 限制批量大小
    const MAX_BATCH_SIZE = 100;
    if (records.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        message: `批量大小不能超过 ${MAX_BATCH_SIZE} 条记录，当前: ${records.length} 条`,
      });
    }

    // 添加审核人信息
    const recordsWithReviewer = records.map((record: any) => ({
      ...record,
      reviewer,
      review_notes: record.review_notes || review_notes,
    }));

    const result = await batchUpdateReviewResultService(recordsWithReviewer);

    return res.status(200).json({
      success: true,
      message: `批量审核完成: 成功 ${result.updated} 条, 失败 ${result.failed} 条`,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`批量更新审核结果失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `批量更新失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取待审核记录
 */
export async function getPendingReviewRecords(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const {
      limit = 20,
      page = 1,
      startTime,
      endTime,
      client_ip,
      pc_num,
    } = req.query;

    const options = {
      limit: parseInt(limit as string, 10),
      offset:
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      startTime: startTime as string | undefined,
      endTime: endTime as string | undefined,
      client_ip: client_ip as string | undefined,
      pc_num: pc_num as string | undefined,
    };

    const result = await getPendingReviewRecordsService(options);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取待审核记录失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取误报率统计
 */
export async function getFalsePositiveRateStats(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { startTime, endTime, groupBy = "day" } = req.query;

    const options = {
      startTime: startTime as string | undefined,
      endTime: endTime as string | undefined,
      groupBy: groupBy as "day" | "week" | "month",
    };

    const result = await getFalsePositiveRateStatsService(options);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取误报率统计失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `获取失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取质量记录统计信息
 */
export async function getQualityRecordsStatistics(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { startTime, endTime, client_ip, pc_num, model_type } = req.query;

    // 验证必需参数
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: "缺少必需的查询参数",
        message: "startTime 和 endTime 参数是必需的",
      });
    }

    // 验证时间格式
    const startTimeDate = new Date(startTime as string);
    const endTimeDate = new Date(endTime as string);

    if (isNaN(startTimeDate.getTime()) || isNaN(endTimeDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: "时间格式错误",
        message: "startTime 和 endTime 必须是有效的 ISO 8601 格式时间",
      });
    }

    // 检查时间范围不超过30天
    const timeDiffMs = endTimeDate.getTime() - startTimeDate.getTime();
    const maxTimeDiffMs = 30 * 24 * 60 * 60 * 1000; // 30天
    if (timeDiffMs > maxTimeDiffMs) {
      return res.status(400).json({
        success: false,
        error: "时间范围过大",
        message: "查询时间范围不能超过30天",
      });
    }

    const options = {
      startTime: startTime as string,
      endTime: endTime as string,
      client_ip: client_ip as string | undefined,
      pc_num: pc_num as string | undefined,
      model_type: model_type as string | undefined,
    };

    // 直接使用优化后的统计服务
    const result = await getStatisticsService(options);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取质量记录统计信息失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      error: "服务器内部错误",
      message: "统计信息计算失败",
    });
  }
}

/**
 * 启用质量检验跳过
 */
export async function enableQualityBypass(req: Request, res: Response) {
  try {
    const { durationMinutes } = req.body || {};
    const state = await enableBypass(durationMinutes);
    return res.status(200).json({ success: true, data: state });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`启用质量检验跳过失败: ${errorMessage}`);
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

/**
 * 禁用质量检验跳过
 */
export async function disableQualityBypass(req: Request, res: Response) {
  try {
    const state = await disableBypass();
    return res.status(200).json({ success: true, data: state });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`禁用质量检验跳过失败: ${errorMessage}`);
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

/**
 * 查询质量检验跳过状态
 */
export async function getQualityBypassState(req: Request, res: Response) {
  try {
    const state = await getBypassStateWithRemaining();
    return res.status(200).json({ success: true, data: state });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取质量检验跳过状态失败: ${errorMessage}`);
    return res.status(500).json({ success: false, message: errorMessage });
  }
}
