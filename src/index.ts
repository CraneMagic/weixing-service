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
import relayRoutes from "./routes/relayRoutes";
import networkScanRoutes from "./routes/networkScanRoutes";
import baselineRoutes from "./routes/baselineRoutes";
import { logger } from "./utils/logger";
import { initializeDatabase } from "./services/db";
import { setupCleanupJob } from "./services/cleanup";
import { initializeScheduler } from "./services/scheduler";
import { initializePostgresDB } from "./services/db-setup-postgres";
import { checkPoolHealth } from "./services/pg-pool";
import { startSchedulers } from "./scheduler";
import { sendHexCommand, SerialPortType } from "./services/serial";

// 加载环境变量
dotenv.config();

// 检查是否跳过数据库验证
const skipDatabaseValidation = process.env.SKIP_DATABASE_VALIDATION === "true";

// 初始化应用的主函数
async function startApplication() {
  try {
    logger.info("🚀 开始初始化应用...");

    if (skipDatabaseValidation) {
      logger.warn("⚠️  跳过数据库验证模式已启用");
      logger.warn("📋 数据库相关API将被禁用");
    } else {
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
    }

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
    if (skipDatabaseValidation) {
      // 跳过数据库验证时，只注册非数据库相关的路由
      logger.info("🔌 注册非数据库相关路由...");
      app.use("/api/serial", setupSerialRoutes());
      app.use("/api/network", networkScanRoutes);

      // 为数据库相关路由添加禁用提示
      app.use("/api/parameters", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });

      app.use("/api/device", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });

      app.use("/api/light", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });

      app.use("/api/relay", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });

      app.use("/api/measurements", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });

      app.use("/api/quality-records", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });

      app.use("/api/baseline", (req, res) => {
        res.status(503).json({
          success: false,
          message: "数据库功能已禁用",
          error: "SKIP_DATABASE_VALIDATION 模式已启用，数据库相关API不可用",
        });
      });
    } else {
      // 正常模式，注册所有路由
      logger.info("🔌 注册所有路由...");
      app.use("/api/parameters", setupParametersRoutes());
      app.use("/api/device", setupDeviceRoutes());
      app.use("/api/serial", setupSerialRoutes());
      app.use("/api/light", lightRoutes);
      app.use("/api/relay", relayRoutes);
      app.use("/api/measurements", measurementRoutes);
      app.use("/api/quality-records", qualityRecordRoutes);
      app.use("/api/baseline", baselineRoutes);
      app.use("/api/network", networkScanRoutes);
      app.use("/api/baseline", baselineRoutes);
    }

    // 健康检查路由
    app.get("/health", async (req, res) => {
      try {
        if (skipDatabaseValidation) {
          // 跳过数据库验证模式
          res.status(200).json({
            status: "ok",
            timestamp: new Date().toISOString(),
            mode: "skip_database_validation",
            database: {
              healthy: false,
              status: "disabled",
              message: "数据库验证已跳过",
            },
            availableServices: ["serial", "network_scan"],
            disabledServices: [
              "parameters",
              "device",
              "light",
              "relay",
              "measurements",
              "quality_records",
            ],
          });
        } else {
          // 正常模式，检查数据库健康状态
          const poolHealth = await checkPoolHealth();

          res.status(poolHealth.healthy ? 200 : 503).json({
            status: poolHealth.healthy ? "ok" : "degraded",
            timestamp: new Date().toISOString(),
            mode: "normal",
            database: {
              healthy: poolHealth.healthy,
              totalConnections: poolHealth.totalConnections,
              idleConnections: poolHealth.idleConnections,
              waitingClients: poolHealth.waitingClients,
              error: poolHealth.error,
            },
            availableServices: [
              "parameters",
              "device",
              "serial",
              "light",
              "relay",
              "measurements",
              "quality_records",
              "network_scan",
            ],
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        res.status(503).json({
          status: "error",
          timestamp: new Date().toISOString(),
          mode: skipDatabaseValidation ? "skip_database_validation" : "normal",
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
    app.listen(port, async () => {
      logger.info(`🎉 服务器成功启动在 http://localhost:${port}`);
      if (skipDatabaseValidation) {
        logger.info("✅ 应用初始化完成（跳过数据库验证模式）");
        logger.info("📋 可用服务: 串口通信、网络扫描");
        logger.info(
          "⚠️  禁用服务: 参数管理、设备管理、灯光控制、继电器控制、测量数据、质量记录"
        );
      } else {
        logger.info("✅ 应用初始化完成，所有服务已就绪");

        // 6. 启动时初始化指示灯为正常状态（绿灯）
        try {
          await sendHexCommand([0xa0, 0x07, 0x00, 0xa7], SerialPortType.ALARM); // 关闭红灯+蜂鸣
          await sendHexCommand([0xa0, 0x03, 0x00, 0xa3], SerialPortType.ALARM); // 关闭红灯
          await sendHexCommand([0xa0, 0x02, 0x01, 0xa3], SerialPortType.ALARM); // 打开绿灯
          logger.info("✅ 指示灯已初始化为正常状态（绿灯）");
        } catch (e) {
          logger.warn(`指示灯初始化失败（串口可能未连接）: ${e}`);
        }
      }
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
