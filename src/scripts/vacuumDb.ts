import pool from "../services/pg-pool";
import { logger } from "../utils/logger";

/**
 * 执行 PostgreSQL 数据库的 VACUUM FULL 操作来回收空间。
 * 这是一个耗时且阻塞的操作，应该在低峰期执行。
 */
export async function runVacuum(): Promise<void> {
  logger.info("即将开始执行 PostgreSQL 数据库 VACUUM FULL 操作...");

  try {
    // VACUUM FULL 会锁表，确保在维护窗口执行
    await pool.query("VACUUM FULL;");
    logger.info("数据库 VACUUM FULL 操作成功完成！");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`数据库 VACUUM FULL 操作失败: ${errorMessage}`);
    throw error;
  } finally {
    // 无论成功或失败，都关闭连接池
    await pool.end();
    logger.info("VACUUM 任务完成，数据库连接池已关闭。");
  }
}

// 如果需要独立运行此脚本，可以取消下面的注释
// runVacuum().catch((err) => {
//   logger.error("运行 VACUUM 脚本时捕获到未处理的错误: ", err);
//   process.exit(1);
// });
