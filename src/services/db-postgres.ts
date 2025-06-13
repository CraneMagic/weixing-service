import pool from "./pg-pool";
import { logger } from "../utils/logger";

// Re-exporting the interface for type consistency
export type { QualityRecord } from "../services/db-sqlite";

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

export async function saveQualityRecord(...args: any[]): Promise<any> {
  logger.warn("saveQualityRecord: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
}

export async function getQualityRecords(...args: any[]): Promise<any> {
  logger.warn("getQualityRecords: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
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

export async function updateQualityRecord(...args: any[]): Promise<any> {
  logger.warn("updateQualityRecord: " + NOT_IMPLEMENTED_ERROR);
  return Promise.reject(new Error(NOT_IMPLEMENTED_ERROR));
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
