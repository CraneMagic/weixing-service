import { Router } from "express";
import {
  turnOffCameraPowerEndpoint,
  turnOnCameraPowerEndpoint,
  getCameraPowerStatusEndpoint,
  getRelayStatus,
} from "../controllers/relayController";

const router = Router();

// 关闭相机供电
router.post("/camera-power/off", turnOffCameraPowerEndpoint);

// 打开相机供电
router.post("/camera-power/on", turnOnCameraPowerEndpoint);

// 查询相机供电状态
router.get("/camera-power/status", getCameraPowerStatusEndpoint);

// 获取继电器串口状态
router.get("/status", getRelayStatus);

export default router;
