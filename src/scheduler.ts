import cron from "node-cron";
import { logger } from "./utils/logger";
import { cleanupOldImages } from "./utils/cleanup";

/**
 * 初始化并启动所有定时任务
 */
export function startSchedulers(): void {
  logger.info("初始化定时任务...");

  const failRetentionHours = parseInt(
    process.env.FAIL_RETENTION_HOURS || (24 * 7).toString(),
    10
  );
  const defaultRetentionHours = parseInt(
    process.env.DEFAULT_RETENTION_HOURS || "24",
    10
  );

  const minRetentionHours = Math.min(failRetentionHours, defaultRetentionHours);

  // 如果最短保留时间小于24小时，则每小时执行一次。否则，每天午夜执行。
  const cronSchedule = minRetentionHours < 24 ? "0 * * * *" : "0 0 * * *";
  const scheduleDescription = minRetentionHours < 24 ? "每小时" : "每天午夜";

  // 每天午夜 (00:00) 执行一次旧图片清理任务
  // cron表达式: '0 0 * * *' (分 时 日 月 周)
  cron.schedule(cronSchedule, async () => {
    logger.info("定时任务触发：开始执行旧图片清理...");
    try {
      // 默认清理7天前的图片
      await cleanupOldImages();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`执行旧图片清理任务时发生意外错误: ${errorMessage}`);
    }
  });

  logger.info(`图片自动清理任务已设置，将${scheduleDescription}执行。`);
}
