import pool from "./pg-pool";
import { logger } from "../utils/logger";
import type { QualityRecord } from "../types/quality-record";
import { convertTimestampToISO } from "../utils/time";
import { saveImageFromBase64 } from "../utils/imageStore";

// Using `import type` and re-exporting for consumers of this module
export type { QualityRecord };

const NOT_IMPLEMENTED_ERROR =
  "This function is not yet implemented for PostgreSQL.";

export async function saveMeasurement(data: any, specInfo?: any): Promise<any> {
  const {
    timestamp,
    specId,
    correctedData,
    caculatedData, // from the flattened object provided by user
    resultData,
    isCompliant, // assuming it's pre-calculated and passed in `data`
    isCalibration,
    calibrationType,
    calibrationIndex,
  } = data;

  // 标准化 isCalibration，只允许运行 0/1
  const isCalibrationNormalized =
    isCalibration === 1 || isCalibration === "1" || isCalibration === true
      ? 1
      : 0;

  const sql = `
    INSERT INTO measurements (
      timestamp, spec_id, spec_name, 
      outer_max, outer_avg, outer_min, 
      inner_max, inner_avg, inner_min, 
      wall_max, wall_avg, wall_min, 
      outer_non_circularity, inner_non_circularity, 
      is_compliant, is_calibration, calibration_type, calibration_index, 
      corrected_data, calculated_data
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    ) RETURNING *;
  `;

  const values = [
    timestamp, // Already in ISO format
    specId,
    specInfo?.name,
    resultData?.outerStats?.max,
    resultData?.outerStats?.avg,
    resultData?.outerStats?.min,
    resultData?.innerStats?.max,
    resultData?.innerStats?.avg,
    resultData?.innerStats?.min,
    resultData?.wallStats?.max,
    resultData?.wallStats?.avg,
    resultData?.wallStats?.min,
    resultData?.outerNonCircularity,
    resultData?.innerNonCircularity,
    isCompliant,
    isCalibrationNormalized,
    calibrationType,
    calibrationIndex,
    correctedData,
    caculatedData, // Map incoming `caculatedData` to `calculated_data` column
  ];

  try {
    const result = await pool.query(sql, values);
    logger.debug(
      `Measurement saved to PostgreSQL with ID: ${result.rows[0].id}`
    );
    return result.rows[0];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to save measurement to PostgreSQL: ${errorMessage}`, {
      sql,
      values: values.map((v) =>
        JSON.stringify(v)?.length > 200 ? "DATA_TOO_LONG" : v
      ), // Avoid logging huge data
    });
    throw error;
  }
}

export async function getMeasurements(options: {
  limit?: number;
  offset?: number;
  spec_id?: string;
  spec_name?: string;
  is_compliant?: string;
  is_calibration?: string;
  calibration_type?: string;
  calibration_index?: string;
  startTime?: string;
  endTime?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}): Promise<{
  data: any[];
  total: number;
  page: number;
  limit: number;
}> {
  const {
    limit = 20,
    offset = 0,
    spec_id,
    spec_name,
    is_compliant,
    is_calibration,
    calibration_type,
    calibration_index,
    startTime,
    endTime,
    sortBy = "timestamp",
    sortOrder = "DESC",
  } = options;

  const validSortBy = [
    "id",
    "timestamp",
    "spec_id",
    "spec_name",
    "is_compliant",
    "is_calibration",
    "calibration_type",
    "calibration_index",
    "outer_max",
    "outer_avg",
    "outer_min",
    "inner_max",
    "inner_avg",
    "inner_min",
    "wall_max",
    "wall_avg",
    "wall_min",
    "outer_non_circularity",
    "inner_non_circularity",
  ];
  const orderBy = validSortBy.includes(sortBy) ? `"${sortBy}"` : "timestamp";
  const orderDirection = sortOrder === "ASC" ? "ASC" : "DESC";

  let query = `SELECT * FROM measurements`;
  let countQuery = `SELECT COUNT(*) as total FROM measurements`;
  const params: any[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  if (spec_id) {
    conditions.push(`spec_id = $${paramIndex++}`);
    params.push(spec_id);
  }
  if (spec_name) {
    conditions.push(`spec_name LIKE $${paramIndex++}`);
    params.push(`%${spec_name}%`);
  }
  if (is_compliant) {
    conditions.push(`is_compliant = $${paramIndex++}`);
    params.push(parseInt(is_compliant, 10));
  }
  if (is_calibration !== undefined) {
    const calib = parseInt(is_calibration as any, 10);
    if (calib === 0 || calib === 1) {
      conditions.push(`is_calibration = $${paramIndex++}`);
      params.push(calib);
    }
    // 非 0/1 的值将被忽略，不加入过滤条件
  }
  if (calibration_type) {
    const typeUpper = String(calibration_type).toUpperCase();
    if (["A", "B", "C"].includes(typeUpper)) {
      conditions.push(`calibration_type = $${paramIndex++}`);
      params.push(typeUpper);
    }
    // 不在 A/B/C 范围内的值将被忽略
  }
  if (calibration_index !== undefined) {
    const idx = parseInt(calibration_index as any, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= 11) {
      conditions.push(`calibration_index = $${paramIndex++}`);
      params.push(idx);
    }
    // 超出 1-11 范围或非数字均被忽略
  }
  if (startTime) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(endTime);
  }

  if (conditions.length > 0) {
    const whereClause = ` WHERE ` + conditions.join(" AND ");
    query += whereClause;
    countQuery += whereClause;
  }

  try {
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    return {
      data: rows,
      total,
      page: offset / limit + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get measurements from PostgreSQL: ${errorMessage}`);
    throw error;
  }
}

export async function getMeasurementsCsv(options: {
  spec_id?: string;
  spec_name?: string;
  is_compliant?: string;
  is_calibration?: string;
  calibration_type?: string;
  calibration_index?: string;
  startTime?: string;
  endTime?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}): Promise<any[]> {
  // 基于 getMeasurements 的实现，但不加入 LIMIT/OFFSET
  const {
    spec_id,
    spec_name,
    is_compliant,
    is_calibration,
    calibration_type,
    calibration_index,
    startTime,
    endTime,
    sortBy = "timestamp",
    sortOrder = "DESC",
  } = options;

  const validSortBy = [
    "id",
    "timestamp",
    "spec_id",
    "spec_name",
    "is_compliant",
    "is_calibration",
    "calibration_type",
    "calibration_index",
    "outer_max",
    "outer_avg",
    "outer_min",
    "inner_max",
    "inner_avg",
    "inner_min",
    "wall_max",
    "wall_avg",
    "wall_min",
    "outer_non_circularity",
    "inner_non_circularity",
  ];
  const orderBy = validSortBy.includes(sortBy) ? `"${sortBy}"` : "timestamp";
  const orderDirection = sortOrder === "ASC" ? "ASC" : "DESC";

  let query = `SELECT * FROM measurements`;
  const params: any[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  if (spec_id) {
    conditions.push(`spec_id = $${paramIndex++}`);
    params.push(spec_id);
  }
  if (spec_name) {
    conditions.push(`spec_name LIKE $${paramIndex++}`);
    params.push(`%${spec_name}%`);
  }
  if (is_compliant) {
    conditions.push(`is_compliant = $${paramIndex++}`);
    params.push(parseInt(is_compliant, 10));
  }
  if (is_calibration !== undefined) {
    const calib = parseInt(is_calibration as any, 10);
    if (calib === 0 || calib === 1) {
      conditions.push(`is_calibration = $${paramIndex++}`);
      params.push(calib);
    }
  }
  if (calibration_type) {
    const typeUpper = String(calibration_type).toUpperCase();
    if (["A", "B", "C"].includes(typeUpper)) {
      conditions.push(`calibration_type = $${paramIndex++}`);
      params.push(typeUpper);
    }
  }
  if (calibration_index !== undefined) {
    const idx = parseInt(calibration_index as any, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= 11) {
      conditions.push(`calibration_index = $${paramIndex++}`);
      params.push(idx);
    }
  }
  if (startTime) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(endTime);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += ` ORDER BY ${orderBy} ${orderDirection}`;

  try {
    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to export measurements from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function getRecentMeasurements(
  hours: number,
  limit: number,
  specId?: string
): Promise<any[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  let query = `
    SELECT * FROM measurements 
    WHERE timestamp >= $1
  `;
  const params: any[] = [since];

  if (specId) {
    query += ` AND spec_id = $2`;
    params.push(specId);
  }

  query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get recent measurements from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function getMeasurementById(id: number): Promise<any> {
  const sql = "SELECT * FROM measurements WHERE id = $1";
  try {
    const { rows } = await pool.query(sql, [id]);
    return rows[0] || null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get measurement by ID from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function getComplianceStats(...args: any[]): Promise<any> {
  logger.warn("getComplianceStats: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getStatsBySpec(...args: any[]): Promise<any[]> {
  logger.warn("getStatsBySpec: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getTrendData(...args: any[]): Promise<any[]> {
  logger.warn("getTrendData: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function cleanupOldData(...args: any[]): Promise<number> {
  logger.warn("cleanupOldData: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function optimizeDatabase(...args: any[]): Promise<boolean> {
  logger.warn("optimizeDatabase: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function vacuumDatabase(...args: any[]): Promise<boolean> {
  logger.warn("vacuumDatabase: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function closeSQLiteDB(): Promise<void> {
  logger.warn(
    "closeSQLiteDB is not applicable to PostgreSQL connection pool and is a no-op."
  );
  return Promise.resolve();
}

export async function batchSaveQualityRecords(
  records: QualityRecord[]
): Promise<{
  success: number;
  failed: number;
  warnings: string[];
  results: Array<{ record: QualityRecord; imageWarning?: string }>;
}> {
  if (!records || records.length === 0) {
    return { success: 0, failed: 0, warnings: [], results: [] };
  }

  const results: Array<{ record: QualityRecord; imageWarning?: string }> = [];
  const warnings: string[] = [];
  let success = 0;
  let failed = 0;

  // 使用事务处理批量插入
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 处理每条记录
    for (let i = 0; i < records.length; i++) {
      const data = { ...records[i] }; // 创建副本避免修改原数据

      try {
        // 1. Handle timestamp conversion
        if (data.timestamp && !data.capture_time) {
          const isoTime = convertTimestampToISO(data.timestamp);
          data.capture_time = isoTime === null ? undefined : isoTime;
        }

        // 2. Set status based on label
        if (data.label === "pass") {
          data.status = "IGNORED";
        } else if (data.label === "fail") {
          data.status = undefined; // In PostgreSQL this will be NULL
        }

        // 3. Save image and update object_key
        let imageWarning: string | undefined;
        if (data.image) {
          const filename = `${data.client_ip}_${data.timestamp}`;
          try {
            const savedFilename = await saveImageFromBase64(
              data.image,
              filename
            );
            if (savedFilename) {
              data.object_key = savedFilename;
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.warn(
              `批量保存中图片保存失败 (记录${i + 1}): ${errorMessage}`
            );

            if (
              errorMessage.includes("DISK_FULL") ||
              errorMessage.includes("ENOSPC")
            ) {
              imageWarning = "磁盘空间不足，图片未保存";
            } else if (errorMessage.includes("EACCES")) {
              imageWarning = "权限不足，图片未保存";
            } else {
              imageWarning = "图片保存失败";
            }
          }
          delete data.image; // Ensure base64 is not stored in DB
        }

        // 4. Insert record into database
        const columns = Object.keys(data).filter(
          (k) => (data as any)[k] !== undefined
        );
        const values = columns.map((k) => (data as any)[k]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

        const updateColumns = columns
          .filter((col) => col !== "client_ip" && col !== "timestamp")
          .map((col) => `"${col}" = EXCLUDED."${col}"`)
          .join(", ");

        const sql = `
          INSERT INTO quality_records (${columns
            .map((c) => `"${c}"`)
            .join(", ")})
          VALUES (${placeholders})
          ON CONFLICT (client_ip, timestamp)
          DO UPDATE SET ${updateColumns}
          RETURNING *
        `;

        const result = await client.query(sql, values);
        results.push({ record: result.rows[0], imageWarning });
        success++;

        if (imageWarning) {
          warnings.push(
            `记录${i + 1} (${data.client_ip}_${
              data.timestamp
            }): ${imageWarning}`
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`批量保存中记录${i + 1}失败: ${errorMessage}`, {
          client_ip: data.client_ip,
          timestamp: data.timestamp,
        });
        warnings.push(
          `记录${i + 1} (${data.client_ip}_${
            data.timestamp
          }): 保存失败 - ${errorMessage}`
        );
        failed++;
      }
    }

    await client.query("COMMIT");
    logger.info(`批量保存完成: 成功${success}条, 失败${failed}条`);
  } catch (error) {
    await client.query("ROLLBACK");
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`批量保存事务失败: ${errorMessage}`);
    throw error;
  } finally {
    client.release();
  }

  return { success, failed, warnings, results };
}

export async function saveQualityRecord(
  data: QualityRecord
): Promise<{ record: QualityRecord; imageWarning?: string }> {
  // 1. Handle timestamp conversion
  if (data.timestamp && !data.capture_time) {
    const isoTime = convertTimestampToISO(data.timestamp);
    data.capture_time = isoTime === null ? undefined : isoTime;
  }

  // 2. Set status based on label
  if (data.label === "pass") {
    data.status = "IGNORED";
  } else if (data.label === "fail") {
    data.status = undefined; // In PostgreSQL this will be NULL
  }

  // 3. Save image and update object_key
  let imageWarning: string | undefined;
  if (data.image) {
    const filename = `${data.client_ip}_${data.timestamp}`;
    try {
      const savedFilename = await saveImageFromBase64(data.image, filename);
      if (savedFilename) {
        data.object_key = savedFilename;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(`图片保存失败，继续保存记录: ${errorMessage}`);

      // 设置警告信息，但不阻止记录保存
      if (
        errorMessage.includes("DISK_FULL") ||
        errorMessage.includes("ENOSPC")
      ) {
        imageWarning = "磁盘空间不足，图片未保存";
      } else if (errorMessage.includes("EACCES")) {
        imageWarning = "权限不足，图片未保存";
      } else {
        imageWarning = "图片保存失败";
      }
    }
    delete data.image; // Ensure base64 is not stored in DB
  }

  const columns = Object.keys(data).filter(
    (k) => (data as any)[k] !== undefined
  );
  const values = columns.map((k) => (data as any)[k]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  const updateColumns = columns
    .filter((col) => col !== "client_ip" && col !== "timestamp")
    .map((col) => `"${col}" = EXCLUDED."${col}"`)
    .join(", ");

  const sql = `
    INSERT INTO quality_records (${columns.map((c) => `"${c}"`).join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (client_ip, timestamp)
    DO UPDATE SET ${updateColumns}
    RETURNING *
  `;

  try {
    const result = await pool.query(sql, values);
    logger.debug(
      `Record saved or updated in PostgreSQL: ${data.client_ip} - ${data.timestamp}`
    );
    return { record: result.rows[0], imageWarning };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to save or update record in PostgreSQL: ${errorMessage}`,
      { sql, values }
    );
    throw error;
  }
}

export async function getQualityRecords(options: {
  limit?: number;
  offset?: number;
  client_ip?: string;
  pc_num?: string;
  model_type?: string;
  status?: string;
  label?: string;
  review_result?: string;
  startTime?: string;
  endTime?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}): Promise<{
  data: QualityRecord[];
  total: number;
  page: number;
  limit: number;
}> {
  const {
    limit = 20,
    offset = 0,
    client_ip,
    pc_num,
    model_type,
    status,
    label,
    review_result,
    startTime,
    endTime,
    sortBy = "timestamp",
    sortOrder = "DESC",
  } = options;

  const validSortBy = [
    "client_ip",
    "timestamp",
    "capture_time",
    "label",
    "pc_num",
    "confidence",
    "model_type",
    "status",
  ];
  const orderBy = validSortBy.includes(sortBy) ? `"${sortBy}"` : "timestamp";
  const orderDirection = sortOrder === "ASC" ? "ASC" : "DESC";

  let query = `SELECT * FROM quality_records`;
  let countQuery = `SELECT COUNT(*) as total FROM quality_records`;

  const params: any[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  if (client_ip && client_ip.trim() !== "") {
    conditions.push(`client_ip = $${paramIndex++}`);
    params.push(client_ip);
  }
  if (pc_num && pc_num.trim() !== "") {
    conditions.push(`pc_num = $${paramIndex++}`);
    params.push(pc_num);
  }
  if (model_type && model_type.trim() !== "") {
    conditions.push(`model_type = $${paramIndex++}`);
    params.push(model_type);
  }
  if (status !== undefined && status.trim() !== "") {
    if (status.toLowerCase() === "null") {
      conditions.push(`status IS NULL`);
    } else {
      conditions.push(`UPPER(status) = UPPER($${paramIndex++})`);
      params.push(status);
    }
  }
  if (label !== undefined && label.trim() !== "") {
    if (label.toLowerCase() === "null") {
      conditions.push(`label IS NULL`);
    } else {
      conditions.push(`label = $${paramIndex++}`);
      params.push(label);
    }
  }
  if (review_result !== undefined && review_result.trim() !== "") {
    if (review_result.toLowerCase() === "null") {
      conditions.push(`review_result IS NULL`);
    } else {
      conditions.push(`review_result = $${paramIndex++}`);
      params.push(review_result);
    }
  }
  if (startTime) {
    conditions.push(`"timestamp" >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`"timestamp" <= $${paramIndex++}`);
    params.push(endTime);
  }

  if (conditions.length > 0) {
    const whereClause = ` WHERE ` + conditions.join(" AND ");
    query += whereClause;
    countQuery += whereClause;
  }

  try {
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    return {
      data: rows,
      total,
      page: offset / limit + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get quality records from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function getQualityRecordsGroupedBySecond(options: {
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
}): Promise<any> {
  const { startTime, endTime, limit = 60, offset = 0 } = options;

  let query = `
    SELECT
      SUBSTRING(timestamp, 1, 14) as time_group,
      json_agg(row_to_json(t)) as records
    FROM quality_records t
  `;

  const params: any[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  if (startTime) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(endTime);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += `
    GROUP BY time_group
    ORDER BY time_group DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  params.push(limit, offset);

  // Separate count query for total groups
  let countQuery = `SELECT COUNT(DISTINCT SUBSTRING(timestamp, 1, 14)) FROM quality_records`;
  const countParams = [];
  if (conditions.length > 0) {
    countQuery += ` WHERE ` + conditions.join(" AND ");
    if (startTime) countParams.push(startTime);
    if (endTime) countParams.push(endTime);
  }

  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const data = rows.reduce<Record<string, any[]>>(
      (acc: Record<string, any[]>, row: any) => {
        acc[row.time_group as string] = row.records as any[];
        return acc;
      },
      {} as Record<string, any[]>
    );

    const total = countRows.length > 0 ? parseInt(countRows[0].count, 10) : 0;

    return {
      data,
      total,
      page: offset / limit + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get quality records grouped by second: ${errorMessage}`
    );
    throw error;
  }
}

export async function getQualityRecordsGroupedBySecondAndIp(options: {
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
}): Promise<any> {
  const { startTime, endTime, limit = 60, offset = 0 } = options;

  let query = `
    SELECT
      SUBSTRING(timestamp, 1, 14) as time_group,
      client_ip,
      json_agg(row_to_json(t)) as records
    FROM quality_records t
  `;

  const params: any[] = [];
  const conditions: string[] = [];
  if (startTime) {
    conditions.push(`timestamp >= $${params.length + 1}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`timestamp <= $${params.length + 1}`);
    params.push(endTime);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += `
    GROUP BY time_group, client_ip
    ORDER BY time_group DESC, client_ip
  `;

  try {
    const { rows } = await pool.query(query, params);

    const data = rows.reduce<Record<string, Record<string, any[]>>>(
      (acc: Record<string, Record<string, any[]>>, row: any) => {
        const time_group = row.time_group as string;
        const client_ip = row.client_ip as string;
        const records = row.records as any[];
        if (!acc[time_group]) {
          acc[time_group] = {} as Record<string, any[]>;
        }
        acc[time_group][client_ip] = records;
        return acc;
      },
      {} as Record<string, Record<string, any[]>>
    );

    const total = Object.keys(data).length;

    // Manually slice the object for pagination
    const paginatedKeys = Object.keys(data).slice(offset, offset + limit);
    const paginatedData = paginatedKeys.reduce<
      Record<string, Record<string, any[]>>
    >((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {} as Record<string, Record<string, any[]>>);

    return {
      data: paginatedData,
      total,
      page: offset / limit + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get records grouped by second and IP: ${errorMessage}`
    );
    throw error;
  }
}

export async function getQualityRecord(
  client_ip: string,
  timestamp: string
): Promise<QualityRecord | null> {
  const sql = `SELECT * FROM quality_records WHERE client_ip = $1 AND timestamp = $2`;
  try {
    const { rows } = await pool.query(sql, [client_ip, timestamp]);
    return rows[0] || null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get quality record by ID from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function updateQualityRecord(
  client_ip: string,
  timestamp: string,
  data: Partial<Omit<QualityRecord, "client_ip" | "timestamp">>
): Promise<{ updated: number }> {
  const fields = Object.keys(data);
  const values = Object.values(data);

  if (fields.length === 0) {
    return { updated: 0 };
  }

  const setClauses = fields
    .map((field, i) => `"${field}" = $${i + 1}`)
    .join(", ");
  const sql = `
    UPDATE quality_records 
    SET ${setClauses} 
    WHERE client_ip = $${fields.length + 1} AND timestamp = $${
    fields.length + 2
  }
  `;

  try {
    const result = await pool.query(sql, [...values, client_ip, timestamp]);
    if (result.rowCount && result.rowCount > 0) {
      logger.debug(
        `Quality record updated in PostgreSQL, client_ip: ${client_ip}, timestamp: ${timestamp}`
      );
    }
    return { updated: result.rowCount || 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to update quality record in PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function deleteQualityRecord(
  client_ip: string,
  timestamp: string
): Promise<{ deleted: number }> {
  const sql = `DELETE FROM quality_records WHERE client_ip = $1 AND timestamp = $2`;
  try {
    const result = await pool.query(sql, [client_ip, timestamp]);
    if (result.rowCount && result.rowCount > 0) {
      logger.debug(
        `Quality record deleted in PostgreSQL, client_ip: ${client_ip}, timestamp: ${timestamp}`
      );
    }
    return { deleted: result.rowCount || 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to delete quality record in PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function updateStatusFromPassToIgnored(): Promise<{
  updated: number;
}> {
  const sql = `UPDATE quality_records SET status = 'IGNORED' WHERE label = 'pass' AND (status IS NULL OR status != 'IGNORED')`;
  try {
    const result = await pool.query(sql);
    const updated = result.rowCount || 0;
    logger.info(
      `Updated ${updated} 'pass' records to 'IGNORED' status in PostgreSQL.`
    );
    return { updated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to bulk update 'pass' records in PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

export async function updateStatusFromFailToInReview(
  records?: { client_ip: string; timestamp: string }[]
): Promise<{ updated: number }> {
  // 全量更新模式
  if (!records || records.length === 0) {
    const sql = `UPDATE quality_records SET status = 'INREVIEW' WHERE label = 'fail' AND status IS NULL`;
    try {
      const result = await pool.query(sql);
      const updated = result.rowCount || 0;
      logger.info(
        `Updated ${updated} 'fail' records (bulk) to 'INREVIEW' status in PostgreSQL.`
      );
      return { updated };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to bulk update 'fail' records in PostgreSQL: ${errorMessage}`
      );
      throw error;
    }
  }

  // 精确更新模式
  let updatedCount = 0;
  // TODO: Refactor to use a single query or transaction for better performance
  for (const record of records) {
    const sql = `UPDATE quality_records SET status = 'INREVIEW' WHERE client_ip = $1 AND timestamp = $2 AND label = 'fail' AND status IS NULL`;
    try {
      const result = await pool.query(sql, [
        record.client_ip,
        record.timestamp,
      ]);
      if (result.rowCount) {
        updatedCount += result.rowCount;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to update specific record ${record.client_ip}/${record.timestamp} to INREVIEW: ${errorMessage}`
      );
      // Decide if we should continue or rethrow the error
    }
  }

  logger.info(
    `Updated ${updatedCount} specific records to 'INREVIEW' status in PostgreSQL.`
  );
  return { updated: updatedCount };
}

/**
 * 更新审核结果
 */
export async function updateReviewResult(
  client_ip: string,
  timestamp: string,
  reviewData: {
    review_result: string;
    reviewer: string;
    review_notes?: string;
  }
): Promise<{ updated: number }> {
  const sql = `
    UPDATE quality_records 
    SET 
      review_result = $1,
      review_time = NOW(),
      reviewer = $2,
      review_notes = $3
    WHERE client_ip = $4 AND timestamp = $5
  `;

  try {
    const result = await pool.query(sql, [
      reviewData.review_result,
      reviewData.reviewer,
      reviewData.review_notes || null,
      client_ip,
      timestamp,
    ]);

    const updated = result.rowCount || 0;
    logger.info(
      `Updated review result for record ${client_ip}/${timestamp}: ${reviewData.review_result}`
    );
    return { updated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to update review result for ${client_ip}/${timestamp}: ${errorMessage}`
    );
    throw error;
  }
}

/**
 * 批量更新审核结果
 */
export async function batchUpdateReviewResult(
  records: Array<{
    client_ip: string;
    timestamp: string;
    review_result: string;
    reviewer: string;
    review_notes?: string;
  }>
): Promise<{ updated: number; failed: number }> {
  let updatedCount = 0;
  let failedCount = 0;

  for (const record of records) {
    try {
      const result = await updateReviewResult(
        record.client_ip,
        record.timestamp,
        {
          review_result: record.review_result,
          reviewer: record.reviewer,
          review_notes: record.review_notes,
        }
      );
      updatedCount += result.updated;
    } catch (error) {
      failedCount++;
      logger.error(
        `Failed to update review for ${record.client_ip}/${record.timestamp}`
      );
    }
  }

  return { updated: updatedCount, failed: failedCount };
}

/**
 * 获取误报率统计（按天）
 */
export async function getFalsePositiveRateStats(options: {
  startTime?: string;
  endTime?: string;
  groupBy?: "day" | "week" | "month";
}): Promise<{
  data: Array<{
    date: string;
    total_reviewed: number;
    confirmed_fail: number;
    false_positive: number;
    unclear: number;
    false_positive_rate: number;
  }>;
  summary: {
    total_reviewed: number;
    confirmed_fail: number;
    false_positive: number;
    unclear: number;
    false_positive_rate: number;
  };
}> {
  const { startTime, endTime, groupBy = "day" } = options;

  let dateFormat: string;
  let dateTrunc: string;

  switch (groupBy) {
    case "week":
      dateFormat = 'YYYY-"W"WW';
      dateTrunc = "week";
      break;
    case "month":
      dateFormat = "YYYY-MM";
      dateTrunc = "month";
      break;
    default:
      dateFormat = "YYYY-MM-DD";
      dateTrunc = "day";
  }

  const timeFilterSql = `
    WHERE review_result IS NOT NULL
      AND ($1::timestamptz IS NULL OR review_time >= $1)
      AND ($2::timestamptz IS NULL OR review_time <= $2)
  `;

  const statsSql = `
    SELECT 
      to_char(date_trunc('${dateTrunc}', review_time), '${dateFormat}') AS date,
      COUNT(*)::int AS total_reviewed,
      COUNT(*) FILTER (WHERE review_result = 'fail')::int AS confirmed_fail,
      COUNT(*) FILTER (WHERE review_result = 'pass')::int AS false_positive,
      COUNT(*) FILTER (WHERE review_result = 'unclear')::int AS unclear,
      ROUND(
        COUNT(*) FILTER (WHERE review_result = 'pass')::numeric / 
        NULLIF(COUNT(*) FILTER (WHERE review_result IN ('pass', 'fail')), 0) * 100, 
        2
      ) AS false_positive_rate
    FROM quality_records
    ${timeFilterSql}
    GROUP BY date_trunc('${dateTrunc}', review_time)
    ORDER BY date_trunc('${dateTrunc}', review_time) DESC
  `;

  const summarySql = `
    SELECT 
      COUNT(*)::int AS total_reviewed,
      COUNT(*) FILTER (WHERE review_result = 'fail')::int AS confirmed_fail,
      COUNT(*) FILTER (WHERE review_result = 'pass')::int AS false_positive,
      COUNT(*) FILTER (WHERE review_result = 'unclear')::int AS unclear,
      ROUND(
        COUNT(*) FILTER (WHERE review_result = 'pass')::numeric / 
        NULLIF(COUNT(*) FILTER (WHERE review_result IN ('pass', 'fail')), 0) * 100, 
        2
      ) AS false_positive_rate
    FROM quality_records
    ${timeFilterSql}
  `;

  try {
    const [{ rows }, { rows: summaryRows }] = await Promise.all([
      pool.query(statsSql, [startTime || null, endTime || null]),
      pool.query(summarySql, [startTime || null, endTime || null]),
    ]);

    return {
      data: rows,
      summary: summaryRows[0] || {
        total_reviewed: 0,
        confirmed_fail: 0,
        false_positive: 0,
        unclear: 0,
        false_positive_rate: 0,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get false positive rate stats: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取待审核记录
 */
export async function getPendingReviewRecords(options: {
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  client_ip?: string;
  pc_num?: string;
}): Promise<{
  data: QualityRecord[];
  total: number;
  page: number;
  limit: number;
}> {
  const {
    limit = 20,
    offset = 0,
    startTime,
    endTime,
    client_ip,
    pc_num,
  } = options;

  const params: any[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  // 只查询 fail 标签且未审核的记录
  conditions.push(`label = 'fail'`);
  conditions.push(`review_result IS NULL`);

  if (startTime) {
    conditions.push(`capture_time >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`capture_time <= $${paramIndex++}`);
    params.push(endTime);
  }
  if (client_ip) {
    conditions.push(`client_ip = $${paramIndex++}`);
    params.push(client_ip);
  }
  if (pc_num) {
    conditions.push(`pc_num = $${paramIndex++}`);
    params.push(pc_num);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT * FROM quality_records
    ${whereClause}
    ORDER BY capture_time DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  const countQuery = `
    SELECT COUNT(*) as total FROM quality_records
    ${whereClause}
  `;

  params.push(limit, offset);

  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)), // 移除 limit 和 offset
    ]);

    const total = countRows.length > 0 ? parseInt(countRows[0].total) : 0;

    return {
      data: rows,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get pending review records: ${errorMessage}`);
    throw error;
  }
}

/**
 * 根据保留策略，获取需要被清理的图片文件名
 * - 'fail' 标签的图片保留7天
 * - 其他所有标签 (包括 'pass' 和 null) 的图片保留1天
 * @returns 需要被删除的文件名列表
 */
export async function getFilenamesToClean(): Promise<string[]> {
  const failRetentionHours = parseInt(
    process.env.FAIL_RETENTION_HOURS || (24 * 7).toString(),
    10
  );
  const defaultRetentionHours = parseInt(
    process.env.DEFAULT_RETENTION_HOURS || "24",
    10
  );

  const failCutoffDate = new Date(
    Date.now() - failRetentionHours * 60 * 60 * 1000
  ).toISOString();
  const defaultCutoffDate = new Date(
    Date.now() - defaultRetentionHours * 60 * 60 * 1000
  ).toISOString();

  const query = `
    SELECT filename FROM quality_records
    WHERE 
      (
        (label = $1 AND "timestamp" < $2) 
        OR 
        ((label != $1 OR label IS NULL) AND "timestamp" < $3)
      )
      AND filename IS NOT NULL AND filename != ''
  `;

  const params: any[] = ["fail", failCutoffDate, defaultCutoffDate];

  try {
    const { rows } = await pool.query(query, params);
    return rows.map((row: any) => row.filename as string);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`从PostgreSQL获取待清理文件名失败: ${errorMessage}`, {
      query: query,
      params: params,
    });
    throw error;
  }
}

export async function getQualityRecordsGroupedBySecondSummary(options: {
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
}): Promise<any> {
  const { startTime, endTime, limit = 60, offset = 0 } = options;

  const timeFilterSql = `
    WHERE ($1::timestamptz IS NULL OR capture_time >= $1)
      AND ($2::timestamptz IS NULL OR capture_time <= $2)
  `;

  const groupsSql = `
    WITH tg AS (
      SELECT date_trunc('second', capture_time) AS time_group
      FROM quality_records
      ${timeFilterSql}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT $3 OFFSET $4
    )
    SELECT 
      to_char(tg.time_group, 'YYYYMMDDHH24MISS') AS time_group,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.label = 'fail')::int AS fail,
      COUNT(*) FILTER (WHERE t.label = 'pass')::int AS pass
    FROM tg
    JOIN quality_records t
      ON date_trunc('second', t.capture_time) = tg.time_group
    GROUP BY tg.time_group
    ORDER BY tg.time_group DESC
  `;

  const countGroupsSql = `
    SELECT COUNT(DISTINCT date_trunc('second', capture_time))::int AS count
    FROM quality_records
    ${timeFilterSql}
  `;

  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(groupsSql, [
        startTime || null,
        endTime || null,
        limit,
        offset,
      ]),
      pool.query(countGroupsSql, [startTime || null, endTime || null]),
    ]);

    const data = rows.reduce((acc: any, row: any) => {
      acc[row.time_group] = {
        total: row.total,
        fail: row.fail,
        pass: row.pass,
      };
      return acc;
    }, {});

    const total = countRows.length > 0 ? countRows[0].count : 0;

    return {
      data,
      total,
      page: offset / limit + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get summarized quality records grouped by second: ${errorMessage}`
    );
    throw error;
  }
}

export async function getQualityRecordsGroupedBySecondAndIpSummary(options: {
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
}): Promise<any> {
  const { startTime, endTime, limit = 60, offset = 0 } = options;

  const timeFilterSql = `
    WHERE ($1::timestamptz IS NULL OR capture_time >= $1)
      AND ($2::timestamptz IS NULL OR capture_time <= $2)
  `;

  const groupsSql = `
    WITH tg AS (
      SELECT date_trunc('second', capture_time) AS time_group
      FROM quality_records
      ${timeFilterSql}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT $3 OFFSET $4
    )
    SELECT 
      to_char(tg.time_group, 'YYYYMMDDHH24MISS') AS time_group,
      t.client_ip,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.label = 'fail')::int AS fail,
      COUNT(*) FILTER (WHERE t.label = 'pass')::int AS pass
    FROM tg
    JOIN quality_records t
      ON date_trunc('second', t.capture_time) = tg.time_group
    GROUP BY tg.time_group, t.client_ip
    ORDER BY tg.time_group DESC, t.client_ip
  `;

  const countGroupsSql = `
    SELECT COUNT(DISTINCT date_trunc('second', capture_time))::int AS count
    FROM quality_records
    ${timeFilterSql}
  `;

  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(groupsSql, [
        startTime || null,
        endTime || null,
        limit,
        offset,
      ]),
      pool.query(countGroupsSql, [startTime || null, endTime || null]),
    ]);

    const nested = rows.reduce((acc: any, row: any) => {
      if (!acc[row.time_group]) acc[row.time_group] = {};
      acc[row.time_group][row.client_ip] = {
        total: row.total,
        fail: row.fail,
        pass: row.pass,
      };
      return acc;
    }, {});

    const total = countRows.length > 0 ? countRows[0].count : 0;

    return {
      data: nested,
      total,
      page: offset / limit + 1,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get summarized records grouped by second and IP: ${errorMessage}`
    );
    throw error;
  }
}

export function getDbInstance(...args: any[]): any {
  logger.warn("getDbInstance: " + NOT_IMPLEMENTED_ERROR);
  return null;
}
