import { NodeSSH } from "node-ssh";
import { logger } from "../utils/logger";

// SSH 客户端连接池
const sshConnections = new Map<string, NodeSSH>();

// 默认设备配置（从环境变量获取）
const defaultHost = process.env.SSH_HOST;
const defaultPort = parseInt(process.env.SSH_PORT || "22", 10);
const defaultUsername = process.env.SSH_USERNAME;
const defaultPrivateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

/**
 * 连接到远程设备
 */
export async function connectToDevice(ip?: string): Promise<NodeSSH> {
  try {
    // 使用指定的 IP 或默认 IP
    const host = ip || defaultHost;

    if (!host) {
      throw new Error("缺少设备 IP 地址");
    }

    // 检查是否已经有连接并且是活跃的
    if (sshConnections.has(host) && sshConnections.get(host)?.isConnected()) {
      return sshConnections.get(host) as NodeSSH;
    }

    const port = defaultPort;
    const username = defaultUsername;
    const privateKeyPath = defaultPrivateKeyPath;

    if (!username) {
      throw new Error("SSH配置不完整，请检查环境变量");
    }

    logger.info(`正在连接到设备: ${username}@${host}:${port}`);

    const sshClient = new NodeSSH();
    await sshClient.connect({
      host,
      port,
      username,
      privateKeyPath,
    });

    // 将连接保存到连接池
    sshConnections.set(host, sshClient);

    logger.info(`SSH连接成功: ${host}`);
    return sshClient;
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
export async function rebootDevice(ip?: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const client = await connectToDevice(ip);
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
  command: string,
  ip?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const client = await connectToDevice(ip);

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
export function disconnectSSH(ip?: string): void {
  if (ip) {
    // 断开指定 IP 的连接
    const client = sshConnections.get(ip);
    if (client && client.isConnected()) {
      client.dispose();
      sshConnections.delete(ip);
      logger.info(`SSH连接已断开: ${ip}`);
    }
  } else {
    // 断开所有连接
    for (const [ip, client] of sshConnections.entries()) {
      if (client.isConnected()) {
        client.dispose();
        logger.info(`SSH连接已断开: ${ip}`);
      }
    }
    sshConnections.clear();
  }
}
