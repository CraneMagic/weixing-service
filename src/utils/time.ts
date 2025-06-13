import { logger } from "./logger";

/**
 * 将自定义时间戳字符串转换为ISO 8601格式
 * @param timestamp "YYYYMMDDHHMMSS..."
 */
export function convertTimestampToISO(timestamp: string): string | null {
  if (!timestamp || timestamp.length < 14) {
    return null;
  }
  try {
    const year = timestamp.substring(0, 4);
    const month = timestamp.substring(4, 6);
    const day = timestamp.substring(6, 8);
    const hour = timestamp.substring(8, 10);
    const minute = timestamp.substring(10, 12);
    const second = timestamp.substring(12, 14);
    // 毫秒是可选的，并且取前3位
    const millisecond =
      timestamp.length >= 17 ? timestamp.substring(14, 17) : "000";

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`;
  } catch (e) {
    logger.error(`时间戳转换失败: ${timestamp}`);
    return null;
  }
}
