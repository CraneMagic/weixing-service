import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { getFilenamesToClean } from "../services/db-postgres";

const imageDir = path.join(process.env.DB_PATH || "./data", "images");

/**
 * 根据标签清理旧图片：
 * - 'pass' 标签的图片保留1天
 * - 'fail' 标签的图片保留7天
 */
export async function cleanupOldImages(): Promise<void> {
  const failRetentionHours = parseInt(
    process.env.FAIL_RETENTION_HOURS || (24 * 7).toString(),
    10
  );
  const defaultRetentionHours = parseInt(
    process.env.DEFAULT_RETENTION_HOURS || "24",
    10
  );

  logger.info(
    `开始根据数据库记录清理旧图片 (规则: 'fail' 保留${failRetentionHours}小时, 其他保留${defaultRetentionHours}小时)...`
  );

  if (!fs.existsSync(imageDir)) {
    logger.warn(`图片目录 ${imageDir} 不存在, 无需清理。`);
    return;
  }

  try {
    const filenamesToDelete = await getFilenamesToClean();

    if (filenamesToDelete.length === 0) {
      logger.info("没有需要清理的旧图片文件。");
      return;
    }

    logger.info(`发现 ${filenamesToDelete.length} 个旧图片文件需要清理。`);
    let deletedCount = 0;

    filenamesToDelete.forEach((filename) => {
      if (!filename) {
        return;
      }
      const filePath = path.join(imageDir, filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.debug(`已删除旧图片: ${filePath}`);
        } else {
          logger.warn(`试图删除但文件不存在: ${filePath}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`删除文件 ${filePath} 时出错: ${errorMessage}`);
      }
    });

    if (deletedCount > 0) {
      logger.info(`清理完成，共删除了 ${deletedCount} 个旧图片文件。`);
    } else {
      logger.info(
        "清理检查完成，但没有文件被实际删除（可能已被提前清理或文件不存在）。"
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`清理旧图片过程中发生错误: ${errorMessage}`);
  }
}
