import { Request, Response } from "express";
import { sendHexCommand, SerialPortType } from "../services/serial";
import { applyAlarmState } from "../services/light-hardware";
import { clearAllAlarms } from "../services/alarm-state";
import { logger } from "../utils/logger";

/**
 * 设置为正常状态（绿灯开，红灯关）
 */
export async function setNormalState(req: Request, res: Response) {
  try {
    // 走报警原因集合，保证「灯绿了但还有原因挂着」不会发生
    await clearAllAlarms();

    return res.status(200).json({
      success: true,
      message: "已切换到正常状态: 绿灯开，红灯关，继电器2关",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`切换到正常状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `切换到正常状态失败: ${errorMessage}`,
    });
  }
}

/**
 * 设置为报警状态（红灯开，绿灯关）
 */
export async function setAlarmState(req: Request, res: Response) {
  try {
    await applyAlarmState();

    return res.status(200).json({
      success: true,
      message: "已切换到报警状态: 红灯开，绿灯关，继电器2开，继电器4脉冲已触发",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`切换到报警状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `切换到报警状态失败: ${errorMessage}`,
    });
  }
}

/**
 * 关闭所有指示灯
 */
export async function turnOffAllLights(req: Request, res: Response) {
  try {
    // 关闭全部: A0 00 00 A0
    await sendHexCommand([0xa0, 0x00, 0x00, 0xa0], SerialPortType.ALARM);

    logger.info("已关闭所有指示灯");

    return res.status(200).json({
      success: true,
      message: "已关闭所有指示灯",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`关闭所有指示灯失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `关闭所有指示灯失败: ${errorMessage}`,
    });
  }
}
