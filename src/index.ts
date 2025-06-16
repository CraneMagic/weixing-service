import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { setupParametersRoutes } from "./routes/parameters";
import { setupDeviceRoutes } from "./routes/device";
import { setupSerialRoutes } from "./routes/serial";
import lightRoutes from "./routes/lightRoutes";
import measurementRoutes from "./routes/measurementRoutes";
import qualityRecordRoutes from "./routes/qualityRecordRoutes";
import { logger } from "./utils/logger";
import { initializeDatabase } from "./services/db";
import { setupCleanupJob } from "./services/cleanup";
import { initializeScheduler } from "./services/scheduler";
import { initializePostgresDB } from "./services/db-setup-postgres";
import { startSchedulers } from "./scheduler";

// 加载环境变量
dotenv.config();

// 初始化应用的主函数
async function startApplication() {
  try {
    logger.info("🚀 开始初始化应用...");

    // 1. 初始化NeDB数据库
    logger.info("📁 初始化NeDB数据库...");
    initializeDatabase();

    // 2. 初始化PostgreSQL数据库（等待完成）
    logger.info("🐘 初始化PostgreSQL数据库...");
    await initializePostgresDB();
    logger.info("✅ PostgreSQL数据库初始化完成");

    // 3. 启动定时任务
    logger.info("⏰ 启动定时任务...");
    const daysToKeep = parseInt(process.env.DATA_RETENTION_DAYS || "90", 10);
    const cleanupInterval = parseInt(
      process.env.CLEANUP_INTERVAL_DAYS || "7",
      10
    );
    setupCleanupJob(daysToKeep, cleanupInterval);
    initializeScheduler();
    startSchedulers();
    logger.info("✅ 定时任务启动完成");

    // 4. 创建Express应用
    logger.info("🌐 创建Express应用...");
    const app = express();
    const port = process.env.PORT || 3000;

    // 中间件
    app.use(cors());
    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ limit: "50mb", extended: true }));
    app.use(morgan("dev"));

    // 路由
    app.use("/api/parameters", setupParametersRoutes());
    app.use("/api/device", setupDeviceRoutes());
    app.use("/api/serial", setupSerialRoutes());
    app.use("/api/light", lightRoutes);
    app.use("/api/measurements", measurementRoutes);
    app.use("/api/quality-records", qualityRecordRoutes);

    // 健康检查路由
    app.get("/health", async (req, res) => {
      try {
        const { checkPoolHealth } = await import("./services/pg-pool");
        const poolHealth = await checkPoolHealth();

        res.status(poolHealth.healthy ? 200 : 503).json({
          status: poolHealth.healthy ? "ok" : "degraded",
          timestamp: new Date().toISOString(),
          database: {
            healthy: poolHealth.healthy,
            totalConnections: poolHealth.totalConnections,
            idleConnections: poolHealth.idleConnections,
            waitingClients: poolHealth.waitingClients,
            error: poolHealth.error,
          },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        res.status(503).json({
          status: "error",
          timestamp: new Date().toISOString(),
          database: {
            healthy: false,
            error: errorMessage,
          },
        });
      }
    });

    // 错误处理
    app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        logger.error(`错误: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    );

    // 5. 启动服务器（在所有初始化完成后）
    app.listen(port, () => {
      logger.info(`🎉 服务器成功启动在 http://localhost:${port}`);
      logger.info("✅ 应用初始化完成，所有服务已就绪");
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ 应用启动失败: ${errorMessage}`);
    logger.error("🔧 请检查数据库连接配置和权限");
    process.exit(1);
  }
}

// 启动应用
startApplication();
