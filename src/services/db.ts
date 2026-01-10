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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
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
        shrinkage: 0.2,
      },
    },
  },
  {
    key: "cameraConfig",
    value: {
      default: {
        id: "default",
        exposure: 512,
        gain: 2048,
        awb_mode: 0,
        wb_gain: [0.134, 0.0625, 0.0625, 0.1239], // 白平衡增益，格式为 [R, Gr, Gb, B] 数组
        luma: 60,
        contrast: 75,
        saturation: 50,

        fps: 12,
        width: 1200,
        jpeg_quality: 80,
        label_score_threshold: 0.35,
        detection_score_threshold: 35,
        force_pass: false,
      },
    },
  },
  {
    key: "correctionValue",
    value: {
      outerDiameterCorrectionValue: -18075,
      innerDiameterCorrectionValue: 4650,
      maxValueAdjustmentFactor: 1,

      calibrationFactorForOuterDiameter: 1,
      calibrationFactorForInnerDiameter: 1,
      calibrationFactorForWallThickness: 1,

      enableArrayCorrection: false,
      outerCorrectionArray: [
        -32.38681805, -18.22305641, -4.986221453, -3.260634572, 2.723747708,
        8.834556535, 18.16297731, 27.77497291, 31.39322547, 40.33463507,
        40.14468353, 37.30152449, 25.19493319, 19.03725283, 3.651949916,
        -10.91549582, -21.37885989, -19.74213334, -12.18625801, -5.079505025,
        -1.845141314, 1.561972579, 8.357337573, 17.44964457, 26.37629609,
        32.58460814, 40.70964718, 47.7889409, 54.45757287, 51.1545198,
        37.59521347, 12.16527326, -4.871331283, -7.185560242, -9.723633564,
        -19.13216452, -29.54034688, -31.31590084, -36.94101089, -51.53094995,
        -56.45370539, -53.59969951, -52.27666687, -45.75402601, -22.6436455,
        -6.065199424, -5.14228269, -0.880100318, 1.265247612, 6.618737942,
        7.871197639, 9.987115082, 8.145761793, 8.424879653, 10.21537791,
        12.19070443, 15.96596019, 13.76494339, 11.40764962, 9.279747023,
        9.15500959, 7.139333285, 5.648610816, 7.036987359, 9.525252104,
        11.42200965, 8.967660542, 5.172591158, 0.497705439, -1.532577467,
        -2.180571123, -2.710239514, -2.672883213, 0.212068611, 1.602576274,
        -0.218983958, -2.278128063, -0.835198179, -0.056922222, -0.524392781,
        -2.496523071, -0.872583836, 2.247650016, 9.276734681, 14.74951384,
        16.0869522, 16.105066, 14.00142117, 13.88091674, 10.25441449,
        10.95261895, 6.234005721, 5.038723124, 4.292291352, 3.617926228,
        1.647335262, 1.780283336, 5.022362464, 4.060502327, 2.667962992,
        -1.867690643, -6.61607115, -11.28350012, -13.44081229, -8.889671194,
        -4.532927619, -3.248029477, -6.715695356, -5.845780973, -1.907470274,
        7.031476881, 14.05777163, 16.56988976, 17.63742081, 19.29444788,
        15.41932122, 5.814139499, -4.473985998, -14.72044051, -17.05469603,
        -19.3696671, -16.76625596, -22.27340952, -20.4491245, -24.89651998,
        -28.40720632, -33.13739163, -34.18627436, -27.09920719, -19.9613252,
        -9.218454994, -14.06428108, -9.274351982, 12.26114377, 35.05650985,
        35.35476485, 27.52594565, 30.44175015, 34.1530272, 35.53163292,
        31.22757676, 25.99237543, 19.33032191, 7.851234585, 0.104162957,
        -3.206995528, -3.242333218, -1.248600649, 4.220653985, 4.766340139,
        0.604792006, 0.936992909, 4.06662464, 7.253638365, 4.007854637,
        -0.240090027, 0.080798992, 0.495243796, -0.733761688, -1.014638241,
        3.761301827, 5.462738498, 5.118572703, 5.753776187, 4.164253692,
        2.947860694, 4.843460097, 12.3284301, 15.93643464, 14.98613891,
        9.157222195, 8.126986375, 9.055592262, 13.08115609, 10.19415013,
        -3.331591901, -21.35855779, -33.16218873, -38.6665572, -40.54755807,
        -29.2873723, -16.61363372, -6.248852184, -6.581006653, -8.583746548,
        -5.495539592, 1.028022629, 3.376564034, 0.081237448, 6.082052997,
        13.5045197, 18.08875555, 12.12913687, 8.643549944, 9.431886035,
        5.657909566, -9.838619223, -31.76472264, -34.36142761, -34.5092751,
      ],
      innerCorrectionArray: [
        1.555479348, -0.70667746, -1.855051244, 3.302427257, 3.587000467,
        1.805510958, 2.312849943, 7.305405829, 15.43605654, 15.43287642,
        14.46254127, 13.73614384, 14.35345903, 12.29311194, 13.21277526,
        14.97853069, 19.10247866, 21.07752904, 17.43447533, 13.32665773,
        20.44192844, 34.30674105, 37.29121788, 28.70957689, 24.59145954,
        32.64389954, 44.48087786, 52.41953816, 50.19006413, 41.58832521,
        36.99045352, 42.64302922, 41.08781402, 34.69215481, 35.39747602,
        48.62753462, 62.92359639, 65.60110334, 58.9820389, 56.06686953,
        58.97087548, 58.93520339, 66.10978189, 69.7907108, 69.91589351,
        72.8251102, 79.41108176, 76.81174612, 72.27201856, 76.54233685,
        81.64332598, 88.07384809, 92.02449957, 93.67159061, 86.23835044,
        77.9665815, 79.33340678, 84.67825474, 88.12467272, 89.06125111,
        86.17501833, 84.179006, 90.26972389, 98.30577839, 93.66863214,
        87.67921576, 90.1554802, 90.60266044, 87.05361008, 84.26119358,
        82.84138573, 80.45487064, 85.96127811, 95.68718289, 99.05813613,
        100.1256863, 96.09707446, 90.70501881, 88.91515849, 98.0025233,
        96.93178085, 81.85812176, 75.20498898, 85.24950155, 97.1653762,
        103.7111982, 105.2128649, 106.356543, 99.13926836, 94.01870865,
        90.88302403, 91.83594846, 91.17873738, 92.72921757, 96.20897968,
        95.02756389, 93.67189494, 87.97002426, 85.45193245, 89.60001583,
        94.70229866, 93.84152808, 91.78267898, 92.85927074, 87.24624003,
        84.24113396, 81.75757511, 80.63959161, 77.71076426, 74.55916646,
        74.98780324, 80.31670312, 84.51855974, 71.24557785, 56.1867966,
        51.56109176, 58.80375785, 61.61100933, 59.53689714, 58.95951166,
        59.88610197, 52.29722072, 49.64867077, 55.58152645, 55.14918952,
        55.51515854, 59.6199377, 60.68426994, 54.38894346, 52.47321024,
        48.36304723, 43.73457767, 38.64612328, 26.41659391, 27.31792754,
        43.31110441, 50.91344016, 41.06753549, 32.49358437, 31.04950394,
        27.74958611, 25.11515481, 23.95154574, 24.74753582, 20.48903834,
        18.87998301, 22.36125284, 20.05665629, 15.11965003, 16.49428245,
        20.73627128, 18.47446684, 14.25805893, 15.14201, 17.62787972,
        17.51858377, 9.576334998, 7.790488205, 6.686043799, 3.535800491,
        -1.215684538, 1.297214378, 0.649941579, -6.488596318, -10.56867438,
        -7.509640647, -6.206051284, -9.897456088, -11.26945287, -14.10700445,
        -16.07784872, -18.37736341, -17.67940329, -23.87863017, -27.86904809,
        -25.23986175, -20.85205413, -20.27840573, -19.78482507, -15.88070017,
        -21.22919837, -29.06290105, -36.04331612, -33.14312439, -19.56287237,
        -3.563792425, 6.227807988, 2.690417982, -9.916663844, -36.316266,
        -61.64897628, -81.05271324, -88.45125826, -83.3172029, -60.19136476,
        -19.54252173, 14.93483103, 19.92412016, -1.251884867, -23.43359578,
      ],
    },
  },
  {
    key: "calibrationConfig",
    value: {
      A: {
        calibrationType: "A",
        outerDiameterStandardAvgValue: 20.0,
        innerDiameterStandardAvgValue: 0,
        wallThicknessStandardAvgValue: 3.94,
      },
      B: {
        calibrationType: "B",
        outerDiameterStandardAvgValue: 24.98,
        innerDiameterStandardAvgValue: 0,
        wallThicknessStandardAvgValue: 2.48,
      },
      C: {
        calibrationType: "C",
        outerDiameterStandardAvgValue: 32.0,
        innerDiameterStandardAvgValue: 0,
        wallThicknessStandardAvgValue: 3.94,
      },
    },
  },
  {
    key: "pipeMeasurement",
    value: {
      offset: 0,
    },
  },
  {
    key: "computerVisionCalibrationFactors",
    value: {
      "0": 0.0416,
      "1": 0.0493,
      "2": 0.0478,
    },
  },
  {
    key: "computerVisionBaselineMat",
    value: {
      Dref_mm: 25.0,
      xc0_px: [601.1574190889233, 565.8819005869678, 637.7255914944594],
      w0_px: [522.6642010069755, 495.2844233945097, 505.2114915357633],
      s0_mm_per_px: [0.047831858297994176, 0.05047604733590967, 0.049484226742356835],
      Z0_mm: [200.0, 200.0, 200.0],
      k_px_per_mm: [],
      dxSign: [1.0, 1.0, 1.0],
      camIPList: ["192.168.1.160", "192.168.1.161", "192.168.1.162"],
      nFramesUsed: [8, 9, 7],
      timestamp: "2026-01-08 23:02:05",
      vp_opts: {
        gray_mode: "rgb2gray",
        otsu_step: 2,
        minWidthPx: 20.0,
      },
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

/**
 * 从 defaultParameters 中查找参数的默认值
 */
function getDefaultParameterValue(key: string): any | undefined {
  const defaultParam = defaultParameters.find((param) => param.key === key);
  return defaultParam?.value;
}

/**
 * 获取参数，如果不存在且在defaultParameters中有定义，则创建默认值
 */
export async function getParameterOrCreate(key: string): Promise<any> {
  try {
    const doc = await getParameter(key);

    if (!doc) {
      // 参数不存在，查找默认值
      const defaultValue = getDefaultParameterValue(key);

      if (defaultValue !== undefined) {
        // 在 defaultParameters 中找到了，创建默认值
        logger.info(`参数 ${key} 不存在，从 defaultParameters 创建默认值`);
        await saveParameter(key, defaultValue);
        return defaultValue;
      }

      // 没有默认值定义，返回 null
      logger.warn(`参数 ${key} 不存在且无默认值定义`);
      return null;
    }

    return doc.value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取或创建参数失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取嵌套参数，如果参数不存在且在defaultParameters中有定义，则创建默认值
 */
export async function getNestedParameterOrCreate(
  key: string,
  nestedPath: string
): Promise<any> {
  try {
    const doc = await getParameter(key);

    if (!doc) {
      // 参数不存在，查找默认值
      const defaultValue = getDefaultParameterValue(key);

      if (defaultValue !== undefined) {
        // 在 defaultParameters 中找到了，创建完整对象
        logger.info(`参数 ${key} 不存在，从 defaultParameters 创建默认值`);
        await saveParameter(key, defaultValue);

        // 返回嵌套路径的值
        const nestedValue = getValueByPath(defaultValue, nestedPath);
        return nestedValue !== undefined ? nestedValue : null;
      }

      // 没有默认值定义，返回 null
      logger.warn(`参数 ${key} 不存在且无默认值定义`);
      return null;
    }

    // 参数存在，返回嵌套值
    const value = getValueByPath(doc.value, nestedPath);
    return value !== undefined ? value : null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取或创建嵌套参数失败: ${errorMessage}`);
    throw error;
  }
}
