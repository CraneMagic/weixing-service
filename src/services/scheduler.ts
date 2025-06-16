import cron from "node-cron";
import { logger } from "../utils/logger";
import { taskRunner } from "../utils/taskRunner";
import { runImageMigration } from "../scripts/migrateImages";
import { runVacuum } from "../scripts/vacuumDb";

/**
 * 初始化所有定时任务
 */
export function initializeScheduler(): void {
  logger.info("初始化定时任务调度器...");

  // 安排图片迁移任务，每天凌晨 2:00 运行
  // cron表达式: '0 2 * * *'
  cron.schedule("0 2 * * *", async () => {
    logger.info("触发每日图片迁移定时任务...");

    if (taskRunner.isLocked()) {
      logger.warn(
        "任务调度器已锁定，另一个维护任务可能正在进行中。跳过此次图片迁移。"
      );
      return;
    }

    if (taskRunner.lock()) {
      try {
        logger.info("开始执行图片迁移任务。");
        const result = await runImageMigration(false); // 不关闭连接池，因为是在主应用中运行
        logger.info(
          `图片迁移任务执行完毕。共处理 ${result.total} 条记录，成功 ${result.migrated} 条，失败 ${result.failed} 条。`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`执行图片迁移任务时发生错误: ${errorMessage}`);
      } finally {
        taskRunner.unlock();
        logger.info("图片迁移任务结束，已释放任务锁。");
      }
    }
  });

  // 安排数据库VACUUM任务，每周日的凌晨 3:00 运行
  // cron表达式: '0 3 * * 0' (0是周日)
  cron.schedule("0 3 * * 0", async () => {
    logger.info("触发每周数据库VACUUM定时任务...");

    if (taskRunner.isLocked()) {
      logger.warn(
        "任务调度器已锁定，另一个维护任务可能正在进行中。跳过此次VACUUM操作。"
      );
      return;
    }

    if (taskRunner.lock()) {
      try {
        logger.info("开始执行数据库VACUUM任务。");
        await runVacuum(false); // 不关闭连接池，因为是在主应用中运行
        logger.info("数据库VACUUM任务执行完毕。");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`执行数据库VACUUM任务时发生错误: ${errorMessage}`);
      } finally {
        taskRunner.unlock();
        logger.info("数据库VACUUM任务结束，已释放任务锁。");
      }
    }
  });

  logger.info("所有定时任务已成功初始化。");
}
