import fs from "fs";
import path from "path";
import { logger } from "./logger";

const imageDir = path.join(process.env.DB_PATH || "./data", "/images");

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
 * 检查磁盘剩余空间
 * @param fileSizeBytes 要写入的文件大小（字节）
 * @returns 是否有足够空间
 */
async function checkDiskSpace(fileSizeBytes: number): Promise<{
  hasSpace: boolean;
  freeSpace: number;
  totalSpace: number;
}> {
  try {
    const stats = await fs.promises.statfs(imageDir);
    const freeSpace = stats.bavail * stats.bsize; // 可用空间
    const totalSpace = stats.blocks * stats.bsize; // 总空间

    // 保留至少100MB的安全空间
    const safetyMargin = 100 * 1024 * 1024; // 100MB
    const hasSpace = freeSpace > fileSizeBytes + safetyMargin;

    return {
      hasSpace,
      freeSpace,
      totalSpace,
    };
  } catch (error) {
    // 如果无法获取磁盘信息，假设有空间但记录警告
    logger.warn(
      `无法获取磁盘空间信息: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {
      hasSpace: true,
      freeSpace: -1,
      totalSpace: -1,
    };
  }
}

/**
 * 将Base64编码的图片保存为文件（异步版本）
 * @param base64Image Base64编码的图片字符串
 * @param filename 不带扩展名的文件名
 * @returns 保存的文件名 (带扩展名)
 */
export async function saveImageFromBase64(
  base64Image: string,
  filename: string
): Promise<string | null> {
  ensureImageDirExists();

  try {
    // 移除base64头 (e.g., "data:image/jpeg;base64,")
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const imagePath = path.join(imageDir, `${filename}.jpg`);

    // 检查磁盘空间
    const diskCheck = await checkDiskSpace(buffer.length);
    if (!diskCheck.hasSpace) {
      const freeSpaceMB = Math.round(diskCheck.freeSpace / 1024 / 1024);
      const fileSizeMB = Math.round(buffer.length / 1024 / 1024);
      logger.warn(
        `磁盘空间不足！剩余空间: ${freeSpaceMB}MB, 需要: ${fileSizeMB}MB，尝试自动清理...`
      );

      // 尝试自动清理释放空间
      try {
        const { checkAndCleanIfNeeded } = await import("./cleanup");
        const cleanupResult = await checkAndCleanIfNeeded();

        if (
          cleanupResult.emergencyTriggered &&
          cleanupResult.cleanupResult?.success
        ) {
          logger.info(
            `自动清理释放了 ${Math.round(
              (cleanupResult.cleanupResult.spaceFreed || 0) / 1024 / 1024
            )}MB 空间`
          );

          // 重新检查磁盘空间
          const newDiskCheck = await checkDiskSpace(buffer.length);
          if (newDiskCheck.hasSpace) {
            logger.info("自动清理后空间充足，继续保存图片");
            // 继续执行后面的保存操作
          } else {
            throw new Error(
              `DISK_FULL_AFTER_CLEANUP: 清理后空间仍不足，剩余 ${Math.round(
                newDiskCheck.freeSpace / 1024 / 1024
              )}MB`
            );
          }
        } else {
          throw new Error(
            `DISK_FULL: 磁盘空间不足且清理失败，剩余 ${freeSpaceMB}MB`
          );
        }
      } catch (cleanupError) {
        const cleanupErrorMsg =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        throw new Error(
          `DISK_FULL: 磁盘空间不足，自动清理失败: ${cleanupErrorMsg}`
        );
      }
    }

    // 使用异步writeFile替代同步writeFileSync
    await fs.promises.writeFile(imagePath, buffer);
    logger.debug(`图片已保存: ${imagePath}`);

    return `${filename}.jpg`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 根据错误类型提供更详细的日志
    if (errorMessage.includes("ENOSPC")) {
      logger.error(`磁盘空间不足，无法保存图片: ${filename}`);
    } else if (errorMessage.includes("EACCES")) {
      logger.error(`权限不足，无法保存图片: ${filename}`);
    } else if (errorMessage.includes("DISK_FULL")) {
      logger.error(`预检查发现磁盘空间不足: ${filename}`);
    } else {
      logger.error(`保存图片失败 (${filename}): ${errorMessage}`);
    }

    // 抛出错误而不是返回null，让上层决定如何处理
    throw new Error(`IMAGE_SAVE_FAILED: ${errorMessage}`);
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
 * 获取磁盘空间信息
 * @returns 磁盘空间统计信息
 */
export async function getDiskSpaceInfo(): Promise<{
  freeSpace: number;
  totalSpace: number;
  usedSpace: number;
  freeSpacePercent: number;
  usedSpacePercent: number;
  warning: string | null;
}> {
  try {
    const stats = await fs.promises.statfs(imageDir);
    const freeSpace = stats.bavail * stats.bsize;
    const totalSpace = stats.blocks * stats.bsize;
    const usedSpace = totalSpace - freeSpace;
    const freeSpacePercent = (freeSpace / totalSpace) * 100;
    const usedSpacePercent = (usedSpace / totalSpace) * 100;

    let warning: string | null = null;
    if (freeSpacePercent < 5) {
      warning = "严重警告：磁盘空间不足5%，建议立即清理！";
    } else if (freeSpacePercent < 15) {
      warning = "警告：磁盘空间不足15%，建议清理旧文件";
    }

    return {
      freeSpace,
      totalSpace,
      usedSpace,
      freeSpacePercent: Math.round(freeSpacePercent * 100) / 100,
      usedSpacePercent: Math.round(usedSpacePercent * 100) / 100,
      warning,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取磁盘空间信息失败: ${errorMessage}`);
    throw new Error(`无法获取磁盘空间信息: ${errorMessage}`);
  }
}

/**
 * 获取图片目录的统计信息
 * @returns 图片目录统计信息
 */
export async function getImageDirStats(): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
  oldestFile: string | null;
  newestFile: string | null;
  avgFileSizeBytes: number;
}> {
  try {
    if (!fs.existsSync(imageDir)) {
      return {
        totalFiles: 0,
        totalSizeBytes: 0,
        oldestFile: null,
        newestFile: null,
        avgFileSizeBytes: 0,
      };
    }

    const files = await fs.promises.readdir(imageDir);
    const imageFiles = files.filter(
      (file) =>
        file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".png")
    );

    if (imageFiles.length === 0) {
      return {
        totalFiles: 0,
        totalSizeBytes: 0,
        oldestFile: null,
        newestFile: null,
        avgFileSizeBytes: 0,
      };
    }

    let totalSizeBytes = 0;
    let oldestTime = Number.MAX_SAFE_INTEGER;
    let newestTime = 0;
    let oldestFile: string | null = null;
    let newestFile: string | null = null;

    for (const file of imageFiles) {
      const filePath = path.join(imageDir, file);
      const stats = await fs.promises.stat(filePath);
      totalSizeBytes += stats.size;

      const fileTime = stats.mtime.getTime();
      if (fileTime < oldestTime) {
        oldestTime = fileTime;
        oldestFile = file;
      }
      if (fileTime > newestTime) {
        newestTime = fileTime;
        newestFile = file;
      }
    }

    return {
      totalFiles: imageFiles.length,
      totalSizeBytes,
      oldestFile,
      newestFile,
      avgFileSizeBytes: Math.round(totalSizeBytes / imageFiles.length),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取图片目录统计信息失败: ${errorMessage}`);
    throw new Error(`无法获取图片目录统计信息: ${errorMessage}`);
  }
}
