import { Router } from "express";
import {
  createMeasurement,
  getRecentData,
  getMeasurement,
  getCompliance,
  getSpecStats,
  getTrend,
  cleanup,
  optimize,
} from "../controllers/measurementController";

const router = Router();

// 创建测量数据
router.post("/", createMeasurement);

// 获取统计和维护路由（需要放在/:id路由前面）
router.get("/stats/compliance", getCompliance);
router.get("/stats/specs", getSpecStats);
router.get("/stats/trend", getTrend);
router.post("/maintenance/cleanup", cleanup);
router.post("/maintenance/optimize", optimize);

// 获取最近的测量数据
router.get("/", getRecentData);

// 获取单条测量数据（放在最后，避免匹配到其他路由）
router.get("/:id", getMeasurement);

export default router;
