import { Router } from "express";
import {
  raiseAlarmByReason,
  clearAlarmByReason,
  getAlarmStatus,
} from "../controllers/alarmController";

const router = Router();

// 按原因触发报警（tcp-server 的 fail 报警走这里）
router.post("/raise", raiseAlarmByReason);

// 按原因清除报警，所有原因清空后才恢复绿灯
router.post("/clear", clearAlarmByReason);

// 当前报警状态
router.get("/status", getAlarmStatus);

export default router;
