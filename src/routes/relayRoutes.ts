import { Router } from "express";
import {
  turnOffCameraPowerEndpoint,
  turnOnCameraPowerEndpoint,
  getCameraPowerStatus,
  getRelaySerialStatus,
  testRelayConnection,
  testQueryCommandEndpoint,
  testDeviceQuerySupportEndpoint,
  turnOnRelay3Endpoint,
  turnOffRelay3Endpoint,
  turnOnRelay4Endpoint,
  turnOffRelay4Endpoint,
  triggerRelay3PulseEndpoint,
  triggerRelay4PulseEndpoint,
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

// 测试继电器串口连接
router.get("/test-connection", testRelayConnection);

// 测试不同的查询命令
router.get("/test-query", testQueryCommandEndpoint);

// 测试设备是否支持状态查询
router.get("/test-device-support", testDeviceQuerySupportEndpoint);

// 继电器3控制（端面检测报警）
router.post("/relay-3/on", turnOnRelay3Endpoint);
router.post("/relay-3/off", turnOffRelay3Endpoint);
router.post("/relay-3/pulse", triggerRelay3PulseEndpoint);

// 继电器4控制（表面检测报警）
router.post("/relay-4/on", turnOnRelay4Endpoint);
router.post("/relay-4/off", turnOffRelay4Endpoint);
router.post("/relay-4/pulse", triggerRelay4PulseEndpoint);

export default router;
