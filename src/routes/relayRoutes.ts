import { Router } from "express";
import {
  turnOffCameraPowerEndpoint,
  turnOnCameraPowerEndpoint,
  getCameraPowerStatus,
  getRelaySerialStatus,
} from "../controllers/relayController";

const router = Router();

// 关闭相机供电
router.post("/camera-power/off", turnOffCameraPowerEndpoint);

// 打开相机供电
router.post("/camera-power/on", turnOnCameraPowerEndpoint);

// 查询相机供电状态（带响应等待）
router.get("/camera-power/status", getCameraPowerStatus);

// 获取继电器串口连接状态
router.get("/status", getRelaySerialStatus);

export default router;
