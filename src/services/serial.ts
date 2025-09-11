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
 * 发送命令: A0 01 00 A1
 */
export async function turnOffCameraPower(): Promise<boolean> {
  const command = [0xa0, 0x01, 0x00, 0xa1];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 打开相机供电
 * 发送命令: A0 01 01 A2
 */
export async function turnOnCameraPower(): Promise<boolean> {
  const command = [0xa0, 0x01, 0x01, 0xa2];
  return await sendHexCommand(command, SerialPortType.RELAY);
}

/**
 * 查询相机供电状态
 * 发送命令: A0 01 05 A6
 */
export async function getCameraPowerStatus(): Promise<boolean> {
  const command = [0xa0, 0x01, 0x05, 0xa6];
  return await sendHexCommand(command, SerialPortType.RELAY);
}
