import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { logger } from "../utils/logger";
import path from "path";
import fs from "fs";

let db: Database<sqlite3.Database, sqlite3.Statement>;

/**
 * 初始化SQLite数据库
 */
export async function initializeSQLiteDB(): Promise<void> {
  try {
    const dbPath = process.env.DB_PATH || "./data";

    // 确保数据目录存在
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
      logger.info(`创建数据目录: ${dbPath}`);
    }

    const dbFile = path.join(dbPath, "measurements.sqlite");

    // 打开数据库连接
    db = await open({
      filename: dbFile,
      driver: sqlite3.Database,
    });

    // 创建测量数据表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        spec_id TEXT,                  -- 关联的规格ID (来自nedb)
        spec_name TEXT,                -- 规格名称 (可选，冗余存储)
        outer_max REAL,
        outer_avg REAL,
        outer_min REAL,
        inner_max REAL,
        inner_avg REAL,
        inner_min REAL,
        wall_max REAL,
        wall_avg REAL,
        wall_min REAL,
        outer_non_circularity REAL,
        inner_non_circularity REAL,
        is_compliant INTEGER,          -- 是否符合规格 (1=是, 0=否, NULL=未检查)
        corrected_data TEXT,           -- JSON存储修正后的数据
        caculated_data TEXT           -- JSON存储计算后的数据
      )
    `);

    // 创建时间索引
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_measurements_timestamp 
      ON measurements(timestamp)
    `);

    // 创建规格ID索引
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_measurements_spec_id 
      ON measurements(spec_id)
    `);

    // 创建合规性索引
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_measurements_compliance
      ON measurements(is_compliant)
    `);

    logger.info("SQLite数据库初始化完成");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`SQLite数据库初始化失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 保存测量数据
 * @param data 测量数据
 * @param specInfo 关联的规格信息，如果有的话
 */
export async function saveMeasurement(
  data: {
    timestamp: string;
    specId: string;
    correctedData: {
      outerAdjusted: number[];
      innerAdjusted: number[];
    };
    caculatedData: {
      outer_diameters: number[][];
      inner_diameters: number[][];
      wall_thicknesses: number[][];
      center: number[];
    };
    resultData: {
      outerStats: { max: number; avg: number; min: number };
      innerStats: { max: number; avg: number; min: number };
      wallStats: { max: number; avg: number; min: number };
      outerNonCircularity: number;
      innerNonCircularity: number;
    };
  },
  specInfo?: {
    id: string;
    name: string;
    specs: any; // 从nedb中获取的规格详情
  }
): Promise<any> {
  try {
    const timestamp = data.timestamp || new Date().toISOString();

    // 提取统计数据
    const {
      outerStats,
      innerStats,
      wallStats,
      outerNonCircularity,
      innerNonCircularity,
    } = data.resultData;

    // 将详细数据转为JSON字符串
    const caculatedData = JSON.stringify({
      outer_diameters: data.caculatedData.outer_diameters,
      inner_diameters: data.caculatedData.inner_diameters,
      wall_thicknesses: data.caculatedData.wall_thicknesses,
      center: data.caculatedData.center,
    });

    const correctedData = JSON.stringify({
      outerAdjusted: data.correctedData.outerAdjusted,
      innerAdjusted: data.correctedData.innerAdjusted,
    });

    // 判断合规性
    let isCompliant = null;

    if (specInfo) {
      const { specs } = specInfo;

      // 检查是否符合规格
      isCompliant =
        outerStats.max <= specs.outerDiameterMax + specs.shrinkage &&
        outerStats.min >= specs.outerDiameterMin + specs.shrinkage &&
        outerNonCircularity <= specs.outOfRoundness &&
        wallStats.max <= specs.wallThicknessMax &&
        wallStats.min >= specs.wallThicknessMin
          ? 1
          : 0;
    }

    // 插入数据
    const result = await db.run(
      `
      INSERT INTO measurements (
        timestamp,
        spec_id,
        spec_name,
        outer_max, outer_avg, outer_min,
        inner_max, inner_avg, inner_min,
        wall_max, wall_avg, wall_min,
        outer_non_circularity, inner_non_circularity,
        is_compliant,
        corrected_data,
        caculated_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        timestamp,
        data.specId || specInfo?.id || null,
        specInfo?.name || null,
        outerStats.max,
        outerStats.avg,
        outerStats.min,
        innerStats.max,
        innerStats.avg,
        innerStats.min,
        wallStats.max,
        wallStats.avg,
        wallStats.min,
        outerNonCircularity,
        innerNonCircularity,
        isCompliant,
        correctedData,
        caculatedData,
      ]
    );

    logger.debug(`测量数据已保存到SQLite，ID: ${result.lastID}`);
    return {
      id: result.lastID,
      timestamp,
      specId: specInfo?.id || null,
      isCompliant,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`保存测量数据失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取最近的测量数据
 */
export async function getRecentMeasurements(
  hours: number = 24,
  limit: number = 1000,
  specId?: string
): Promise<any[]> {
  try {
    const pastTime = new Date();
    pastTime.setHours(pastTime.getHours() - hours);
    const pastTimeStr = pastTime.toISOString();

    let query = `
      SELECT * FROM measurements
      WHERE timestamp >= ?
    `;

    const params: any[] = [pastTimeStr];

    if (specId) {
      query += ` AND spec_id = ?`;
      params.push(specId);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = await db.all(query, params);

    // 处理结果，解析JSON数据
    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      specId: row.spec_id,
      specName: row.spec_name,
      stats: {
        outer: {
          max: row.outer_max,
          avg: row.outer_avg,
          min: row.outer_min,
          nonCircularity: row.outer_non_circularity,
        },
        inner: {
          max: row.inner_max,
          avg: row.inner_avg,
          min: row.inner_min,
          nonCircularity: row.inner_non_circularity,
        },
        wall: {
          max: row.wall_max,
          avg: row.wall_avg,
          min: row.wall_min,
        },
      },
      isCompliant: row.is_compliant,
      correctedData: row.corrected_data ? JSON.parse(row.corrected_data) : null,
      caculatedData: row.caculated_data ? JSON.parse(row.caculated_data) : null,
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取测量数据失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取单条测量数据
 */
export async function getMeasurementById(id: number): Promise<any> {
  try {
    const row = await db.get(`SELECT * FROM measurements WHERE id = ?`, [id]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      timestamp: row.timestamp,
      specId: row.spec_id,
      specName: row.spec_name,
      stats: {
        outer: {
          max: row.outer_max,
          avg: row.outer_avg,
          min: row.outer_min,
          nonCircularity: row.outer_non_circularity,
        },
        inner: {
          max: row.inner_max,
          avg: row.inner_avg,
          min: row.inner_min,
          nonCircularity: row.inner_non_circularity,
        },
        wall: {
          max: row.wall_max,
          avg: row.wall_avg,
          min: row.wall_min,
        },
      },
      isCompliant: row.is_compliant,
      correctedData: row.corrected_data ? JSON.parse(row.corrected_data) : null,
      caculatedData: row.caculated_data ? JSON.parse(row.caculated_data) : null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取测量数据失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取合规性统计数据
 */
export async function getComplianceStats(
  startTime: string,
  endTime: string,
  specId?: string
): Promise<any> {
  try {
    let query = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN is_compliant = 1 THEN 1 ELSE 0 END) as compliant_count,
        SUM(CASE WHEN is_compliant = 0 THEN 1 ELSE 0 END) as non_compliant_count
      FROM measurements
      WHERE timestamp BETWEEN ? AND ?
    `;

    const params: any[] = [startTime, endTime];

    if (specId) {
      query += ` AND spec_id = ?`;
      params.push(specId);
    }

    const stats = await db.get(query, params);

    if (!stats || stats.total_count === 0) {
      return {
        totalCount: 0,
        compliantCount: 0,
        nonCompliantCount: 0,
        complianceRate: 0,
      };
    }

    const complianceRate =
      stats.total_count > 0
        ? (stats.compliant_count / stats.total_count) * 100
        : 0;

    return {
      totalCount: stats.total_count,
      compliantCount: stats.compliant_count,
      nonCompliantCount: stats.non_compliant_count,
      complianceRate: parseFloat(complianceRate.toFixed(2)),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取合规性统计失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取按规格分组的统计
 */
export async function getStatsBySpec(
  startTime: string,
  endTime: string
): Promise<any[]> {
  try {
    const rows = await db.all(
      `
      SELECT 
        spec_id,
        spec_name,
        COUNT(*) as total_count,
        SUM(CASE WHEN is_compliant = 1 THEN 1 ELSE 0 END) as compliant_count,
        SUM(CASE WHEN is_compliant = 0 THEN 1 ELSE 0 END) as non_compliant_count,
        AVG(outer_avg) as avg_outer,
        AVG(inner_avg) as avg_inner,
        AVG(wall_avg) as avg_wall
      FROM measurements
      WHERE timestamp BETWEEN ? AND ? AND spec_id IS NOT NULL
      GROUP BY spec_id, spec_name
      ORDER BY total_count DESC
    `,
      [startTime, endTime]
    );

    return rows.map((row) => {
      const complianceRate =
        row.total_count > 0 ? (row.compliant_count / row.total_count) * 100 : 0;

      return {
        specId: row.spec_id,
        specName: row.spec_name,
        totalCount: row.total_count,
        compliantCount: row.compliant_count,
        nonCompliantCount: row.non_compliant_count,
        complianceRate: parseFloat(complianceRate.toFixed(2)),
        averages: {
          outer: row.avg_outer,
          inner: row.avg_inner,
          wall: row.avg_wall,
        },
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取规格统计失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取时间段内的趋势数据
 */
export async function getTrendData(
  startTime: string,
  endTime: string,
  interval: "hour" | "day" = "hour",
  specId?: string
): Promise<any[]> {
  try {
    const timeFormat = interval === "hour" ? "%Y-%m-%d %H" : "%Y-%m-%d";

    let query = `
      SELECT 
        strftime('${timeFormat}', timestamp) as time_period,
        COUNT(*) as count,
        AVG(outer_avg) as avg_outer,
        AVG(inner_avg) as avg_inner,
        AVG(wall_avg) as avg_wall,
        AVG(outer_non_circularity) as avg_outer_non_circularity,
        AVG(inner_non_circularity) as avg_inner_non_circularity,
        SUM(CASE WHEN is_compliant = 1 THEN 1 ELSE 0 END) as compliant_count
      FROM measurements
      WHERE timestamp BETWEEN ? AND ?
    `;

    const params: any[] = [startTime, endTime];

    if (specId) {
      query += ` AND spec_id = ?`;
      params.push(specId);
    }

    query += ` GROUP BY time_period ORDER BY time_period`;

    const rows = await db.all(query, params);

    return rows.map((row) => {
      const complianceRate =
        row.count > 0 ? (row.compliant_count / row.count) * 100 : 0;

      return {
        timePeriod: row.time_period,
        count: row.count,
        averages: {
          outer: row.avg_outer,
          inner: row.avg_inner,
          wall: row.avg_wall,
          outerNonCircularity: row.avg_outer_non_circularity,
          innerNonCircularity: row.avg_inner_non_circularity,
        },
        compliantCount: row.compliant_count,
        complianceRate: parseFloat(complianceRate.toFixed(2)),
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取趋势数据失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 清理过期数据
 */
export async function cleanupOldData(daysToKeep: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString();

    const result = await db.run(
      `
      DELETE FROM measurements
      WHERE timestamp < ?
    `,
      [cutoffDateStr]
    );

    logger.info(`已清理 ${result.changes} 条过期数据`);

    // 清理后压缩数据库文件
    await db.exec("VACUUM");

    return result.changes || 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`清理过期数据失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 优化数据库
 */
export async function optimizeDatabase(): Promise<boolean> {
  try {
    // 重建索引
    await db.exec("REINDEX");

    // 压缩数据库
    await db.exec("VACUUM");

    logger.info("数据库优化完成");
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`数据库优化失败: ${errorMessage}`);
    return false;
  }
}

/**
 * 关闭数据库连接
 */
export async function closeSQLiteDB(): Promise<void> {
  if (db) {
    await db.close();
    logger.info("SQLite数据库连接已关闭");
  }
}
