import dotenv from "dotenv";
import { logger } from "../src/utils/logger";

dotenv.config();

async function resetConnectionPool() {
  try {
    logger.info("🔄 开始重置PostgreSQL连接池...");

    // 动态导入以避免模块初始化问题
    const { gracefulShutdown } = await import("../src/services/pg-pool");

    // 优雅关闭现有连接池
    await gracefulShutdown();

    logger.info("✅ 连接池重置完成");
    logger.info("💡 请重启应用以创建新的连接池");

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ 连接池重置失败: ${errorMessage}`);
    process.exit(1);
  }
}

resetConnectionPool();
