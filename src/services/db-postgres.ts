import pool from "./pg-pool";
import { logger } from "../utils/logger";
import type { QualityRecord } from "../types/quality-record";
import { convertTimestampToISO } from "../utils/time";
import { saveImageFromBase64 } from "../utils/imageStore";

// Using `import type` and re-exporting for consumers of this module
export type { QualityRecord };

const NOT_IMPLEMENTED_ERROR =
  "This function is not yet implemented for PostgreSQL.";

export async function saveMeasurement(...args: any[]): Promise<any> {
  logger.warn("saveMeasurement: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getMeasurements(...args: any[]): Promise<any> {
  logger.warn("getMeasurements: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getRecentMeasurements(...args: any[]): Promise<any[]> {
  logger.warn("getRecentMeasurements: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getMeasurementById(...args: any[]): Promise<any> {
  logger.warn("getMeasurementById: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
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

export async function saveQualityRecord(
  data: QualityRecord
): Promise<QualityRecord> {
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
  if (data.image) {
    const filename = `${data.client_ip}_${data.timestamp}`;
    const savedFilename = saveImageFromBase64(data.image, filename);
    if (savedFilename) {
      data.object_key = savedFilename;
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
    return result.rows[0];
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
  pcNum?: string;
  model_type?: string;
  status?: string;
  label?: string;
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
    pcNum,
    model_type,
    status,
    label,
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
    "pcNum",
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

  if (client_ip) {
    conditions.push(`client_ip = $${paramIndex++}`);
    params.push(client_ip);
  }
  if (pcNum) {
    conditions.push(`"pcNum" = $${paramIndex++}`);
    params.push(pcNum);
  }
  if (model_type) {
    conditions.push(`model_type = $${paramIndex++}`);
    params.push(model_type);
  }
  if (status !== undefined) {
    if (status.toLowerCase() === "null") {
      conditions.push(`status IS NULL`);
    } else {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
  }
  if (label) {
    conditions.push(`label LIKE $${paramIndex++}`);
    params.push(`%${label}%`);
  }
  if (startTime) {
    conditions.push(`capture_time >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`capture_time <= $${paramIndex++}`);
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

export async function getQualityRecordsGroupedBySecond(
  ...args: any[]
): Promise<any> {
  logger.warn("getQualityRecordsGroupedBySecond: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getQualityRecordsGroupedBySecondAndIp(
  ...args: any[]
): Promise<any> {
  logger.warn(
    "getQualityRecordsGroupedBySecondAndIp: " + NOT_IMPLEMENTED_ERROR
  );
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getQualityRecord(...args: any[]): Promise<any> {
  logger.warn("getQualityRecord: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
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

export async function deleteQualityRecord(...args: any[]): Promise<any> {
  logger.warn("deleteQualityRecord: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function updateStatusFromPassToIgnored(
  ...args: any[]
): Promise<any> {
  logger.warn("updateStatusFromPassToIgnored: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function updateStatusFromFailToInReview(
  ...args: any[]
): Promise<any> {
  logger.warn("updateStatusFromFailToInReview: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export function getDbInstance(...args: any[]): any {
  logger.warn(
    "getDbInstance is not applicable for PostgreSQL, returning pool."
  );
  return pool;
}
