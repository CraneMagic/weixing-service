import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import EventEmitter from "events";
import { logger } from "../utils/logger";

// 串口类型枚举
export enum SerialPortType {
  ALARM = "alarm",
  RELAY = "relay",
}

// 串口事件发射器
const serialEventEmitter = new EventEmitter();

// 串口实例映射
const serialPorts: Map<SerialPortType, SerialPort> = new Map();
const parsers: Map<SerialPortType, ReadlineParser> = new Map();

// 相机供电状态响应监听
let cameraPowerStatusCallback: ((status: boolean) => void) | null = null;

/**
 * 获取串口配置
 */
function getSerialPortConfig(portType: SerialPortType): {
  path: string;
  baudRate: number;
} {
  if (portType === SerialPortType.ALARM) {
    return {
      path: process.env.ALARM_SERIAL_PORT || "/dev/ttyUSB0",
      baudRate: parseInt(
        process.env.ALARM_SERIAL_BAUD_RATE ||
          process.env.SERIAL_BAUD_RATE ||
          "9600",
        10
      ),
    };
  } else if (portType === SerialPortType.RELAY) {
    return {
      path: process.env.RELAY_SERIAL_PORT || "/dev/ttyUSB1",
      baudRate: parseInt(
        process.env.RELAY_SERIAL_BAUD_RATE ||
          process.env.SERIAL_BAUD_RATE ||
          "9600",
        10
      ),
    };
  }
  throw new Error(`未知的串口类型: ${portType}`);
}

/**
 * 初始化指定类型的串口
 */
export async function initializeSerialPort(
  portType: SerialPortType = SerialPortType.ALARM
): Promise<boolean> {
  try {
    const existingPort = serialPorts.get(portType);
    if (existingPort && existingPort.isOpen) {
      return true;
    }

    const config = getSerialPortConfig(portType);
    logger.info(
      `正在打开${portType}串口: ${config.path} @ ${config.baudRate}bps`
    );

    const serialPort = new SerialPort({
      path: config.path,
      baudRate: config.baudRate,
      autoOpen: false,
    });

    const parser = serialPort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    // 设置事件监听器
    serialPort.on("open", () => {
      logger.info(`${portType}串口已打开`);
      serialEventEmitter.emit("open", portType);
    });

    serialPort.on("error", (error) => {
      logger.error(`${portType}串口错误: ${error.message}`);
      serialEventEmitter.emit("error", error, portType);
    });

    serialPort.on("close", () => {
      logger.info(`${portType}串口已关闭`);
      serialEventEmitter.emit("close", portType);
    });

    parser.on("data", (data: string) => {
      logger.debug(`收到${portType}串口数据: ${data}`);
      serialEventEmitter.emit("data", data, portType);

      // 解析相机供电状态响应
      if (portType === SerialPortType.RELAY) {
        parseCameraPowerStatus(data);
      }
    });

    // 打开串口
    return new Promise((resolve, reject) => {
      serialPort.open((error) => {
        if (error) {
          logger.error(`无法打开${portType}串口: ${error.message}`);
          reject(error);
          return;
        }
        // 保存串口实例
        serialPorts.set(portType, serialPort);
        parsers.set(portType, parser);
        resolve(true);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${portType}串口初始化失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 初始化所有串口
 */
export async function initializeAllSerialPorts(): Promise<boolean> {
  try {
    const alarmResult = await initializeSerialPort(SerialPortType.ALARM);
    const relayResult = await initializeSerialPort(SerialPortType.RELAY);
    return alarmResult && relayResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`初始化所有串口失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 发送数据到指定串口
 */
export async function sendData(
  data: string,
  portType: SerialPortType = SerialPortType.ALARM
): Promise<boolean> {
  try {
    let serialPort = serialPorts.get(portType);
    if (!serialPort || !serialPort.isOpen) {
      await initializeSerialPort(portType);
      serialPort = serialPorts.get(portType);
    }

    return new Promise((resolve, reject) => {
      if (!serialPort) {
        reject(new Error(`${portType}串口未初始化`));
        return;
      }

      logger.debug(`发送数据到${portType}串口: ${data}`);
      serialPort.write(data, (error) => {
        if (error) {
          logger.error(`发送数据到${portType}串口错误: ${error.message}`);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`发送数据到${portType}串口失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 发送16进制命令到指定串口
 * @param hexArray 16进制数组，如 [0xA0, 0x01, 0x01, 0xA2]
 * @param portType 串口类型，默认为报警串口
 */
export async function sendHexCommand(
  hexArray: number[],
  portType: SerialPortType = SerialPortType.ALARM
): Promise<boolean> {
  try {
    let serialPort = serialPorts.get(portType);
    if (!serialPort || !serialPort.isOpen) {
      await initializeSerialPort(portType);
      serialPort = serialPorts.get(portType);
    }

    return new Promise((resolve, reject) => {
      if (!serialPort) {
        reject(new Error(`${portType}串口未初始化`));
        return;
      }

      const buffer = Buffer.from(hexArray);
      logger.debug(
        `发送16进制命令到${portType}串口: ${buffer.toString("hex")}`
      );

      serialPort.write(buffer, (error) => {
        if (error) {
          logger.error(`发送16进制命令到${portType}串口错误: ${error.message}`);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`发送16进制命令到${portType}串口失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 关闭指定串口
 */
export function closeSerialPort(
  portType: SerialPortType = SerialPortType.ALARM
): Promise<boolean> {
  return new Promise((resolve) => {
    const serialPort = serialPorts.get(portType);
    if (!serialPort || !serialPort.isOpen) {
      resolve(true);
      return;
    }

    serialPort.close((error) => {
      if (error) {
        logger.error(`关闭${portType}串口错误: ${error.message}`);
        resolve(false);
        return;
      }
      logger.info(`${portType}串口已正常关闭`);
      serialPorts.delete(portType);
      parsers.delete(portType);
      resolve(true);
    });
  });
}

/**
 * 关闭所有串口
 */
export async function closeAllSerialPorts(): Promise<boolean> {
  try {
    const alarmResult = await closeSerialPort(SerialPortType.ALARM);
    const relayResult = await closeSerialPort(SerialPortType.RELAY);
    return alarmResult && relayResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`关闭所有串口失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 获取指定串口状态
 */
export function getSerialStatus(
  portType: SerialPortType = SerialPortType.ALARM
): {
  isOpen: boolean;
  port?: string;
  baudRate?: number;
} {
  const serialPort = serialPorts.get(portType);
  if (!serialPort) {
    return { isOpen: false };
  }

  return {
    isOpen: serialPort.isOpen,
    port: serialPort.path,
    baudRate: serialPort.baudRate,
  };
}

/**
 * 获取所有串口状态
 */
export function getAllSerialStatus(): Record<
  SerialPortType,
  {
    isOpen: boolean;
    port?: string;
    baudRate?: number;
  }
> {
  return {
    [SerialPortType.ALARM]: getSerialStatus(SerialPortType.ALARM),
    [SerialPortType.RELAY]: getSerialStatus(SerialPortType.RELAY),
  };
}

/**
 * 获取串口事件发射器
 */
export function getSerialEventEmitter(): EventEmitter {
  return serialEventEmitter;
}

// ==================== 相机供电控制函数 ====================

/**
 * 关闭相机供电
 * 发送命令: A0 01 01 A2 (打开继电器，相机断电)
 */
export async function turnOffCameraPower(): Promise<boolean> {
  const command = [0xa0, 0x01, 0x01, 0xa2];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 打开相机供电
 * 发送命令: A0 01 00 A1 (关闭继电器，相机通电)
 */
export async function turnOnCameraPower(): Promise<boolean> {
  const command = [0xa0, 0x01, 0x00, 0xa1];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 打开继电器2
 * 发送命令: A0 02 01 A3
 */
export async function turnOnRelay2(): Promise<boolean> {
  const command = [0xa0, 0x02, 0x01, 0xa3];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 关闭继电器2
 * 发送命令: A0 02 00 A2
 */
export async function turnOffRelay2(): Promise<boolean> {
  const command = [0xa0, 0x02, 0x00, 0xa2];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 解析相机供电状态响应
 * @param data 串口返回的数据
 */
function parseCameraPowerStatus(data: string): void {
  try {
    logger.info(`收到继电器串口原始数据: "${data}"`);
    logger.info(`原始数据长度: ${data.length}`);
    logger.info(
      `原始数据十六进制: ${Buffer.from(data, "utf8")
        .toString("hex")
        .toUpperCase()}`
    );

    // 清理数据，移除空格和换行符
    const cleanData = data.trim().replace(/\s+/g, "");
    logger.info(`清理后的数据: "${cleanData}"`);
    logger.info(`清理后数据长度: ${cleanData.length}`);

    // 检查是否是相机供电状态响应
    // 返回格式: A0 01 00 A1 (关闭) 或 A0 01 01 A2 (开启)
    if (cleanData.length >= 6 && cleanData.startsWith("A0")) {
      logger.info(`匹配到A0开头的数据，长度: ${cleanData.length}`);

      // 尝试不同的位置提取状态字节
      let statusByte = "";
      if (cleanData.length >= 6) {
        statusByte = cleanData.substring(4, 6); // 第3个字节表示状态
      }
      logger.info(`提取的状态字节: "${statusByte}"`);

      if (statusByte === "01") {
        logger.info("相机供电状态: 开启 (A0 01 01 A2)");
        if (cameraPowerStatusCallback) {
          cameraPowerStatusCallback(true);
          cameraPowerStatusCallback = null; // 清除回调
        }
      } else if (statusByte === "00") {
        logger.info("相机供电状态: 关闭 (A0 01 00 A1)");
        if (cameraPowerStatusCallback) {
          cameraPowerStatusCallback(false);
          cameraPowerStatusCallback = null; // 清除回调
        }
      } else {
        logger.warn(`收到未知状态响应: ${cleanData}, 状态字节: ${statusByte}`);
        // 尝试其他可能的格式
        if (cleanData.includes("01")) {
          logger.info("尝试匹配包含'01'的响应为开启状态");
          if (cameraPowerStatusCallback) {
            cameraPowerStatusCallback(true);
            cameraPowerStatusCallback = null;
          }
        } else if (cleanData.includes("00")) {
          logger.info("尝试匹配包含'00'的响应为关闭状态");
          if (cameraPowerStatusCallback) {
            cameraPowerStatusCallback(false);
            cameraPowerStatusCallback = null;
          }
        }
      }
    } else {
      logger.warn(
        `收到非相机供电状态响应: ${cleanData} (长度: ${cleanData.length})`
      );
      // 即使不匹配标准格式，也尝试查找状态信息
      if (cleanData.includes("01") && cameraPowerStatusCallback) {
        logger.info("在非标准格式中找到'01'，尝试解析为开启状态");
        cameraPowerStatusCallback(true);
        cameraPowerStatusCallback = null;
      } else if (cleanData.includes("00") && cameraPowerStatusCallback) {
        logger.info("在非标准格式中找到'00'，尝试解析为关闭状态");
        cameraPowerStatusCallback(false);
        cameraPowerStatusCallback = null;
      }
    }
  } catch (error) {
    logger.error(`解析相机供电状态失败: ${error}`);
  }
}

/**
 * 查询相机供电状态（仅发送命令）
 * 发送命令: A0 01 05 A6
 */
export async function getCameraPowerStatus(): Promise<boolean> {
  const command = [0xa0, 0x01, 0x05, 0xa6];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 查询相机供电状态（带响应等待）
 * 发送命令: A0 01 05 A6 并等待响应
 * @param timeout 超时时间（毫秒），默认15000ms
 */
export async function getCameraPowerStatusWithResponse(
  timeout: number = 15000
): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info(`开始查询相机供电状态，超时时间: ${timeout}ms`);

      // 检查串口是否已连接
      const serialStatus = getSerialStatus(SerialPortType.RELAY);
      if (!serialStatus.isOpen) {
        logger.warn("继电器串口未连接，尝试初始化...");
        await initializeSerialPort(SerialPortType.RELAY);
      }

      // 设置回调函数
      cameraPowerStatusCallback = (status: boolean) => {
        logger.info(`收到相机供电状态响应: ${status ? "开启" : "关闭"}`);
        resolve(status);
      };

      // 发送查询命令 - 根据文档：A0 01 05 A6 (1路查询)
      const command = [0xa0, 0x01, 0x05, 0xa6];
      logger.info(
        `发送相机供电状态查询命令: ${command
          .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
          .join(" ")}`
      );

      // 验证命令格式
      logger.info(`命令字节数组: [${command.join(", ")}]`);
      logger.info(
        `命令十六进制: ${Buffer.from(command).toString("hex").toUpperCase()}`
      );

      const result = await sendHexCommand(command, SerialPortType.RELAY);

      if (!result) {
        cameraPowerStatusCallback = null;
        reject(new Error("发送查询命令失败"));
        return;
      }

      logger.info("查询命令发送成功，等待响应...");

      // 设置超时
      setTimeout(() => {
        if (cameraPowerStatusCallback) {
          logger.warn(`查询相机供电状态超时 (${timeout}ms)`);
          cameraPowerStatusCallback = null;
          reject(new Error("查询相机供电状态超时"));
        }
      }, timeout);
    } catch (error) {
      logger.error(`查询相机供电状态异常: ${error}`);
      cameraPowerStatusCallback = null;
      reject(error);
    }
  });
}

/**
 * 测试不同的查询命令
 * @param commandType 命令类型
 */
export async function testQueryCommand(
  commandType: string = "status"
): Promise<boolean> {
  let command: number[];

  switch (commandType) {
    case "status":
      command = [0xa0, 0x01, 0x05, 0xa6]; // 1路查询
      break;
    case "status_with_feedback":
      command = [0xa0, 0x01, 0x03, 0xa4]; // 1开带反馈
      break;
    case "status_off_with_feedback":
      command = [0xa0, 0x01, 0x02, 0xa3]; // 1关带反馈
      break;
    case "toggle":
      command = [0xa0, 0x01, 0x04, 0xa5]; // 1取反
      break;
    case "route2_query":
      command = [0xa0, 0x02, 0x05, 0xa7]; // 2路查询
      break;
    case "route3_query":
      command = [0xa0, 0x03, 0x05, 0xa8]; // 3路查询
      break;
    case "route4_query":
      command = [0xa0, 0x04, 0x05, 0xa9]; // 4路查询
      break;
    default:
      command = [0xa0, 0x01, 0x05, 0xa6];
  }

  logger.info(
    `测试查询命令 (${commandType}): ${command
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ")}`
  );
  logger.info(`命令字节数组: [${command.join(", ")}]`);
  logger.info(
    `命令十六进制: ${Buffer.from(command).toString("hex").toUpperCase()}`
  );

  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 测试设备是否支持状态查询
 * 先发送查询命令，然后等待一段时间看是否有响应
 */
export async function testDeviceQuerySupport(): Promise<{
  supportsQuery: boolean;
  responseData: string[];
  testResults: { command: string; sent: boolean; response: boolean }[];
}> {
  const responseData: string[] = [];
  const testResults: { command: string; sent: boolean; response: boolean }[] =
    [];

  // 临时保存原始回调
  const originalCallback = cameraPowerStatusCallback;

  // 设置临时回调来收集所有响应
  cameraPowerStatusCallback = (status: boolean) => {
    responseData.push(`Status: ${status ? "开启" : "关闭"}`);
  };

  // 监听所有串口数据
  const dataListener = (data: string, portType: SerialPortType) => {
    if (portType === SerialPortType.RELAY) {
      responseData.push(`Raw data: ${data}`);
      logger.info(`收到继电器串口数据: ${data}`);
    }
  };

  serialEventEmitter.on("data", dataListener);

  try {
    // 测试1: 发送查询命令
    logger.info("测试1: 发送查询命令 A0 01 05 A6");
    const queryResult = await sendHexCommand(
      [0xa0, 0x01, 0x05, 0xa6],
      SerialPortType.RELAY
    );
    testResults.push({
      command: "A0 01 05 A6",
      sent: queryResult,
      response: false,
    });

    // 等待2秒看是否有响应
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 测试2: 发送开带反馈命令
    logger.info("测试2: 发送开带反馈命令 A0 01 03 A4");
    const onFeedbackResult = await sendHexCommand(
      [0xa0, 0x01, 0x03, 0xa4],
      SerialPortType.RELAY
    );
    testResults.push({
      command: "A0 01 03 A4",
      sent: onFeedbackResult,
      response: false,
    });

    // 等待2秒看是否有响应
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 测试3: 发送关带反馈命令
    logger.info("测试3: 发送关带反馈命令 A0 01 02 A3");
    const offFeedbackResult = await sendHexCommand(
      [0xa0, 0x01, 0x02, 0xa3],
      SerialPortType.RELAY
    );
    testResults.push({
      command: "A0 01 02 A3",
      sent: offFeedbackResult,
      response: false,
    });

    // 等待2秒看是否有响应
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 检查是否有任何响应
    const hasResponse = responseData.length > 0;

    return {
      supportsQuery: hasResponse,
      responseData,
      testResults,
    };
  } finally {
    // 恢复原始回调
    cameraPowerStatusCallback = originalCallback;
    serialEventEmitter.removeListener("data", dataListener);
  }
}
