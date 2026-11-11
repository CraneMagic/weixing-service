import pool from './pg-pool';
import type { Pool, PoolClient } from 'pg';
import { getAlarmVersion, expireAlarmIfUnchanged } from './alarm-state';
import { logger } from '../utils/logger';

export const ALARM_EXPIRY_MS = 2 * 60 * 60 * 1000;

/** New records use server receipt time. Backfill only legacy unhandled defects. */
export async function ensureAlarmExpirySchema(client: Pick<PoolClient, 'query'>): Promise<void> {
  await client.query('ALTER TABLE quality_records ADD COLUMN IF NOT EXISTS alarm_received_at TIMESTAMPTZ');
  await client.query(`UPDATE quality_records SET alarm_received_at = CASE
    WHEN capture_time >= '2000-01-01'::timestamptz AND capture_time <= NOW() THEN capture_time ELSE NOW() END
    WHERE label = 'fail' AND status IS NULL AND alarm_received_at IS NULL`);
  await client.query('ALTER TABLE quality_records ALTER COLUMN alarm_received_at SET DEFAULT CURRENT_TIMESTAMP');
  await client.query(`CREATE INDEX IF NOT EXISTS idx_quality_pending_alarm_age
    ON quality_records (alarm_received_at) WHERE label = 'fail' AND status IS NULL`);
}

export async function expirePendingDefectRecords(now = Date.now(), db: Pick<Pool, 'connect'> = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await client.query(`UPDATE quality_records SET status = 'EXPIRED'
      WHERE label = 'fail' AND status IS NULL AND alarm_received_at <= $1`, [new Date(now-ALARM_EXPIRY_MS)]);
    const pending = await client.query(`SELECT EXISTS (
      SELECT 1 FROM quality_records WHERE label = 'fail' AND status IS NULL
    ) AS pending`);
    await client.query('COMMIT');
    return {expired: result.rowCount ?? 0, hasPending: Boolean(pending.rows[0].pending)};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function runAlarmExpiry(now = Date.now(), expire = expirePendingDefectRecords): Promise<void> {
  const version = getAlarmVersion('defect');
  const result = await expire(now);
  if (result.expired) logger.info(`表面缺陷报警过期待审核: ${result.expired} 条`);
  if (!result.hasPending) await expireAlarmIfUnchanged('defect', version, now-ALARM_EXPIRY_MS);
}
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
export function startAlarmExpiryMonitor(): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runAlarmExpiry(); }
    catch (error) { logger.error(`报警过期任务失败: ${error}`); }
    finally { running = false; }
  };
  timer = setInterval(() => { void tick(); }, 30_000);
  void tick();
}
export function stopAlarmExpiryMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
