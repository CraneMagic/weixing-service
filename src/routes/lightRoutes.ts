import { Router } from "express";
import {
  setNormalState,
  setAlarmState,
  turnOffAllLights,
} from "../controllers/lightController";

const router = Router();

// 正常状态接口（绿灯开，红灯关）
router.post("/normal", setNormalState);

// 报警状态接口（红灯开，绿灯关）
router.post("/alarm", setAlarmState);

// 关闭所有指示灯接口
router.post("/off", turnOffAllLights);

export default router;
