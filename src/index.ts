import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { setupParametersRoutes } from "./routes/parameters";
import { setupDeviceRoutes } from "./routes/device";
import { setupSerialRoutes } from "./routes/serial";
import { logger } from "./utils/logger";
import { initializeDatabase } from "./services/db";

// 加载环境变量
dotenv.config();

// 初始化数据库
initializeDatabase();

const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// 路由
app.use("/api/parameters", setupParametersRoutes());
app.use("/api/device", setupDeviceRoutes());
app.use("/api/serial", setupSerialRoutes());

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
