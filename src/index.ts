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

// 加载环境变量
dotenv.config();

// 初始化NeDB数据库
initializeDatabase();

// 初始化PostgreSQL数据库
(async () => {
  try {
    await initializePostgresDB();

    // 启动定时清理任务
    // 默认每7天清理一次，保留90天数据
    const daysToKeep = parseInt(process.env.DATA_RETENTION_DAYS || "90", 10);
    const cleanupInterval = parseInt(
      process.env.CLEANUP_INTERVAL_DAYS || "7",
      10
    );
    setupCleanupJob(daysToKeep, cleanupInterval);

    // 初始化定时维护任务
    initializeScheduler();
  } catch (error) {
    logger.error(
      `数据库初始化失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
})();

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

// 启动服务器
app.listen(port, () => {
  logger.info(`服务器运行在 http://localhost:${port}`);
});
