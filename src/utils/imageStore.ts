import fs from "fs";
import path from "path";
import { logger } from "./logger";

const imageDir = path.join(process.env.DB_PATH || "./data", "images");

/**
 * 确保图片存储目录存在
 */
function ensureImageDirExists(): void {
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
    logger.info(`创建图片存储目录: ${imageDir}`);
  }
}

/**
 * 将Base64编码的图片保存为文件
 * @param base64Image Base64编码的图片字符串
 * @param filename 不带扩展名的文件名
 * @returns 保存的文件名 (带扩展名)
 */
export function saveImageFromBase64(
  base64Image: string,
  filename: string
): string | null {
  ensureImageDirExists();

  try {
    // 移除base64头 (e.g., "data:image/jpeg;base64,")
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const imagePath = path.join(imageDir, `${filename}.jpg`);

    fs.writeFileSync(imagePath, buffer);
    logger.debug(`图片已保存: ${imagePath}`);

    return `${filename}.jpg`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`保存图片失败: ${errorMessage}`);
    return null;
  }
}

/**
 * 获取图片的完整路径
 * @param filename 带扩展名的文件名
 * @returns 图片的绝对路径，如果不存在则返回null
 */
export function getImagePath(filename: string): string | null {
  const absoluteImageDir = path.resolve(imageDir);
  const imagePath = path.join(absoluteImageDir, filename);

  // 安全性检查：确保文件名不会导致目录遍历
  if (path.dirname(imagePath) !== absoluteImageDir) {
    logger.warn(`检测到潜在的目录遍历攻击: ${filename}`);
    return null;
  }

  logger.info(`正在检查图片路径: ${imagePath}`);
  if (fs.existsSync(imagePath)) {
    return imagePath;
  }

  return null;
}

/**
 * 统一的图像保存函数，支持 Buffer 和 Base64 字符串
 * @param imageData 图像数据 (Buffer 或 Base64 字符串)
 * @param clientIp 客户端IP
 * @param timestamp 时间戳
 * @returns 保存的文件名 (带扩展名)，失败时返回null
 */
export function saveImage(
  imageData: string | Buffer | null,
  clientIp: string,
  timestamp: string
): string | null {
  if (!imageData) return null;

  ensureImageDirExists();

  try {
    const filename = `${clientIp}_${timestamp}`;
    const imagePath = path.join(imageDir, `${filename}.jpg`);

    if (Buffer.isBuffer(imageData)) {
      // 直接保存 Buffer 数据
      fs.writeFileSync(imagePath, imageData);
      logger.debug(`图片已保存 (Buffer): ${imagePath}`);
    } else if (typeof imageData === "string") {
      // 处理 Base64 字符串
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(imagePath, buffer);
      logger.debug(`图片已保存 (Base64): ${imagePath}`);
    } else {
      logger.error(`不支持的图像数据类型: ${typeof imageData}`);
      return null;
    }

    return `${filename}.jpg`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`保存图片失败: ${errorMessage}`);
    return null;
  }
}
