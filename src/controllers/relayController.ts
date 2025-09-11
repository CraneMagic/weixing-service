import { Request, Response } from "express";
import {
  turnOffCameraPower,
  turnOnCameraPower,
  getCameraPowerStatus as sendCameraPowerStatusCommand,
  getCameraPowerStatusWithResponse,
  getSerialStatus,
  SerialPortType,
} from "../services/serial";
import { logger } from "../utils/logger";

/**
 * 关闭相机供电
 * 发送命令: A0 01 00 A1
 */
export async function turnOffCameraPowerEndpoint(req: Request, res: Response) {
  try {
    const result = await turnOffCameraPower();

    if (result) {
      logger.info("相机供电已关闭");
      return res.status(200).json({
        success: true,
        message: "相机供电已关闭",
        command: "A0 01 00 A1",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "关闭相机供电失败",
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`关闭相机供电失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `关闭相机供电失败: ${errorMessage}`,
    });
  }
}

/**
 * 打开相机供电
 * 发送命令: A0 01 01 A2
 */
export async function turnOnCameraPowerEndpoint(req: Request, res: Response) {
  try {
    const result = await turnOnCameraPower();

    if (result) {
      logger.info("相机供电已打开");
      return res.status(200).json({
        success: true,
        message: "相机供电已打开",
        command: "A0 01 01 A2",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "打开相机供电失败",
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`打开相机供电失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `打开相机供电失败: ${errorMessage}`,
    });
  }
}

/**
 * 查询相机供电状态（仅发送命令）
 * 发送命令: A0 01 05 A6
 */
export async function getCameraPowerStatusEndpoint(
  req: Request,
  res: Response
) {
  try {
    const result = await sendCameraPowerStatusCommand();

    if (result) {
      logger.info("相机供电状态查询命令已发送");
      return res.status(200).json({
        success: true,
        message: "相机供电状态查询命令已发送",
        command: "A0 01 05 A6",
        note: "请通过串口监听获取实际状态反馈",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "查询相机供电状态失败",
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`查询相机供电状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `查询相机供电状态失败: ${errorMessage}`,
    });
  }
}

/**
 * 查询相机供电状态（带响应等待）
 * 发送命令: A0 01 05 A6 并等待响应
 */
export async function getCameraPowerStatusWithResponseEndpoint(
  req: Request,
  res: Response
) {
  try {
    const timeout = parseInt(req.query.timeout as string) || 5000;
    const status = await getCameraPowerStatusWithResponse(timeout);

    logger.info(`相机供电状态查询完成: ${status ? "开启" : "关闭"}`);
    return res.status(200).json({
      success: true,
      message: "相机供电状态查询完成",
      command: "A0 01 05 A6",
      status: status,
      statusText: status ? "开启" : "关闭",
      timeout: timeout,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`查询相机供电状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `查询相机供电状态失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取相机供电状态（带响应等待）
 * 发送命令: A0 01 05 A6 并等待响应
 */
export async function getCameraPowerStatus(req: Request, res: Response) {
  try {
    const timeout = parseInt(req.query.timeout as string) || 5000;
    const status = await getCameraPowerStatusWithResponse(timeout);

    logger.info(`相机供电状态查询完成: ${status ? "开启" : "关闭"}`);
    return res.status(200).json({
      success: true,
      message: "相机供电状态查询完成",
      command: "A0 01 05 A6",
      status: status,
      statusText: status ? "开启" : "关闭",
      timeout: timeout,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`查询相机供电状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `查询相机供电状态失败: ${errorMessage}`,
    });
  }
}

/**
 * 获取继电器串口连接状态
 */
export async function getRelaySerialStatus(req: Request, res: Response) {
  try {
    const status = getSerialStatus(SerialPortType.RELAY);

    return res.status(200).json({
      success: true,
      data: {
        portType: SerialPortType.RELAY,
        ...status,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取继电器串口状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取继电器串口状态失败: ${errorMessage}`,
    });
  }
}
