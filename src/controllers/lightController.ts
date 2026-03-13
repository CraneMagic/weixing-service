import { Request, Response } from "express";
import {
  sendHexCommand,
  SerialPortType,
  turnOnRelay2,
  turnOffRelay2,
  triggerRelay4Pulse,
} from "../services/serial";
import { logger } from "../utils/logger";

/**
 * 设置为正常状态（绿灯开，红灯关）
 */
export async function setNormalState(req: Request, res: Response) {
  try {
    // 关闭红灯+蜂鸣: A0 07 00 A7
    await sendHexCommand([0xa0, 0x07, 0x00, 0xa7], SerialPortType.ALARM);

    // 关闭红灯: A0 03 00 A3
    await sendHexCommand([0xa0, 0x03, 0x00, 0xa3], SerialPortType.ALARM);

    // 打开绿灯: A0 02 01 A3
    await sendHexCommand([0xa0, 0x02, 0x01, 0xa3], SerialPortType.ALARM);

    // 关闭继电器2: A0 02 00 A2
    await turnOffRelay2();

    logger.info("已切换到正常状态: 绿灯开，红灯关，继电器2关");

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
    // 关闭绿灯: A0 02 00 A2
    await sendHexCommand([0xa0, 0x02, 0x00, 0xa2], SerialPortType.ALARM);

    if (process.env.ALARM_WITH_SOUND !== "true") {
      // 打开红灯: A0 03 01 A4
      await sendHexCommand([0xa0, 0x03, 0x01, 0xa4], SerialPortType.ALARM);
    } else {
      // 打开红灯+蜂鸣: A0 07 01 A8
      await sendHexCommand([0xa0, 0x07, 0x01, 0xa8], SerialPortType.ALARM);
    }

    // 打开继电器2: A0 02 01 A3 (持续报警)
    await turnOnRelay2();

    // 触发继电器4脉冲: A0 04 01 A5 (表面检测报警 - 1秒脉冲)
    // 与继电器2同时触发，但输出模式不同
    triggerRelay4Pulse(1000).catch((error) => {
      logger.error(`触发继电器4脉冲失败: ${error}`);
    });

    logger.info("已切换到报警状态: 红灯开，绿灯关，继电器2开，继电器4脉冲已触发");

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
