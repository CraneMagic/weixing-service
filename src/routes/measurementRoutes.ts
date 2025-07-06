import { Router } from "express";
import {
  createMeasurement,
  getMeasurements,
  getRecentData,
  getMeasurement,
  getCompliance,
  getSpecStats,
  getTrend,
  cleanup,
  optimize,
  sendUdpData,
  downloadMeasurementsCsv,
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

// 获取测量数据列表（支持分页、筛选、排序）
router.get("/", getMeasurements);
router.get("/csv", downloadMeasurementsCsv);

// 获取最近的测量数据
router.get("/recent", getRecentData);

// 获取单条测量数据（放在最后，避免匹配到其他路由）
router.get("/:id", getMeasurement);

// 向测量单片机UDP发送数据
router.post("/udp/off", sendUdpData); // 关闭所有指示灯
router.post("/udp/normal", sendUdpData); // 正常状态
router.post("/udp/alarm", sendUdpData); // 报警状态

export default router;
