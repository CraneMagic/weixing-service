import { Request, Response } from "express";
import {
  turnOffCameraPower,
  turnOnCameraPower,
  getCameraPowerStatus as sendCameraPowerStatusCommand,
  getCameraPowerStatusWithResponse,
  getSerialStatus,
  initializeSerialPort,
  sendHexCommand,
  testQueryCommand,
  testDeviceQuerySupport,
  SerialPortType,
  turnOnRelay3,
  turnOffRelay3,
  turnOnRelay4,
  turnOffRelay4,
  triggerRelay3Pulse,
  triggerRelay4Pulse,
  isRelayPulsing,
} from "../services/serial";
import { logger } from "../utils/logger";

/**
 * 关闭相机供电
 * 发送命令: A0 01 01 A2 (打开继电器，相机断电)
 */
export async function turnOffCameraPowerEndpoint(req: Request, res: Response) {
  try {
    const result = await turnOffCameraPower();

    if (result) {
      logger.info("相机供电已关闭");
      return res.status(200).json({
        success: true,
        message: "相机供电已关闭",
        command: "A0 01 01 A2",
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
 * 发送命令: A0 01 00 A1 (关闭继电器，相机通电)
 */
export async function turnOnCameraPowerEndpoint(req: Request, res: Response) {
  try {
    const result = await turnOnCameraPower();

    if (result) {
      logger.info("相机供电已打开");
      return res.status(200).json({
        success: true,
        message: "相机供电已打开",
        command: "A0 01 00 A1",
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
    const timeout = parseInt(req.query.timeout as string) || 15000;
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
 * 获取相机供电状态（设备不支持查询，返回未知状态）
 */
export async function getCameraPowerStatus(req: Request, res: Response) {
  try {
    logger.info("设备不支持状态查询功能，返回未知状态");

    return res.status(200).json({
      success: true,
      message: "设备不支持状态查询功能",
      status: null,
      statusText: "未知",
      note: "此设备只支持开关控制，不支持状态查询。请通过开关操作来控制相机供电。",
      supportedOperations: [
        "POST /api/relay/camera-power/on - 打开相机供电",
        "POST /api/relay/camera-power/off - 关闭相机供电",
      ],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取相机供电状态失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `获取相机供电状态失败: ${errorMessage}`,
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

/**
 * 测试继电器串口连接
 */
export async function testRelayConnection(req: Request, res: Response) {
  try {
    logger.info("开始测试继电器串口连接...");

    // 检查串口状态
    const status = getSerialStatus(SerialPortType.RELAY);
    if (!status.isOpen) {
      logger.warn("继电器串口未连接，尝试初始化...");
      const initResult = await initializeSerialPort(SerialPortType.RELAY);
      if (!initResult) {
        return res.status(500).json({
          success: false,
          message: "继电器串口初始化失败",
          data: {
            portType: SerialPortType.RELAY,
            isOpen: false,
            error: "串口初始化失败",
          },
        });
      }
    }

    // 发送一个简单的查询命令测试连接
    const command = [0xa0, 0x01, 0x05, 0xa6];
    logger.info(
      `发送测试命令: ${command
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" ")}`
    );

    const result = await sendHexCommand(command, SerialPortType.RELAY);

    if (result) {
      logger.info("继电器串口连接测试成功");
      return res.status(200).json({
        success: true,
        message: "继电器串口连接正常",
        data: {
          portType: SerialPortType.RELAY,
          isOpen: true,
          port: status.port,
          baudRate: status.baudRate,
          testCommand: "A0 01 05 A6",
        },
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "继电器串口命令发送失败",
        data: {
          portType: SerialPortType.RELAY,
          isOpen: status.isOpen,
          port: status.port,
          baudRate: status.baudRate,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`测试继电器串口连接失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `测试继电器串口连接失败: ${errorMessage}`,
    });
  }
}

/**
 * 测试不同的查询命令
 */
export async function testQueryCommandEndpoint(req: Request, res: Response) {
  try {
    const { commandType } = req.query;
    const type = (commandType as string) || "status";

    logger.info(`开始测试查询命令: ${type}`);

    const result = await testQueryCommand(type);

    if (result) {
      logger.info(`测试查询命令 ${type} 发送成功`);
      return res.status(200).json({
        success: true,
        message: `测试查询命令 ${type} 发送成功`,
        commandType: type,
        note: "请查看日志中的详细命令信息和可能的响应",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: `测试查询命令 ${type} 发送失败`,
        commandType: type,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`测试查询命令失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `测试查询命令失败: ${errorMessage}`,
    });
  }
}

/**
 * 测试设备是否支持状态查询
 */
export async function testDeviceQuerySupportEndpoint(
  req: Request,
  res: Response
) {
  try {
    logger.info("开始测试设备查询支持...");

    const result = await testDeviceQuerySupport();

    logger.info(
      `设备查询支持测试完成: ${result.supportsQuery ? "支持" : "不支持"}`
    );
    logger.info(`收到响应数据: ${result.responseData.length} 条`);

    return res.status(200).json({
      success: true,
      message: "设备查询支持测试完成",
      data: {
        supportsQuery: result.supportsQuery,
        responseCount: result.responseData.length,
        responseData: result.responseData,
        testResults: result.testResults,
        summary: {
          totalCommands: result.testResults.length,
          successfulCommands: result.testResults.filter((r) => r.sent).length,
          responsesReceived: result.responseData.length,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`测试设备查询支持失败: ${errorMessage}`);

    return res.status(500).json({
      success: false,
      message: `测试设备查询支持失败: ${errorMessage}`,
    });
  }
}

export async function turnOnRelay3Endpoint(req: Request, res: Response) {
  try {
    const result = await turnOnRelay3();
    if (result) {
      logger.info("继电器3已打开");
      return res.status(200).json({
        success: true,
        message: "继电器3已打开",
        relay: 3,
        command: "A0 03 01 A4",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "打开继电器3失败",
        relay: 3,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`打开继电器3失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `打开继电器3失败: ${errorMessage}`,
      relay: 3,
    });
  }
}

export async function turnOffRelay3Endpoint(req: Request, res: Response) {
  try {
    const result = await turnOffRelay3();
    if (result) {
      logger.info("继电器3已关闭");
      return res.status(200).json({
        success: true,
        message: "继电器3已关闭",
        relay: 3,
        command: "A0 03 00 A3",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "关闭继电器3失败",
        relay: 3,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`关闭继电器3失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `关闭继电器3失败: ${errorMessage}`,
      relay: 3,
    });
  }
}

export async function turnOnRelay4Endpoint(req: Request, res: Response) {
  try {
    const result = await turnOnRelay4();
    if (result) {
      logger.info("继电器4已打开");
      return res.status(200).json({
        success: true,
        message: "继电器4已打开",
        relay: 4,
        command: "A0 04 01 A5",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "打开继电器4失败",
        relay: 4,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`打开继电器4失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `打开继电器4失败: ${errorMessage}`,
      relay: 4,
    });
  }
}

export async function turnOffRelay4Endpoint(req: Request, res: Response) {
  try {
    const result = await turnOffRelay4();
    if (result) {
      logger.info("继电器4已关闭");
      return res.status(200).json({
        success: true,
        message: "继电器4已关闭",
        relay: 4,
        command: "A0 04 00 A4",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "关闭继电器4失败",
        relay: 4,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`关闭继电器4失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `关闭继电器4失败: ${errorMessage}`,
      relay: 4,
    });
  }
}

export async function triggerRelay3PulseEndpoint(req: Request, res: Response) {
  try {
    const duration = parseInt(req.body?.duration) || 1000;
    
    if (isRelayPulsing(3)) {
      return res.status(429).json({
        success: false,
        message: "继电器3正在执行脉冲，请稍后再试",
        relay: 3,
        status: "pulsing",
      });
    }

    const result = await triggerRelay3Pulse(duration);
    if (result) {
      return res.status(200).json({
        success: true,
        message: "继电器3脉冲已触发",
        relay: 3,
        duration,
        command: "A0 03 01 A4",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "触发继电器3脉冲失败",
        relay: 3,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`触发继电器3脉冲失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `触发继电器3脉冲失败: ${errorMessage}`,
      relay: 3,
    });
  }
}

export async function triggerRelay4PulseEndpoint(req: Request, res: Response) {
  try {
    const duration = parseInt(req.body?.duration) || 1000;
    
    if (isRelayPulsing(4)) {
      return res.status(429).json({
        success: false,
        message: "继电器4正在执行脉冲，请稍后再试",
        relay: 4,
        status: "pulsing",
      });
    }

    const result = await triggerRelay4Pulse(duration);
    if (result) {
      return res.status(200).json({
        success: true,
        message: "继电器4脉冲已触发",
        relay: 4,
        duration,
        command: "A0 04 01 A5",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "触发继电器4脉冲失败",
        relay: 4,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`触发继电器4脉冲失败: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: `触发继电器4脉冲失败: ${errorMessage}`,
      relay: 4,
    });
  }
}
