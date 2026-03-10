import pool from "./pg-pool";
import { logger } from "../utils/logger";
import type { QualityRecord } from "../types/quality-record";
import { convertTimestampToISO } from "../utils/time";
import { saveImageFromBase64 } from "../utils/imageStore";

// Using `import type` and re-exporting for consumers of this module
export type { QualityRecord };

const NOT_IMPLEMENTED_ERROR =
  "This function is not yet implemented for PostgreSQL.";

function safeJsonb(data: any): any {
  if (data === null || data === undefined) {
    return null;
  }
  if (typeof data === 'string') {
    // 空字符串返回 null
    if (data.trim() === '') {
      return null;
    }
    try {
      // 尝试解析字符串为 JSON
      const parsed = JSON.parse(data);
      return parsed;
    } catch {
      // 如果解析失败，返回 null
      return null;
    }
  }
  // 对象或数组直接返回
  if (typeof data === 'object') {
    return data;
  }
  // 其他类型返回 null
  return null;
}

export async function saveMeasurement(data: any, specInfo?: any): Promise<any> {
  const {
    timestamp,
    specId,
    correctedData,
    caculatedData,
    resultData,
    isCompliant,
    isCalibration,
    calibrationType,
    calibrationIndex,
    rgbData,
    temperatureData,
  } = data;

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
      corrected_data, calculated_data,
      rgb_data, temperature_data
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
    ) RETURNING *;
  `;

  const values = [
    timestamp,
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
    caculatedData,
    safeJsonb(rgbData),
    safeJsonb(temperatureData),
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

  const csvColumns = [
    "id", "timestamp", "spec_id", "spec_name",
    "outer_max", "outer_avg", "outer_min",
    "inner_max", "inner_avg", "inner_min",
    "wall_max", "wall_avg", "wall_min",
    "outer_non_circularity", "inner_non_circularity",
    "is_compliant", "is_calibration",
    "calibration_type", "calibration_index",
  ];

  let query = `SELECT ${csvColumns.map((c) => `"${c}"`).join(", ")} FROM measurements`;
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
  useCursorPagination?: boolean; // 新增：是否使用游标分页
  cursor?: string; // 新增：游标值（timestamp）
}): Promise<{
  data: QualityRecord[];
  total: number;
  page: number;
  limit: number;
  nextCursor?: string; // 新增：下一页游标
  hasMore?: boolean; // 新增：是否有更多数据
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
    useCursorPagination = false,
    cursor,
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

  // 优化：不查询image字段（通常很大），提高查询性能
  const selectFields = `
    client_ip, timestamp, capture_time, model_type, label, confidence, 
    frame_id, fis, fps, filename, resolution, size_bytes, size_formatted, 
    jpeg_quality, inference_time_ms, capture_time_ms, jpeg_encode_time_ms, 
    message_id, object_key, status, pc_num, error_path, oss_path, 
    review_result, review_time, reviewer, review_notes, model_version, has_code, code_confidence
  `
    .replace(/\s+/g, " ")
    .trim();

  let query = `SELECT ${selectFields} FROM quality_records`;
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
      // 优化：直接比较，避免UPPER()函数，让索引生效
      conditions.push(`status = $${paramIndex++}`);
      params.push(status.toUpperCase());
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
    conditions.push(`capture_time >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`capture_time <= $${paramIndex++}`);
    params.push(endTime);
  }

  // 游标分页：基于排序字段添加游标条件
  if (useCursorPagination && cursor) {
    const cursorField = orderBy;
    if (sortOrder === "DESC") {
      conditions.push(`${cursorField} < $${paramIndex++}`);
    } else {
      conditions.push(`${cursorField} > $${paramIndex++}`);
    }
    params.push(cursor);
  }

  if (conditions.length > 0) {
    const whereClause = ` WHERE ` + conditions.join(" AND ");
    query += whereClause;
    // 只有在非游标分页时才执行count查询（count查询在大数据量时很慢）
    if (!useCursorPagination) {
      countQuery += whereClause;
    }
  }

  try {
    let total = 0;
    let countResult;

    // 只有在非游标分页时才执行count查询
    if (!useCursorPagination) {
      countResult = await pool.query(countQuery, params);
      total = parseInt(countResult.rows[0].total, 10);
    }

    // 构建查询：游标分页使用LIMIT，传统分页使用LIMIT+OFFSET
    if (useCursorPagination) {
      query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT $${paramIndex++}`;
      params.push(limit + 1); // 多查询一条，用于判断是否有更多数据
    } else {
      query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }

    const { rows } = await pool.query(query, params);

    // 处理游标分页的结果
    let hasMore = false;
    let nextCursor: string | undefined;
    let resultRows = rows;

    if (useCursorPagination) {
      hasMore = rows.length > limit;
      if (hasMore) {
        resultRows = rows.slice(0, limit); // 移除多余的一行
      }
      if (resultRows.length > 0) {
        const lastRow = resultRows[resultRows.length - 1];
        nextCursor = lastRow[sortBy === "timestamp" ? "timestamp" : sortBy];
      }
    }

    return {
      data: resultRows,
      total,
      page: useCursorPagination ? 1 : offset / limit + 1,
      limit,
      nextCursor,
      hasMore,
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
    conditions.push(`capture_time >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`capture_time <= $${paramIndex++}`);
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
    conditions.push(`capture_time >= $${params.length + 1}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`capture_time <= $${params.length + 1}`);
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
      `Error deleting quality record from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

/**
 * 根据本地文件名查询质量检测记录
 * @param filename 本地文件名
 * @returns 质量检测记录或 null
 */
export async function getQualityRecordByFilename(
  filename: string
): Promise<QualityRecord | null> {
  const sql = `SELECT * FROM quality_records WHERE filename = $1 LIMIT 1`;
  try {
    const result = await pool.query(sql, [filename]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0] as QualityRecord;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Error getting quality record by filename from PostgreSQL: ${errorMessage}`
    );
    throw error;
  }
}

/**
 * 更新质量检测记录的 CV 结果
 * @param filename 本地文件名
 * @param cvResult CV 计算结果（JSON 对象）
 * @returns 更新的记录数
 */
export async function updateCVResult(
  filename: string,
  cvResult: Record<string, any>
): Promise<{ updated: number }> {
  const sql = `
    UPDATE quality_records
    SET cv_result = $1
    WHERE filename = $2
  `;
  try {
    const result = await pool.query(sql, [JSON.stringify(cvResult), filename]);
    if (result.rowCount && result.rowCount > 0) {
      logger.debug(
        `CV result updated for filename: ${filename}`
      );
    }
    return { updated: result.rowCount || 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Error updating CV result in PostgreSQL: ${errorMessage}`
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
    review_result?: string;
    reviewer: string;
    review_notes?: string;
    status?: string;
  }
): Promise<{ updated: number; record?: QualityRecord }> {
  let sql: string;
  let params: any[];

  // 定义返回的字段（排除image字段以提高性能）
  const returnFields = `
    client_ip, timestamp, capture_time, model_type, label, confidence, 
    frame_id, fis, fps, filename, resolution, size_bytes, size_formatted, 
    jpeg_quality, inference_time_ms, capture_time_ms, jpeg_encode_time_ms, 
    message_id, object_key, status, pc_num, error_path, oss_path, 
    review_result, review_time, reviewer, review_notes, model_version, has_code, code_confidence
  `
    .replace(/\s+/g, " ")
    .trim();

  if (reviewData.status === "IGNORED") {
    // 如果状态为IGNORED，只更新状态和相关字段
    sql = `
      UPDATE quality_records 
      SET 
        status = $1,
        review_time = NOW(),
        reviewer = $2,
        review_notes = $3
      WHERE client_ip = $4 AND timestamp = $5
      RETURNING ${returnFields}
    `;
    params = [
      reviewData.status,
      reviewData.reviewer,
      reviewData.review_notes || null,
      client_ip,
      timestamp,
    ];
  } else {
    // 其他情况，更新审核结果和状态
    sql = `
      UPDATE quality_records 
      SET 
        review_result = $1,
        review_time = NOW(),
        reviewer = $2,
        review_notes = $3,
        status = $4
      WHERE client_ip = $5 AND timestamp = $6
      RETURNING ${returnFields}
    `;
    params = [
      reviewData.review_result,
      reviewData.reviewer,
      reviewData.review_notes || null,
      reviewData.status || "RESOLVED", // 如果没有指定status，默认为RESOLVED
      client_ip,
      timestamp,
    ];
  }

  try {
    const result = await pool.query(sql, params);

    const updated = result.rowCount || 0;
    const action =
      reviewData.status === "IGNORED"
        ? `status to ${reviewData.status}`
        : `review result to ${reviewData.review_result}`;
    logger.info(`Updated record ${client_ip}/${timestamp}: ${action}`);

    // 返回更新后的记录
    const record = updated > 0 ? result.rows[0] : undefined;
    return { updated, record };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to update record ${client_ip}/${timestamp}: ${errorMessage}`
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

/**
 * 获取质量记录统计信息
 */
export async function getQualityRecordsStatistics(options: {
  startTime: string;
  endTime: string;
  client_ip?: string;
  pc_num?: string;
  model_type?: string;
}): Promise<{
  totalImages: number;
  passCount: number;
  failCount: number;
  invalidCount: number;
  statusCounts: {
    INREVIEW: number;
    RESOLVED: number;
    IGNORED: number;
    MARKED: number;
  };
  reviewResultCounts: {
    pass: number;
    fail: number;
    unclear: number;
  };
  qualityMetrics: {
    falsePositiveRate: number;
    falseNegativeRate: number;
    accuracy: number;
  };
  timeRange: {
    startTime: string;
    endTime: string;
    duration: string;
  };
}> {
  const { startTime, endTime, client_ip, pc_num, model_type } = options;

  // 构建基础查询条件
  const whereConditions = ["capture_time >= $1", "capture_time <= $2"];
  const queryParams = [startTime, endTime];
  let paramIndex = 3;

  if (client_ip) {
    whereConditions.push(`client_ip = $${paramIndex}`);
    queryParams.push(client_ip);
    paramIndex++;
  }

  if (pc_num) {
    whereConditions.push(`pc_num = $${paramIndex}`);
    queryParams.push(pc_num);
    paramIndex++;
  }

  if (model_type) {
    whereConditions.push(`model_type = $${paramIndex}`);
    queryParams.push(model_type);
    paramIndex++;
  }

  const whereClause = whereConditions.join(" AND ");

  // 超优化版本：直接在单个查询中完成所有统计，避免 CTE 和复杂计算
  const optimizedStatsSql = `
    SELECT 
      -- 基础统计（使用最直接的 COUNT FILTER）
      COUNT(*)::int AS total_images,
      COUNT(*) FILTER (WHERE label = 'pass')::int AS pass_count,
      COUNT(*) FILTER (WHERE label = 'fail')::int AS fail_count,
      COUNT(*) FILTER (WHERE label = 'invalid')::int AS invalid_count,
      
      -- 审核状态统计
      COUNT(*) FILTER (WHERE status = 'INREVIEW')::int AS inreview_count,
      COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved_count,
      COUNT(*) FILTER (WHERE status = 'IGNORED')::int AS ignored_count,
      COUNT(*) FILTER (WHERE status = 'MARKED')::int AS marked_count,
      
      -- 审核结果统计（仅针对已解决的记录）
      COUNT(*) FILTER (WHERE status = 'RESOLVED' AND review_result = 'pass')::int AS review_pass_count,
      COUNT(*) FILTER (WHERE status = 'RESOLVED' AND review_result = 'fail')::int AS review_fail_count,
      COUNT(*) FILTER (WHERE status = 'RESOLVED' AND review_result = 'unclear')::int AS review_unclear_count,
      
      -- 质量指标计算所需的数据（使用更简单的条件）
      COUNT(*) FILTER (WHERE label = 'fail' AND review_result = 'pass')::int AS false_positive_count,
      COUNT(*) FILTER (WHERE label = 'pass' AND review_result = 'fail')::int AS false_negative_count,
      COUNT(*) FILTER (WHERE status = 'RESOLVED' AND label = review_result)::int AS accurate_count
    FROM quality_records
    WHERE ${whereClause}
  `;

  try {
    // 执行单个优化查询
    const { rows } = await pool.query(optimizedStatsSql, queryParams);
    const stats = rows[0];

    // 计算时间范围描述
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    let duration = "";
    if (durationDays > 0) {
      duration = `${durationDays}天`;
    } else if (durationHours > 0) {
      duration = `${durationHours}小时`;
    } else if (durationMinutes > 0) {
      duration = `${durationMinutes}分钟`;
    } else {
      duration = "小于1分钟";
    }

    // 在应用层计算质量指标（避免复杂的 SQL 计算）
    const falsePositiveRate =
      stats.fail_count > 0
        ? Math.round(
            (stats.false_positive_count / stats.fail_count) * 100 * 100
          ) / 100
        : 0;

    const falseNegativeRate =
      stats.pass_count > 0
        ? Math.round(
            (stats.false_negative_count / stats.pass_count) * 100 * 100
          ) / 100
        : 0;

    const accuracy =
      stats.resolved_count > 0
        ? Math.round(
            (stats.accurate_count / stats.resolved_count) * 100 * 100
          ) / 100
        : 0;

    return {
      totalImages: stats.total_images,
      passCount: stats.pass_count,
      failCount: stats.fail_count,
      invalidCount: stats.invalid_count,
      statusCounts: {
        INREVIEW: stats.inreview_count,
        RESOLVED: stats.resolved_count,
        IGNORED: stats.ignored_count,
        MARKED: stats.marked_count,
      },
      reviewResultCounts: {
        pass: stats.review_pass_count,
        fail: stats.review_fail_count,
        unclear: stats.review_unclear_count,
      },
      qualityMetrics: {
        falsePositiveRate,
        falseNegativeRate,
        accuracy,
      },
      timeRange: {
        startTime,
        endTime,
        duration,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取质量记录统计信息失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 获取喷码统计信息
 * @param options 查询选项
 * @returns 喷码统计数据
 */
export async function getSprayCodeStatistics(options: {
  pc_num: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
}): Promise<{
  pc_num: string;
  earliestTime: string | null;
  latestTime: string | null;
  hasCode: boolean;
  totalCount: number;
  codeStatistics: {
    withCode: number;
    withoutCode: number;
    unknown: number;
  };
}> {
  const { pc_num, limit, startTime, endTime } = options;

  // 参数验证
  if (!pc_num || pc_num.trim() === "") {
    throw new Error("pc_num 参数是必需的");
  }

  // 至少需要提供 limit 或时间段
  if (!limit && (!startTime || !endTime)) {
    throw new Error("必须提供 limit 或 startTime/endTime 参数");
  }

  // 构建查询条件
  const conditions: string[] = [`pc_num = $1`];
  const params: any[] = [pc_num];
  let paramIndex = 2;

  // 时间过滤
  if (startTime && endTime) {
    conditions.push(`capture_time >= $${paramIndex++}`);
    conditions.push(`capture_time <= $${paramIndex++}`);
    params.push(startTime, endTime);
  }

  const whereClause = conditions.join(" AND ");

  // 构建查询：如果需要限制记录数，使用CTE先筛选记录
  let statsQuery = "";
  let queryParams: any[] = [];
  
  if (limit) {
    // 使用CTE先获取最近的limit条记录，然后统计
    statsQuery = `
      WITH filtered_records AS (
        SELECT client_ip, timestamp, capture_time, has_code
        FROM quality_records
        WHERE ${whereClause}
        ORDER BY capture_time DESC
        LIMIT $${paramIndex}
      )
      SELECT 
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE has_code = true)::int AS with_code,
        COUNT(*) FILTER (WHERE has_code = false)::int AS without_code,
        COUNT(*) FILTER (WHERE has_code IS NULL)::int AS unknown,
        MIN(capture_time) AS earliest_time,
        MAX(capture_time) AS latest_time,
        BOOL_OR(has_code = true) AS has_code
      FROM filtered_records
    `;
    queryParams = [...params, limit];
  } else {
    // 直接统计，不需要限制记录数
    statsQuery = `
      SELECT 
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE has_code = true)::int AS with_code,
        COUNT(*) FILTER (WHERE has_code = false)::int AS without_code,
        COUNT(*) FILTER (WHERE has_code IS NULL)::int AS unknown,
        MIN(capture_time) AS earliest_time,
        MAX(capture_time) AS latest_time,
        BOOL_OR(has_code = true) AS has_code
      FROM quality_records
      WHERE ${whereClause}
    `;
    queryParams = params;
  }

  try {
    const { rows } = await pool.query(statsQuery, queryParams);

    if (rows.length === 0 || !rows[0].total_count) {
      // 没有记录，返回默认值
      return {
        pc_num,
        earliestTime: null,
        latestTime: null,
        hasCode: false,
        totalCount: 0,
        codeStatistics: {
          withCode: 0,
          withoutCode: 0,
          unknown: 0,
        },
      };
    }

    const row = rows[0];
    return {
      pc_num,
      earliestTime: row.earliest_time ? row.earliest_time.toISOString() : null,
      latestTime: row.latest_time ? row.latest_time.toISOString() : null,
      hasCode: row.has_code === true,
      totalCount: parseInt(row.total_count, 10),
      codeStatistics: {
        withCode: parseInt(row.with_code, 10),
        withoutCode: parseInt(row.without_code, 10),
        unknown: parseInt(row.unknown, 10),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取喷码统计信息失败: ${errorMessage}`);
    throw error;
  }
}

export function getDbInstance(...args: any[]): any {
  logger.warn("getDbInstance: " + NOT_IMPLEMENTED_ERROR);
  return null;
}

/**
 * 获取不合格测量记录
 */
export async function getNonCompliantMeasurements(options: {
  startTime?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}): Promise<{
  data: any[];
  total: number;
  page: number;
  limit: number;
}> {
  const {
    startTime,
    limit = 20,
    offset = 0,
    sortBy = "timestamp",
    sortOrder = "DESC",
  } = options;

  const validSortBy = [
    "id",
    "timestamp",
    "spec_id",
    "spec_name",
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

  // 固定条件：不合格且非校准
  conditions.push(`is_compliant = 0`);
  conditions.push(`is_calibration = 0`);

  // 时间条件
  if (startTime) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(startTime);
  }

  if (conditions.length > 0) {
    const whereClause = ` WHERE ${conditions.join(" AND ")}`;
    query += whereClause;
    countQuery += whereClause;
  }

  query += ` ORDER BY ${orderBy} ${orderDirection}`;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  try {
    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)), // 排除limit和offset参数
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const page = Math.floor(offset / limit) + 1;

    return {
      data: dataResult.rows,
      total,
      page,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取不合格测量记录失败: ${errorMessage}`);
    throw error;
  }
}

/**
 * 按规格统计不合格测量记录数量
 */
export async function getNonCompliantStatsBySpec(startTime?: string): Promise<
  {
    specId: string;
    specName: string;
    nonCompliantCount: number;
  }[]
> {
  try {
    // 获取所有规格配置
    const { getParameter } = await import("./db");
    const pipeSpecifications = await getParameter("pipeSpecification");

    if (!pipeSpecifications?.value) {
      logger.warn("未找到规格配置");
      return [];
    }

    const allSpecs = Object.keys(pipeSpecifications.value);

    // 查询数据库中的统计数据
    let statsQuery = `
      SELECT spec_id, spec_name, COUNT(*) as count
      FROM measurements
      WHERE is_compliant = 0 AND is_calibration = 0
    `;
    const params: any[] = [];

    if (startTime) {
      statsQuery += ` AND timestamp >= $1`;
      params.push(startTime);
    }

    statsQuery += ` GROUP BY spec_id, spec_name`;

    const statsResult = await pool.query(statsQuery, params);
    const statsMap = new Map<string, number>();

    statsResult.rows.forEach((row) => {
      const key = row.spec_id || "unknown";
      statsMap.set(key, parseInt(row.count, 10));
    });

    // 构建结果，包含所有规格
    const result = allSpecs.map((specId) => {
      const spec = pipeSpecifications.value[specId];
      return {
        specId,
        specName: spec.materialSpec || specId,
        nonCompliantCount: statsMap.get(specId) || 0,
      };
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`获取不合格统计失败: ${errorMessage}`);
    throw error;
  }
}
