import { NodeSSH } from "node-ssh";
import { logger } from "../utils/logger";

// SSH 客户端
const ssh = new NodeSSH();

/**
 * 连接到远程设备
 */
export async function connectToDevice(): Promise<NodeSSH> {
  try {
    if (ssh.isConnected()) {
      return ssh;
    }

    const host = process.env.SSH_HOST;
    const port = parseInt(process.env.SSH_PORT || "22", 10);
    const username = process.env.SSH_USERNAME;
    const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

    if (!host || !username) {
      throw new Error("SSH配置不完整，请检查环境变量");
    }

    logger.info(`正在连接到设备: ${username}@${host}:${port}`);

    await ssh.connect({
      host,
      port,
      username,
      privateKeyPath,
    });

    logger.info("SSH连接成功");
    return ssh;
  } catch (error) {
    logger.error(
      `SSH连接失败: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * 重启远程设备
 */
export async function rebootDevice(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const client = await connectToDevice();
    const command = process.env.REBOOT_COMMAND || "reboot";

    logger.info(`执行重启命令: ${command}`);
    const result = await client.execCommand(command);

    if (result.stderr) {
      logger.error(`重启命令错误: ${result.stderr}`);
      return {
        success: false,
        message: result.stderr,
      };
    }

    logger.info("设备重启命令已发送");
    return {
      success: true,
      message: result.stdout || "重启命令已执行",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`设备重启失败: ${errorMessage}`);
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * 在远程设备执行命令
 */
export async function executeCommand(
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const client = await connectToDevice();

    logger.info(`执行命令: ${command}`);
    const result = await client.execCommand(command);

    return {
      success: !result.stderr,
      output: result.stdout,
      error: result.stderr,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`命令执行失败: ${errorMessage}`);
    return {
      success: false,
      output: "",
      error: errorMessage,
    };
  }
}

/**
 * 断开SSH连接
 */
export function disconnectSSH(): void {
  if (ssh.isConnected()) {
    ssh.dispose();
    logger.info("SSH连接已断开");
  }
}
