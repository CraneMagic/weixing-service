import {
  initializeSQLiteDB,
  closeSQLiteDB,
  getDbInstance,
} from "../services/db-sqlite";
import { logger } from "../utils/logger";

/**
 * 执行数据库的 VACUUM 操作来回收空间。
 * 这是一个耗时且阻塞的操作，应该在低峰期执行。
 */
export async function runVacuum(): Promise<void> {
  logger.info("即将开始执行数据库 VACUUM 操作...");
  await initializeSQLiteDB();
  const db = getDbInstance();

  try {
    await new Promise<void>((resolve, reject) => {
      db.run("VACUUM", (err: Error | null) => {
        if (err) {
          logger.error(`数据库 VACUUM 操作失败: ${err.message}`);
          reject(err);
        } else {
          logger.info("数据库 VACUUM 操作成功完成！");
          resolve();
        }
      });
    });
  } catch (error) {
    // 错误已在Promise内部记录，这里再次抛出以通知调用者
    throw error;
  } finally {
    await closeSQLiteDB();
    logger.info("VACUUM 任务完成，数据库连接已关闭。");
  }
}

// 移除自执行部分
// runVacuum().catch((err) => {
//   logger.error("运行 VACUUM 脚本时捕获到未处理的错误: ", err);
// });
