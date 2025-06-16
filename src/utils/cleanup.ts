import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { getFilenamesToClean } from "../services/db-postgres";
import { getDiskSpaceInfo } from "./imageStore";

const imageDir = path.join(process.env.DB_PATH || "./data", "images");

/**
 * 紧急清理模式：当磁盘空间不足时的激进清理策略
 * - fail 标签图片保留12小时（最短安全时间）
 * - 其他标签图片保留1小时（更激进的清理）
 */
export async function emergencyCleanup(): Promise<{
  deleted: number;
  spaceFreed: number;
  success: boolean;
}> {
  logger.warn("🚨 启动紧急清理模式：磁盘空间不足！");

  const emergencyFailRetentionHours = 12; // fail标签最短保留12小时
  const emergencyDefaultRetentionHours = 1; // 其他标签保留1小时

  return await performCleanup(
    emergencyFailRetentionHours,
    emergencyDefaultRetentionHours,
    true
  );
}

/**
 * 获取紧急清理的文件列表
 */
async function getFilenamesForEmergencyClean(): Promise<string[]> {
  const emergencyFailRetentionHours = 12;
  const emergencyDefaultRetentionHours = 1;

  const failCutoffDate = new Date(
    Date.now() - emergencyFailRetentionHours * 60 * 60 * 1000
  ).toISOString();
  const defaultCutoffDate = new Date(
    Date.now() - emergencyDefaultRetentionHours * 60 * 60 * 1000
  ).toISOString();

  const query = `
    SELECT object_key as filename FROM quality_records
    WHERE 
      (
        (label = $1 AND "timestamp" < $2) 
        OR 
        ((label != $1 OR label IS NULL) AND "timestamp" < $3)
      )
      AND object_key IS NOT NULL AND object_key != ''
  `;

  const params: any[] = ["fail", failCutoffDate, defaultCutoffDate];

  try {
    const pool = require("../services/pg-pool").default;
    const { rows } = await pool.query(query, params);
    return rows.map((row: any) => row.filename);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`紧急清理：获取文件列表失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 执行清理操作的通用函数
 */
async function performCleanup(
  failRetentionHours: number,
  defaultRetentionHours: number,
  isEmergency: boolean = false
): Promise<{
  deleted: number;
  spaceFreed: number;
  success: boolean;
}> {
  const modeText = isEmergency ? "紧急清理" : "常规清理";

  logger.info(
    `开始${modeText} (规则: 'fail' 保留${failRetentionHours}小时, 其他保留${defaultRetentionHours}小时)...`
  );

  if (!fs.existsSync(imageDir)) {
    logger.warn(`图片目录 ${imageDir} 不存在, 无需清理。`);
    return { deleted: 0, spaceFreed: 0, success: true };
  }

  try {
    // 根据模式选择不同的文件获取方式
    const filenamesToDelete = isEmergency
      ? await getFilenamesForEmergencyClean()
      : await getFilenamesToClean();

    if (filenamesToDelete.length === 0) {
      logger.info(`${modeText}：没有需要清理的旧图片文件。`);
      return { deleted: 0, spaceFreed: 0, success: true };
    }

    logger.info(
      `${modeText}：发现 ${filenamesToDelete.length} 个图片文件需要清理。`
    );
    let deletedCount = 0;
    let spaceFreed = 0;

    for (const filename of filenamesToDelete) {
      if (!filename) continue;

      const filePath = path.join(imageDir, filename);
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          fs.unlinkSync(filePath);
          deletedCount++;
          spaceFreed += fileSize;

          if (isEmergency) {
            logger.warn(
              `🗑️ 紧急清理已删除: ${filePath} (${Math.round(
                fileSize / 1024
              )}KB)`
            );
          } else {
            logger.debug(`已删除旧图片: ${filePath}`);
          }
        } else {
          logger.warn(`试图删除但文件不存在: ${filePath}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`删除文件 ${filePath} 时出错: ${errorMessage}`);
      }
    }

    const spaceFreedMB = Math.round((spaceFreed / 1024 / 1024) * 100) / 100;

    if (deletedCount > 0) {
      const logLevel = isEmergency ? "warn" : "info";
      logger[logLevel](
        `${modeText}完成，共删除了 ${deletedCount} 个图片文件，释放空间 ${spaceFreedMB}MB`
      );
    } else {
      logger.info(`${modeText}检查完成，但没有文件被实际删除。`);
    }

    return { deleted: deletedCount, spaceFreed, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${modeText}过程中发生错误: ${errorMessage}`);
    return { deleted: 0, spaceFreed: 0, success: false };
  }
}

/**
 * 检查磁盘空间并决定是否需要紧急清理
 */
export async function checkAndCleanIfNeeded(): Promise<{
  emergencyTriggered: boolean;
  cleanupResult?: {
    deleted: number;
    spaceFreed: number;
    success: boolean;
  };
}> {
  try {
    const diskInfo = await getDiskSpaceInfo();

    // 如果剩余空间少于5%，触发紧急清理
    if (diskInfo.freeSpacePercent < 5) {
      logger.warn(
        `🚨 磁盘空间严重不足 (${diskInfo.freeSpacePercent}%)，触发紧急清理！`
      );
      const cleanupResult = await emergencyCleanup();

      // 清理后再次检查空间
      const newDiskInfo = await getDiskSpaceInfo();
      logger.info(`紧急清理后磁盘空间：${newDiskInfo.freeSpacePercent}%`);

      return { emergencyTriggered: true, cleanupResult };
    }

    // 如果剩余空间少于10%，发出警告但不清理
    if (diskInfo.freeSpacePercent < 10) {
      logger.warn(`⚠️ 磁盘空间偏低 (${diskInfo.freeSpacePercent}%)，建议关注`);
    }

    return { emergencyTriggered: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`检查磁盘空间时出错: ${errorMessage}`);
    return { emergencyTriggered: false };
  }
}

/**
 * 根据标签清理旧图片：
 * - 'pass' 标签的图片保留1天
 * - 'fail' 标签的图片保留7天
 */
export async function cleanupOldImages(): Promise<void> {
  // 首先检查是否需要紧急清理
  const emergencyCheck = await checkAndCleanIfNeeded();

  if (emergencyCheck.emergencyTriggered) {
    // 如果已经执行了紧急清理，就不再执行常规清理了
    logger.info("已执行紧急清理，跳过常规清理");
    return;
  }

  // 执行常规清理
  const failRetentionHours = parseInt(
    process.env.FAIL_RETENTION_HOURS || (24 * 7).toString(),
    10
  );
  const defaultRetentionHours = parseInt(
    process.env.DEFAULT_RETENTION_HOURS || "24",
    10
  );

  await performCleanup(failRetentionHours, defaultRetentionHours, false);
}
