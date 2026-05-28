import { Router } from "express";
import { getExternalMeasurementsList } from "../controllers/measurementController";

/**
 * 外部接口路由（供局域网内调用）。
 * 当前为裸开，无鉴权。
 */
const router = Router();

// 测量数据列表（精简字段 + 强制分页）
router.get("/measurements", getExternalMeasurementsList);

export default router;
