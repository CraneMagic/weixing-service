import { Router } from "express";
import {
  reportNoCode,
  getNoCodeStatus,
} from "../controllers/noCodeAlarmController";

const router = Router();

// 各 tcp-server 实例上报自己那一路相机的喷码状态
router.post("/report", reportNoCode);

// 前端轮询报警状态
router.get("/status", getNoCodeStatus);

// 清除走 POST /api/alarm/clear { reason: "noCode" }，此处不再单独提供

export default router;
