import { applyAlarmState, applyNormalState, applyOffState } from "./light-hardware";
import { triggerRelay4Pulse, getSerialEventEmitter, SerialPortType } from "./serial";
import { logger } from "../utils/logger";

export type AlarmReason = "defect" | "noCode";
export const ALARM_REASONS: AlarmReason[] = ["defect", "noCode"];
export const isAlarmReason = (v: unknown): v is AlarmReason =>
  typeof v === "string" && (ALARM_REASONS as string[]).includes(v);
const activeReasons = new Set<AlarmReason>();
const reasonVersions = new Map<AlarmReason, number>();
const reasonRaisedAt = new Map<AlarmReason, number>();
interface LightControl {
  applyAlarm: (current?: () => boolean) => Promise<void>;
  applyNormal: (current?: () => boolean) => Promise<void>;
  applyOff?: (current?: () => boolean) => Promise<void>;
  signalPiece?: () => void | Promise<void>;
}
const productionControl: LightControl = {
  applyAlarm: applyAlarmState, applyNormal: applyNormalState, applyOff: applyOffState,
  signalPiece: async () => { await triggerRelay4Pulse(1000); },
};
let lightControl = productionControl;
// This caches completed command delivery, never physical lamp feedback.
let delivered: boolean | "off" | null = null;
let manualOff = false;
let revision = 0;
let connectionVersion = 0;
let syncError: string | null = null;
let running: Promise<void> | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
const target = () => activeReasons.size > 0;
const hardwareTarget = () => manualOff ? "off" as const : target();

function synchronize(): Promise<void> {
  if (running) {
    return running.then(() => {
      if (delivered !== hardwareTarget()) return synchronize();
    }, error => {
      // A failed older target must not reject a request for its replacement.
      if (syncError === null) return synchronize();
      throw error;
    });
  }
  // Defer execution until running is installed, including immediately resolving mocks.
  const work = Promise.resolve().then(async () => {
    while (delivered !== hardwareTarget()) {
      const desired = hardwareTarget(), generation = revision, connection = connectionVersion;
      const current = () => generation === revision && desired === hardwareTarget();
      delivered = null;
      try {
        if (desired === "off") {
          if (!lightControl.applyOff) throw new Error("未配置关闭指示灯动作");
          await lightControl.applyOff(current);
        } else if (desired) await lightControl.applyAlarm(current);
        else await lightControl.applyNormal(current);
      } catch (error) {
        if (!current()) continue; // Only the latest target can fail or be retried.
        syncError = error instanceof Error ? error.message : String(error);
        throw error;
      }
      if (!current()) continue;
      if (connection !== connectionVersion) continue;
      delivered = desired;
      syncError = null;
    }
  });
  running = work.finally(() => { running = null; });
  return running;
}
function changeReasons(change: () => void): void {
  const before = hardwareTarget(); manualOff = false; change();
  if (before !== hardwareTarget()) { revision++; syncError = null; }
}
export const raiseAlarm = async (reason: AlarmReason, detail?: string): Promise<void> => {
  changeReasons(() => {
    activeReasons.add(reason);
    reasonVersions.set(reason, (reasonVersions.get(reason) ?? 0) + 1);
    reasonRaisedAt.set(reason, Date.now());
  });
  // Per-piece signal is independent of static lamp delivery and its retries.
  try { Promise.resolve(lightControl.signalPiece?.()).catch(error => logger.error(`触发继电器4脉冲失败: ${error}`)); }
  catch (error) { logger.error(`触发继电器4脉冲失败: ${error}`); }
  await synchronize();
  if (detail) logger.info(`报警原因 ${reason}: ${detail}`);
};
export const clearAlarm = async (reason: AlarmReason): Promise<boolean> => {
  changeReasons(() => activeReasons.delete(reason));
  await synchronize();
  return !target();
};
export const getAlarmVersion = (reason: AlarmReason): number => reasonVersions.get(reason) ?? 0;
export const expireAlarmIfUnchanged = async (reason: AlarmReason, version: number, cutoff: number): Promise<void> => {
  // Check and remove synchronously: a newer raise cannot slip between these operations.
  if (!activeReasons.has(reason) || getAlarmVersion(reason) !== version || (reasonRaisedAt.get(reason) ?? Infinity) > cutoff) return;
  changeReasons(() => activeReasons.delete(reason));
  await synchronize();
};
export const clearAllAlarms = async (): Promise<void> => {
  changeReasons(() => activeReasons.clear());
  await synchronize();
};
export const turnOffAlarmLights = (): Promise<void> => {
  if (!manualOff) { manualOff = true; revision++; syncError = null; }
  return synchronize();
};
export const initializeAlarmLight = (): Promise<void> => synchronize();
// Compatibility name; recovery now handles failed red delivery as well as green.
export const retryPendingNormal = (): Promise<void> => synchronize();
export function startAlarmRecoveryMonitor(): void {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(() => {
    if (running || delivered === hardwareTarget()) return;
    synchronize().catch(error => logger.error(`报警灯目标同步失败，将继续重试: ${error}`));
  }, 2000);
}
// A reconnect can reset hardware outputs even when the logical target is unchanged.
function invalidateConnection(type: SerialPortType): void {
  if (type !== SerialPortType.ALARM && type !== SerialPortType.RELAY) return;
  connectionVersion++;
  delivered = null;
}
const serialEvents = getSerialEventEmitter();
serialEvents.on('open', invalidateConnection);
serialEvents.on('close', invalidateConnection);
serialEvents.on('error', (_error: Error, type: SerialPortType) => invalidateConnection(type));

export function stopAlarmRecoveryMonitor(): void {
  if (recoveryTimer) clearInterval(recoveryTimer);
  recoveryTimer = null;
}
export const isReasonActive = (reason: AlarmReason): boolean => activeReasons.has(reason);
export const getAlarmState = () => ({
  alarming: target(), reasons: [...activeReasons],
  normalSyncPending: !manualOff && !target() && delivered !== false,
  normalSyncError: !manualOff && !target() ? syncError : null,
  syncPending: delivered !== hardwareTarget(), syncError,
});
export const __resetAlarmStateForTest = (): void => {
  activeReasons.clear(); reasonVersions.clear(); reasonRaisedAt.clear();
  manualOff = false; delivered = null; revision = 0; syncError = null;
};
export const __setLightControlForTest = (control: LightControl | null): void => {
  lightControl = control ?? productionControl;
  delivered = null;
};
