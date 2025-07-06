import pool from "./pg-pool";
import { logger } from "../utils/logger";

/**
 * 等待数据库连接可用
 */
async function waitForDatabase(maxRetries: number = 5): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      logger.info("✅ PostgreSQL数据库连接成功");
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(
        `🔄 数据库连接尝试 ${i + 1}/${maxRetries} 失败: ${errorMessage}`
      );

      if (i === maxRetries - 1) {
        throw new Error(
          `数据库连接失败，已重试${maxRetries}次: ${errorMessage}`
        );
      }

      // 等待2秒后重试
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function initializePostgresDB(): Promise<void> {
  // 首先等待数据库连接可用
  await waitForDatabase();

  const client = await pool.connect();
  try {
    logger.info("🔧 开始创建PostgreSQL数据库表和索引...");

    // 创建 measurements 表
    logger.info("📊 创建 measurements 表...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS measurements (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        spec_id TEXT,
        spec_name TEXT,
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
        is_compliant INTEGER,
        is_calibration INTEGER,
        calibration_type TEXT,
        calibration_index INTEGER,
        corrected_data JSONB,
        calculated_data JSONB
      )
    `);
    logger.info("✅ measurements 表创建完成");

    // 创建 quality_records 表
    logger.info("📷 创建 quality_records 表...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS quality_records (
        client_ip TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        capture_time TIMESTAMPTZ,
        model_type TEXT,
        label TEXT,
        confidence REAL,
        frame_id INTEGER,
        fis INTEGER,
        fps INTEGER,
        filename TEXT,
        resolution TEXT,
        size_bytes INTEGER,
        size_formatted TEXT,
        jpeg_quality INTEGER,
        inference_time_ms REAL,
        capture_time_ms REAL,
        jpeg_encode_time_ms REAL,
        image TEXT,
        message_id TEXT,
        object_key TEXT,
        status TEXT,
        pc_num TEXT,
        PRIMARY KEY (client_ip, timestamp)
      )
    `);
    logger.info("✅ quality_records 表创建完成");

    // 创建索引
    logger.info("🔗 创建索引...");
    const indexes = [
      {
        name: "idx_measurements_timestamp",
        table: "measurements",
        column: "timestamp",
      },
      {
        name: "idx_measurements_spec_id",
        table: "measurements",
        column: "spec_id",
      },
      {
        name: "idx_measurements_compliance",
        table: "measurements",
        column: "is_compliant",
      },
      {
        name: "idx_quality_records_timestamp",
        table: "quality_records",
        column: "timestamp",
      },
      {
        name: "idx_quality_records_client_ip",
        table: "quality_records",
        column: "client_ip",
      },
      {
        name: "idx_quality_records_label",
        table: "quality_records",
        column: "label",
      },
      {
        name: "idx_quality_records_capture_time",
        table: "quality_records",
        column: "capture_time",
      },
      // 为聚合查询优化的复合索引
      {
        name: "idx_quality_records_time_group",
        table: "quality_records",
        column: "(SUBSTRING(timestamp, 1, 14))",
        sql: "CREATE INDEX IF NOT EXISTS idx_quality_records_time_group ON quality_records(SUBSTRING(timestamp, 1, 14))",
      },
      {
        name: "idx_quality_records_time_ip_composite",
        table: "quality_records",
        column: "(SUBSTRING(timestamp, 1, 14), client_ip)",
        sql: "CREATE INDEX IF NOT EXISTS idx_quality_records_time_ip_composite ON quality_records(SUBSTRING(timestamp, 1, 14), client_ip)",
      },
    ];

    for (const index of indexes) {
      try {
        if (index.sql) {
          // 使用自定义SQL创建复合索引
          await client.query(index.sql);
        } else {
          // 使用标准方式创建索引
          await client.query(
            `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.column})`
          );
        }
        logger.debug(`  ✓ 索引 ${index.name} 创建完成`);
      } catch (error) {
        logger.warn(
          `  ⚠️ 索引 ${index.name} 创建失败: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // 验证表是否创建成功
    logger.info("🔍 验证表创建状态...");
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('measurements', 'quality_records')
    `);

    const createdTables = tablesResult.rows.map((row) => row.table_name);
    logger.info(`📋 已创建的表: ${createdTables.join(", ")}`);

    if (
      createdTables.includes("measurements") &&
      createdTables.includes("quality_records")
    ) {
      logger.info("🎉 PostgreSQL数据库表和索引全部创建成功！");
    } else {
      throw new Error(
        `表创建不完整，期望: measurements, quality_records，实际: ${createdTables.join(
          ", "
        )}`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("❌ PostgreSQL数据库表创建失败:", errorMessage);
    throw error;
  } finally {
    client.release();
  }
}
