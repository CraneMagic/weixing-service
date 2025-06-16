import { Pool } from "pg";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

// PostgreSQL错误接口定义
interface PostgreSQLError extends Error {
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

// 连接池配置
const poolConfig = {
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 5432,
  // 连接池配置
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000, // 空闲连接超时时间
  connectionTimeoutMillis: 2000, // 连接超时时间
};

const pool = new Pool(poolConfig);

// 连接成功事件
pool.on("connect", (client) => {
  logger.info(`✅ PostgreSQL连接池新连接建立 (总连接: ${pool.totalCount})`);
});

// 连接移除事件
pool.on("remove", (client) => {
  logger.info(`🔌 PostgreSQL连接从池中移除 (剩余连接: ${pool.totalCount})`);
});

// 错误处理 - 改进版本，不直接退出进程
pool.on("error", (err: PostgreSQLError, client) => {
  logger.error("🚨 PostgreSQL连接池发生错误:", {
    message: err.message,
    code: err.code,
    severity: err.severity,
    detail: err.detail,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
  });

  // 根据错误类型决定处理策略
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    logger.error("❌ 数据库连接被拒绝或无法找到数据库服务器");
    logger.error("🔧 请检查：1) PostgreSQL服务是否运行 2) 连接配置是否正确");
  } else if (err.code === "ECONNRESET") {
    logger.warn("⚠️ 数据库连接被重置，连接池将自动重试");
  } else if (err.code === "28P01") {
    logger.error("🔐 数据库认证失败，请检查用户名和密码");
  } else {
    logger.error("🔍 未知数据库错误，请检查数据库状态");
  }

  // 不再直接退出进程，让连接池自己处理重连
  // 如果是严重错误，可以考虑设置一个标志位，让应用优雅关闭
});

// 添加连接池健康检查函数
export async function checkPoolHealth(): Promise<{
  healthy: boolean;
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  error?: string;
}> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    return {
      healthy: true,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount,
      error: errorMessage,
    };
  }
}

// 优雅关闭连接池
export async function gracefulShutdown(): Promise<void> {
  logger.info("🔄 开始优雅关闭PostgreSQL连接池...");
  try {
    await pool.end();
    logger.info("✅ PostgreSQL连接池已优雅关闭");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ 关闭连接池时出错: ${errorMessage}`);
  }
}

// 监听进程退出信号，优雅关闭连接池
process.on("SIGINT", async () => {
  logger.info("📡 收到SIGINT信号，准备优雅关闭...");
  await gracefulShutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("📡 收到SIGTERM信号，准备优雅关闭...");
  await gracefulShutdown();
  process.exit(0);
});

export default pool;
