import { Router } from "express";
import { getPublicMeasurementsList } from "../controllers/measurementController";

/**
 * 对外公开接口路由（供局域网内调用）。
 */
const router = Router();

// 测量数据列表（分页 + 时间窗）
router.get("/measurements", getPublicMeasurementsList);

export default router;
