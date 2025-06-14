import { cleanupOldData, optimizeDatabase } from "./db-postgres";
import { logger } from "../utils/logger";

/**
 * 设置定时清理任务
 * @param daysToKeep 保留多少天的数据
 * @param intervalDays 清理间隔天数
 */
export function setupCleanupJob(
  daysToKeep: number = 90,
  intervalDays: number = 7
): NodeJS.Timeout {
  logger.info(
    `设置数据清理任务: 每${intervalDays}天运行一次，保留${daysToKeep}天数据`
  );

  // 转换为毫秒
  const interval = intervalDays * 24 * 60 * 60 * 1000;

  // 设置定时器
  const timer = setInterval(async () => {
    logger.info("开始执行数据清理任务");

    try {
      // 清理过期数据
      const count = await cleanupOldData(daysToKeep);
      logger.info(`已清理 ${count} 条过期数据`);

      // 优化数据库
      await optimizeDatabase();
      logger.info("数据库优化完成");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`数据清理任务失败: ${errorMessage}`);
    }
  }, interval);

  return timer;
}
