import path from "path";
import fs from "fs";
import Datastore from "nedb";
import { logger } from "../utils/logger";

// 数据库实例
let parameterDB: Datastore;

/**
 * 初始化数据库
 */
export function initializeDatabase(): void {
  const dbPath = process.env.DB_PATH || "./data";

  // 确保数据目录存在
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
    logger.info(`创建数据目录: ${dbPath}`);
  }

  // 初始化参数数据库
  parameterDB = new Datastore({
    filename: path.join(dbPath, "parameters.db"),
    autoload: true,
  });

  logger.info("数据库初始化完成");
}

/**
 * 获取参数数据库实例
 */
export function getParameterDB(): Datastore {
  if (!parameterDB) {
    throw new Error("数据库未初始化");
  }
  return parameterDB;
}

/**
 * 存储参数
 */
export async function saveParameter(key: string, value: any): Promise<any> {
  return new Promise((resolve, reject) => {
    getParameterDB().update(
      { key },
      { key, value, updatedAt: new Date() },
      { upsert: true },
      (err, numReplaced) => {
        if (err) {
          reject(err);
        } else {
          resolve({ key, value, updated: numReplaced });
        }
      }
    );
  });
}

/**
 * 获取参数
 */
export async function getParameter(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    getParameterDB().findOne({ key }, (err: Error | null, doc: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(doc);
      }
    });
  });
}

/**
 * 获取所有参数
 */
export async function getAllParameters(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    getParameterDB().find({}, (err: Error | null, docs: any[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(docs);
      }
    });
  });
}

/**
 * 删除参数
 */
export async function deleteParameter(key: string): Promise<number> {
  return new Promise((resolve, reject) => {
    getParameterDB().remove(
      { key },
      {},
      (err: Error | null, numRemoved: number) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      }
    );
  });
}
