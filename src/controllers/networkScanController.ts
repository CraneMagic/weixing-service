import { exec } from "child_process";
import { promisify } from "util";
import * as ping from "ping";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

// 设备信息接口
export interface DeviceInfo {
  ip: string;
  mac?: string;
  hostname?: string;
  vendor?: string;
  isAlive: boolean;
  responseTime?: number;
  lastSeen: string;
}

// 网络扫描结果接口
export interface NetworkScanResult {
  success: boolean;
  devices: DeviceInfo[];
  totalScanned: number;
  aliveCount: number;
  scanDuration: number;
  error?: string;
}

// 获取本机IP地址和子网掩码
async function getLocalNetworkInfo(): Promise<{
  ip: string;
  subnet: string;
} | null> {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === "win32") {
      command = 'ipconfig | findstr "IPv4"';
    } else if (platform === "darwin") {
      command = 'ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1';
    } else {
      command = 'ip route | grep "src" | head -1';
    }

    const { stdout } = await execAsync(command);
    const ipMatch = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);

    if (ipMatch) {
      const ip = ipMatch[1];
      const parts = ip.split(".");
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      return { ip, subnet };
    }

    return null;
  } catch (error) {
    logger.error("获取本地网络信息失败:", error);
    return null;
  }
}

// 生成IP地址列表
function generateIPList(subnet: string): string[] {
  const [network, prefix] = subnet.split("/");
  const [a, b, c] = network.split(".").map(Number);
  const ips: string[] = [];

  for (let i = 1; i <= 254; i++) {
    ips.push(`${a}.${b}.${c}.${i}`);
  }

  return ips;
}

// Ping单个IP地址
async function pingHost(
  ip: string,
  timeout: number = 1000
): Promise<{ alive: boolean; time?: number }> {
  try {
    const result = await ping.promise.probe(ip, {
      timeout: timeout / 1000, // ping包使用秒为单位
      extra: ["-c", "1"], // 只发送1个包
    });

    return {
      alive: result.alive,
      time: result.time ? parseFloat(String(result.time)) : undefined,
    };
  } catch (error) {
    logger.warn(`Ping ${ip} 失败:`, error);
    return { alive: false };
  }
}

// 获取ARP表信息
async function getARPTable(): Promise<Map<string, string>> {
  const arpTable = new Map<string, string>();

  try {
    const platform = process.platform;
    let command: string;

    if (platform === "win32") {
      command = "arp -a";
    } else {
      command = "arp -a";
    }

    const { stdout } = await execAsync(command);
    const lines = stdout.split("\n");

    for (const line of lines) {
      // 匹配IP和MAC地址
      const match = line.match(
        /(\d+\.\d+\.\d+\.\d+).*?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/
      );
      if (match) {
        const ip = match[1];
        const mac = match[2].replace(/[:-]/g, ":").toUpperCase();
        arpTable.set(ip, mac);
      }
    }
  } catch (error) {
    logger.warn("获取ARP表失败:", error);
  }

  return arpTable;
}

// 获取主机名
async function getHostname(ip: string): Promise<string | undefined> {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === "win32") {
      command = `nbtstat -A ${ip}`;
    } else {
      command = `nslookup ${ip}`;
    }

    const { stdout } = await execAsync(command);

    if (platform === "win32") {
      const match = stdout.match(/Name:\s*([^\s]+)/);
      return match ? match[1] : undefined;
    } else {
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.includes("name =")) {
          const match = line.match(/name = ([^,]+)/);
          return match ? match[1].replace(/\.$/, "") : undefined;
        }
      }
    }
  } catch (error) {
    // 主机名解析失败是正常的，不记录错误
  }

  return undefined;
}

// 根据MAC地址获取厂商信息
function getVendorFromMAC(mac: string): string | undefined {
  // 简单的OUI查找表（实际应用中可以使用更完整的数据库）
  const ouiMap: { [key: string]: string } = {
    "00:50:56": "VMware",
    "08:00:27": "VirtualBox",
    "52:54:00": "QEMU",
    "00:0C:29": "VMware",
    "00:1C:42": "Parallels",
    "00:15:5D": "Microsoft",
    "00:16:3E": "Xen",
    "00:1B:21": "Intel",
    "00:1F:5B": "Apple",
    "00:23:12": "Apple",
    "00:25:00": "Apple",
    "00:26:08": "Apple",
    "00:26:4A": "Apple",
    "00:26:B0": "Apple",
    "00:26:BB": "Apple",
  };

  const oui = mac.substring(0, 8).toUpperCase();
  return ouiMap[oui];
}

// 主要的网络扫描函数
export async function scanNetwork(subnet?: string): Promise<NetworkScanResult> {
  const startTime = Date.now();
  const devices: DeviceInfo[] = [];

  try {
    logger.info("开始网络扫描...");

    // 获取网络信息
    let targetSubnet = subnet;
    if (!targetSubnet) {
      const networkInfo = await getLocalNetworkInfo();
      if (!networkInfo) {
        return {
          success: false,
          devices: [],
          totalScanned: 0,
          aliveCount: 0,
          scanDuration: Date.now() - startTime,
          error: "无法获取本地网络信息",
        };
      }
      targetSubnet = networkInfo.subnet;
    }

    logger.info(`扫描子网: ${targetSubnet}`);

    // 生成IP列表
    const ipList = generateIPList(targetSubnet);
    logger.info(`将扫描 ${ipList.length} 个IP地址`);

    // 获取ARP表
    const arpTable = await getARPTable();
    logger.info(`ARP表中有 ${arpTable.size} 个条目`);

    // 并发Ping扫描
    const pingPromises = ipList.map(async (ip) => {
      const pingResult = await pingHost(ip);

      if (pingResult.alive) {
        const mac = arpTable.get(ip);
        const hostname = await getHostname(ip);
        const vendor = mac ? getVendorFromMAC(mac) : undefined;

        const device: DeviceInfo = {
          ip,
          mac,
          hostname,
          vendor,
          isAlive: true,
          responseTime: pingResult.time,
          lastSeen: new Date().toISOString(),
        };

        devices.push(device);
        logger.info(
          `发现设备: ${ip} ${mac ? `(${mac})` : ""} ${
            hostname ? `[${hostname}]` : ""
          }`
        );
      }
    });

    // 等待所有Ping完成
    await Promise.all(pingPromises);

    // 添加ARP表中存在但Ping不通的设备（可能是防火墙阻止Ping）
    for (const [ip, mac] of arpTable) {
      if (!devices.find((d) => d.ip === ip)) {
        const hostname = await getHostname(ip);
        const vendor = getVendorFromMAC(mac);

        const device: DeviceInfo = {
          ip,
          mac,
          hostname,
          vendor,
          isAlive: false, // 标记为不可达，但在ARP表中存在
          lastSeen: new Date().toISOString(),
        };

        devices.push(device);
        logger.info(
          `ARP表中发现设备: ${ip} (${mac}) ${hostname ? `[${hostname}]` : ""}`
        );
      }
    }

    const scanDuration = Date.now() - startTime;
    const aliveCount = devices.filter((d) => d.isAlive).length;

    logger.info(
      `扫描完成: 发现 ${devices.length} 个设备，其中 ${aliveCount} 个在线`
    );

    return {
      success: true,
      devices: devices.sort((a, b) => {
        // 按IP地址排序
        const aParts = a.ip.split(".").map(Number);
        const bParts = b.ip.split(".").map(Number);
        for (let i = 0; i < 4; i++) {
          if (aParts[i] !== bParts[i]) {
            return aParts[i] - bParts[i];
          }
        }
        return 0;
      }),
      totalScanned: ipList.length,
      aliveCount,
      scanDuration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("网络扫描失败:", errorMessage);

    return {
      success: false,
      devices: [],
      totalScanned: 0,
      aliveCount: 0,
      scanDuration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// 快速扫描（只扫描常见IP段）
export async function quickScan(): Promise<NetworkScanResult> {
  const startTime = Date.now();
  const devices: DeviceInfo[] = [];

  try {
    logger.info("开始快速网络扫描...");

    // 获取本机IP
    const networkInfo = await getLocalNetworkInfo();
    if (!networkInfo) {
      return {
        success: false,
        devices: [],
        totalScanned: 0,
        aliveCount: 0,
        scanDuration: Date.now() - startTime,
        error: "无法获取本地网络信息",
      };
    }

    const [a, b, c] = networkInfo.ip.split(".").map(Number);
    const commonIPs = [
      `${a}.${b}.${c}.1`, // 网关
      `${a}.${b}.${c}.2`, // 常见设备
      `${a}.${b}.${c}.100`, // 常见设备
      `${a}.${b}.${c}.101`, // 常见设备
      `${a}.${b}.${c}.254`, // 常见网关
    ];

    // 获取ARP表
    const arpTable = await getARPTable();

    // 扫描常见IP
    const pingPromises = commonIPs.map(async (ip) => {
      const pingResult = await pingHost(ip, 500); // 更短的超时时间

      if (pingResult.alive) {
        const mac = arpTable.get(ip);
        const hostname = await getHostname(ip);
        const vendor = mac ? getVendorFromMAC(mac) : undefined;

        const device: DeviceInfo = {
          ip,
          mac,
          hostname,
          vendor,
          isAlive: true,
          responseTime: pingResult.time,
          lastSeen: new Date().toISOString(),
        };

        devices.push(device);
        logger.info(
          `发现设备: ${ip} ${mac ? `(${mac})` : ""} ${
            hostname ? `[${hostname}]` : ""
          }`
        );
      }
    });

    await Promise.all(pingPromises);

    // 添加ARP表中的所有设备
    for (const [ip, mac] of arpTable) {
      if (!devices.find((d) => d.ip === ip)) {
        const hostname = await getHostname(ip);
        const vendor = getVendorFromMAC(mac);

        const device: DeviceInfo = {
          ip,
          mac,
          hostname,
          vendor,
          isAlive: false,
          lastSeen: new Date().toISOString(),
        };

        devices.push(device);
      }
    }

    const scanDuration = Date.now() - startTime;
    const aliveCount = devices.filter((d) => d.isAlive).length;

    logger.info(
      `快速扫描完成: 发现 ${devices.length} 个设备，其中 ${aliveCount} 个在线`
    );

    return {
      success: true,
      devices: devices.sort((a, b) => {
        const aParts = a.ip.split(".").map(Number);
        const bParts = b.ip.split(".").map(Number);
        for (let i = 0; i < 4; i++) {
          if (aParts[i] !== bParts[i]) {
            return aParts[i] - bParts[i];
          }
        }
        return 0;
      }),
      totalScanned: commonIPs.length,
      aliveCount,
      scanDuration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("快速扫描失败:", errorMessage);

    return {
      success: false,
      devices: [],
      totalScanned: 0,
      aliveCount: 0,
      scanDuration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
