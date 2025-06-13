import pool from "./pg-pool";
import { logger } from "../utils/logger";

export async function initializePostgresDB(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info("Setting up PostgreSQL database schema...");

    // 创建 measurements 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS measurements (
        id SERIAL PRIMARY KEY,
        timestamp TEXT NOT NULL,
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
        corrected_data JSONB,
        caculated_data JSONB
      )
    `);

    // 创建 quality_records 表
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

    // 创建索引
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_measurements_spec_id ON measurements(spec_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_measurements_compliance ON measurements(is_compliant)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_quality_records_timestamp ON quality_records(timestamp)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_quality_records_client_ip ON quality_records(client_ip)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_quality_records_label ON quality_records(label)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_quality_records_capture_time ON quality_records(capture_time)`
    );

    logger.info("PostgreSQL tables and indexes are set up successfully.");
  } catch (error) {
    logger.error("Error setting up PostgreSQL database schema:", error);
    throw error;
  } finally {
    client.release();
  }
}
