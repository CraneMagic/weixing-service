import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import EventEmitter from "events";
import { logger } from "../utils/logger";

// 串口事件发射器
const serialEventEmitter = new EventEmitter();

// 串口实例
let serialPort: SerialPort | null = null;
let parser: ReadlineParser | null = null;

/**
 * 初始化串口
 */
export async function initializeSerialPort(): Promise<boolean> {
  try {
    if (serialPort && serialPort.isOpen) {
      return true;
    }

    const portPath = process.env.SERIAL_PORT || "COM4";
    const baudRate = parseInt(process.env.SERIAL_BAUD_RATE || "9600", 10);

    logger.info(`正在打开串口: ${portPath} @ ${baudRate}bps`);

    serialPort = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    // 设置事件监听器
    serialPort.on("open", () => {
      logger.info("串口已打开");
      serialEventEmitter.emit("open");
    });

    serialPort.on("error", (error) => {
      logger.error(`串口错误: ${error.message}`);
      serialEventEmitter.emit("error", error);
    });

    serialPort.on("close", () => {
      logger.info("串口已关闭");
      serialEventEmitter.emit("close");
    });

    parser.on("data", (data: string) => {
      logger.debug(`收到串口数据: ${data}`);
      serialEventEmitter.emit("data", data);
    });

    // 打开串口
    return new Promise((resolve, reject) => {
      serialPort!.open((error) => {
        if (error) {
          logger.error(`无法打开串口: ${error.message}`);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`串口初始化失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 发送数据到串口
 */
export async function sendData(data: string): Promise<boolean> {
  try {
    if (!serialPort || !serialPort.isOpen) {
      await initializeSerialPort();
    }

    return new Promise((resolve, reject) => {
      if (!serialPort) {
        reject(new Error("串口未初始化"));
        return;
      }

      logger.debug(`发送数据: ${data}`);
      serialPort.write(data, (error) => {
        if (error) {
          logger.error(`发送数据错误: ${error.message}`);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`发送数据失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 发送16进制命令到串口
 * @param hexArray 16进制数组，如 [0xA0, 0x01, 0x01, 0xA2]
 */
export async function sendHexCommand(hexArray: number[]): Promise<boolean> {
  try {
    if (!serialPort || !serialPort.isOpen) {
      await initializeSerialPort();
    }

    return new Promise((resolve, reject) => {
      if (!serialPort) {
        reject(new Error("串口未初始化"));
        return;
      }

      const buffer = Buffer.from(hexArray);
      logger.debug(`发送16进制命令: ${buffer.toString("hex")}`);

      serialPort.write(buffer, (error) => {
        if (error) {
          logger.error(`发送16进制命令错误: ${error.message}`);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`发送16进制命令失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 关闭串口
 */
export function closeSerialPort(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!serialPort || !serialPort.isOpen) {
      resolve(true);
      return;
    }

    serialPort.close((error) => {
      if (error) {
        logger.error(`关闭串口错误: ${error.message}`);
        resolve(false);
        return;
      }
      logger.info("串口已正常关闭");
      resolve(true);
    });
  });
}

/**
 * 获取当前串口状态
 */
export function getSerialStatus(): {
  isOpen: boolean;
  port?: string;
  baudRate?: number;
} {
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
 * 获取串口事件发射器
 */
export function getSerialEventEmitter(): EventEmitter {
  return serialEventEmitter;
}
