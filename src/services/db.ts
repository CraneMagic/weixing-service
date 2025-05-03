import path from "path";
import fs from "fs";
import Datastore from "nedb";
import { logger } from "../utils/logger";

// 数据库实例
let parameterDB: Datastore;

// 默认预置参数
const defaultParameters = [
  {
    key: "pipeSpecification",
    value: {
      dn20xen20: {
        materialSpec: "dn20xen2.0",
        outerDiameterMax: 20.6,
        outerDiameterMin: 20.1,
        avgOuterDiameterMax: 20.3,
        avgOuterDiameterMin: 20.05,
        outOfRoundness: 0.4,
        wallThicknessMax: 2.3,
        wallThicknessMin: 2,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn20xen23: {
        materialSpec: "dn20xen2.3",
        outerDiameterMax: 20.5,
        outerDiameterMin: 20.1,
        avgOuterDiameterMax: 20.3,
        avgOuterDiameterMin: 20.05,
        outOfRoundness: 0.4,
        wallThicknessMax: 2.7,
        wallThicknessMin: 2.3,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn20xen28: {
        materialSpec: "dn20xen2.8",
        outerDiameterMax: 20.5,
        outerDiameterMin: 20.1,
        avgOuterDiameterMax: 20.3,
        avgOuterDiameterMin: 20.05,
        outOfRoundness: 0.4,
        wallThicknessMax: 3.2,
        wallThicknessMin: 2.8,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn20xen34: {
        materialSpec: "dn20xen3.4",
        outerDiameterMax: 20.6,
        outerDiameterMin: 20.1,
        avgOuterDiameterMax: 20.3,
        avgOuterDiameterMin: 20.05,
        outOfRoundness: 0.4,
        wallThicknessMax: 3.9,
        wallThicknessMin: 3.4,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn25xen23: {
        materialSpec: "dn25xen2.3",
        outerDiameterMax: 25.6,
        outerDiameterMin: 25.1,
        avgOuterDiameterMax: 25.3,
        avgOuterDiameterMin: 25.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 2.7,
        wallThicknessMin: 2.3,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn25xen28: {
        materialSpec: "dn25xen2.8",
        outerDiameterMax: 25.6,
        outerDiameterMin: 25.1,
        avgOuterDiameterMax: 25.3,
        avgOuterDiameterMin: 25.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 3.2,
        wallThicknessMin: 2.8,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn25xen35: {
        materialSpec: "dn25xen3.5",
        outerDiameterMax: 25.6,
        outerDiameterMin: 25.1,
        avgOuterDiameterMax: 25.3,
        avgOuterDiameterMin: 25.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 4,
        wallThicknessMin: 3.5,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn25xen42: {
        materialSpec: "dn25xen4.2",
        outerDiameterMax: 25.6,
        outerDiameterMin: 25.1,
        avgOuterDiameterMax: 25.3,
        avgOuterDiameterMin: 25.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 4.8,
        wallThicknessMin: 4.2,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn32xen29: {
        materialSpec: "dn32xen2.9",
        outerDiameterMax: 32.6,
        outerDiameterMin: 32.1,
        avgOuterDiameterMax: 32.3,
        avgOuterDiameterMin: 32.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 3.3,
        wallThicknessMin: 2.9,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn32xen36: {
        materialSpec: "dn32xen3.6",
        outerDiameterMax: 32.6,
        outerDiameterMin: 32.1,
        avgOuterDiameterMax: 32.3,
        avgOuterDiameterMin: 32.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 4.1,
        wallThicknessMin: 3.6,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn32xen44: {
        materialSpec: "dn32xen4.4",
        outerDiameterMax: 32.6,
        outerDiameterMin: 32.1,
        avgOuterDiameterMax: 32.3,
        avgOuterDiameterMin: 32.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 5,
        wallThicknessMin: 4.4,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
      dn32xen54: {
        materialSpec: "dn32xen5.4",
        outerDiameterMax: 32.6,
        outerDiameterMin: 32.1,
        avgOuterDiameterMax: 32.3,
        avgOuterDiameterMin: 32.05,
        outOfRoundness: 0.5,
        wallThicknessMax: 6.1,
        wallThicknessMin: 5.4,
        wallThicknessTolerance: 0.2,
        shrinkage: 0.99,
      },
    },
  },
  {
    key: "cameraConfig",
    value: {
      default: {
        exposure: 0.1,
        gain: 100,
        awb_mode: 1,
        luma: 100,
        contrast: 100,
        saturation: 100,
      },
      camera1: {
        exposure: 0.1,
        gain: 100,
        awb_mode: 1,
        luma: 100,
        contrast: 100,
        saturation: 100,
      },
      camera2: {
        exposure: 0.1,
        gain: 100,
        awb_mode: 1,
        luma: 100,
        contrast: 100,
        saturation: 100,
      },
      camera3: {
        exposure: 0.1,
        gain: 100,
        awb_mode: 1,
        luma: 100,
        contrast: 100,
        saturation: 100,
      },
    },
  },
  {
    key: "correctionValue",
    value: {
      outerDiameterCorrectionValue: -18400,
      innerDiameterCorrectionValue: 4550,
    },
  },
];

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

  // 添加索引
  parameterDB.ensureIndex({ fieldName: "key", unique: true }, (err) => {
    if (err) {
      logger.error(`创建索引失败: ${err.message}`);
    }
  });

  // 初始化默认参数
  initializeDefaultParameters();

  logger.info("数据库初始化完成");
}

/**
 * 初始化默认参数
 */
async function initializeDefaultParameters(): Promise<void> {
  try {
    // 检查是否已经初始化过
    const count = await countParameters();
    if (count === 0) {
      logger.info("正在初始化默认参数...");

      // 插入默认参数
      for (const param of defaultParameters) {
        await saveParameter(param.key, param.value);
      }

      logger.info(`已成功初始化${defaultParameters.length}个默认参数`);
    } else {
      logger.info(`数据库中已有${count}个参数，跳过默认参数初始化`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`初始化默认参数失败: ${errorMessage}`);
  }
}

/**
 * 获取参数总数
 */
export function countParameters(): Promise<number> {
  return new Promise((resolve, reject) => {
    getParameterDB().count({}, (err: Error | null, count: number) => {
      if (err) {
        reject(err);
      } else {
        resolve(count);
      }
    });
  });
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
 * 获取嵌套参数
 * 示例: getNestedParameter("deviceConfig", "network.ip")
 */
export async function getNestedParameter(
  key: string,
  nestedPath: string
): Promise<any> {
  try {
    const doc = await getParameter(key);
    if (!doc) {
      return null;
    }

    return getValueByPath(doc.value, nestedPath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取嵌套参数失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 更新嵌套参数
 * 示例: updateNestedParameter("deviceConfig", "network.ip", "192.168.1.200")
 */
export async function updateNestedParameter(
  key: string,
  nestedPath: string,
  value: any
): Promise<any> {
  try {
    const doc = await getParameter(key);
    if (!doc) {
      throw new Error(`参数 ${key} 不存在`);
    }

    const updatedValue = setValueByPath(doc.value, nestedPath, value);
    return saveParameter(key, updatedValue);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`更新嵌套参数失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 根据路径获取对象中的值
 * 示例: getValueByPath({network: {ip: "192.168.1.100"}}, "network.ip")
 */
function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) {
    return undefined;
  }

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * 根据路径设置对象中的值
 * 示例: setValueByPath({network: {ip: "192.168.1.100"}}, "network.ip", "192.168.1.200")
 */
function setValueByPath(obj: any, path: string, value: any): any {
  if (!obj || !path) {
    return obj;
  }

  // 创建对象的深拷贝，避免修改原对象
  const result = JSON.parse(JSON.stringify(obj));
  const parts = path.split(".");
  let current = result;

  // 遍历除最后一个节点外的所有路径节点
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    // 如果路径节点不存在，则创建一个空对象
    if (
      current[part] === undefined ||
      current[part] === null ||
      typeof current[part] !== "object"
    ) {
      current[part] = {};
    }

    current = current[part];
  }

  // 设置最后一个节点的值
  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;

  return result;
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
