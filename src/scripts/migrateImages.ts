import {
  getQualityRecords,
  updateQualityRecord,
} from "../services/db-postgres";
import { initializePostgresDB } from "../services/db-setup-postgres";
import pool from "../services/pg-pool"; // Import the pool
import { saveImageFromBase64 } from "../utils/imageStore";
import { logger } from "../utils/logger";

export async function runImageMigration(
  shouldClosePool: boolean = false
): Promise<{
  total: number;
  migrated: number;
  failed: number;
}> {
  logger.info("开始迁移数据库中的图片数据...");
  await initializePostgresDB();

  let migratedCount = 0;
  let failedCount = 0;
  let totalCount = 0;

  try {
    const recordsToMigrate = await getRecordsToMigrate();
    totalCount = recordsToMigrate.length;

    if (totalCount === 0) {
      logger.info("没有需要迁移的图片。");
      return { total: 0, migrated: 0, failed: 0 };
    }

    logger.info(`发现 ${totalCount} 条记录需要迁移...`);

    for (const record of recordsToMigrate) {
      if (record.image) {
        const filename = `${record.client_ip}_${record.timestamp}`;
        try {
          const savedFilename = await saveImageFromBase64(
            record.image,
            filename
          );
          await updateQualityRecord(record.client_ip, record.timestamp, {
            object_key: savedFilename || undefined,
            image: null, // 清空image字段
          });
          migratedCount++;
        } catch (error) {
          failedCount++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `迁移记录失败，无法保存图片 ${record.client_ip}_${record.timestamp}: ${errorMessage}`
          );
        }
      }
    }

    logger.info(
      `迁移完成！共 ${totalCount} 条，成功 ${migratedCount} 条，失败 ${failedCount} 条。`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`迁移过程中发生错误: ${errorMessage}`);
    throw error; // 向上抛出错误，让控制器处理
  } finally {
    if (shouldClosePool) {
      // 只有在显式要求时才关闭连接池（例如独立运行脚本时）
      await pool.end();
      logger.info("图片迁移任务完成，数据库连接池已关闭。");
    } else {
      logger.info("图片迁移任务完成。");
    }
  }

  return { total: totalCount, migrated: migratedCount, failed: failedCount };
}

async function getRecordsToMigrate() {
  const allRecords = await getQualityRecords({ limit: 1000000 }); // 获取大量记录
  return allRecords.data.filter((r) => r.image);
}

// 如果需要独立运行此脚本，可以取消下面的注释
// (async () => {
//   try {
//     await runImageMigration(true); // 独立运行时，传入true来关闭连接池
//   } catch (err) {
//     logger.error("运行图片迁移脚本时捕获到未处理的错误: ", err);
//     process.exit(1);
//   }
// })();
