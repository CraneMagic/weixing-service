import { randomUUID } from "crypto";
import { isQualityBypassActive } from "../utils/qualityBypass";
import { getParameter, saveParameter } from "./db";
import { raiseAlarm, clearAlarm, clearAllAlarms, isReasonActive, retryPendingNormal } from "./alarm-state";
import { logger } from "../utils/logger";

export interface NoCodeConfig { enabled: boolean; frameThreshold: number }
export interface CameraReport {
  clientIp: string;
  hasCode: boolean;
  consecutiveNoCodeFrames: number;
  frameAgeMs: number;
  resetToken: string | null;
  sessionId: string;
  sequence: number;
}
interface CameraState extends CameraReport { frameAt: number }
const PARAM_KEY = "noCodeAlarm";
export const NO_CODE_STALE_MS = Number(process.env.NO_CODE_STALE_MS) > 0
  ? Number(process.env.NO_CODE_STALE_MS) : 5000;
const defaults: NoCodeConfig = {
  enabled: process.env.NO_CODE_ALARM_ENABLED === "true",
  frameThreshold: 300,
};
let config = { ...defaults };
let loaded = false;
let resetToken = randomUUID();
let lastAlarmAt: string | null = null;
let alarmCameras: { clientIp: string; consecutiveNoCodeFrames: number }[] = [];
let bypassed = false;
let pendingRaise = false;
let pendingClear = false;
const latest = new Map<string, CameraState>();
let timer: ReturnType<typeof setInterval> | null = null;
const defaultDeps = {
  isBypassActive: isQualityBypassActive,
  raiseAlarm: (detail: string) => raiseAlarm("noCode", detail),
  clearAlarm: () => clearAlarm("noCode").then(() => {}),
  clearAllAlarms,
  retryAlarm: retryPendingNormal,
  isNoCodeAlarmActive: () => isReasonActive("noCode"),
  loadConfig: async (): Promise<NoCodeConfig | null> => (await getParameter(PARAM_KEY))?.value ?? null,
  saveConfig: async (next: NoCodeConfig): Promise<void> => { await saveParameter(PARAM_KEY, next); },
};
let deps = defaultDeps;
// Serialize config, reports and hardware actions: disable/clear cannot race an in-flight raise.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.catch(() => {});
  return result;
}
export function validateConfig(value: unknown): asserts value is Partial<NoCodeConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置必须是对象");
  const c = value as Partial<NoCodeConfig>;
  if (c.enabled !== undefined && typeof c.enabled !== "boolean") throw new Error("enabled 必须是布尔值");
  if (c.frameThreshold !== undefined && (!Number.isSafeInteger(c.frameThreshold) || c.frameThreshold < 1))
    throw new Error("连续无喷码张数必须是正整数");
}
async function load() {
  if (loaded) return;
  const saved = await deps.loadConfig();
  if (saved) { validateConfig(saved); config = { ...defaults, ...saved }; }
  loaded = true;
}
function resetCounts() {
  resetToken = randomUUID();
  for (const state of latest.values()) {
    state.consecutiveNoCodeFrames = 0;
    state.resetToken = null;
  }
}
async function clearInternal(all = false) {
  resetCounts();
  pendingRaise = false;
  pendingClear = true;
  await (all ? deps.clearAllAlarms() : deps.clearAlarm());
  pendingClear = false;
}
export const initializeNoCodeAlarm = () => serial(load);
export const updateConfig = (patch: Partial<NoCodeConfig>) => serial(async () => {
  validateConfig(patch);
  await load();
  const next = { ...config, enabled: patch.enabled ?? config.enabled, frameThreshold: patch.frameThreshold ?? config.frameThreshold };
  await deps.saveConfig(next);
  const changed = next.enabled !== config.enabled || next.frameThreshold !== config.frameThreshold;
  config = next;
  if (changed) await clearInternal();
  return getStatus();
});
export const clearNoCodeAlarm = (all = false) => serial(() => clearInternal(all));

function prune(now: number) {
  for (const [ip, state] of latest) {
    if (now - state.frameAt > NO_CODE_STALE_MS) latest.delete(ip);
  }
}
async function syncBypass() {
  const nextBypass = await deps.isBypassActive();
  if (nextBypass !== bypassed) {
    bypassed = nextBypass;
    await clearInternal();
  }
}
async function evaluateInternal(now: number) {
  await load();
  await syncBypass();
  prune(now);
  if (pendingClear) {
    // Do not replay clear-all: a new defect may have arrived since the failure.
    await deps.clearAlarm();
    pendingClear = false;
  }
  if (!config.enabled || bypassed) return;
  if (pendingRaise) {
    await deps.retryAlarm();
    pendingRaise = false;
    return;
  }
  if (deps.isNoCodeAlarmActive() || latest.size === 0) return;
  if (![...latest.values()].every(c => c.resetToken === resetToken && c.consecutiveNoCodeFrames >= config.frameThreshold)) return;
  alarmCameras = [...latest.values()].map(c => ({clientIp: c.clientIp, consecutiveNoCodeFrames: c.consecutiveNoCodeFrames}));
  lastAlarmAt = new Date(now).toISOString();
  pendingRaise = true;
  await deps.raiseAlarm([...latest.keys()].sort().join(", "));
  pendingRaise = false;
}
export const evaluate = (now = Date.now()) => serial(() => evaluateInternal(now));
export const reportCamera = (report: CameraReport, now = Date.now()) => serial(async () => {
  await load();
  // Check bypass before accepting a report: both transitions invalidate old counters.
  await syncBypass();
  prune(now);
  const previous = latest.get(report.clientIp);
  if (previous?.sessionId === report.sessionId && previous.sequence >= report.sequence) return getStatus(now);
  if (report.frameAgeMs > NO_CODE_STALE_MS) {
    latest.delete(report.clientIp);
    return getStatus(now);
  }
  latest.set(report.clientIp, {
    ...report, frameAt: now - report.frameAgeMs,
    consecutiveNoCodeFrames: report.resetToken === resetToken && config.enabled && !bypassed
      ? report.consecutiveNoCodeFrames : 0,
  });
  await evaluateInternal(now);
  return getStatus(now);
});
export const getStatus = (now = Date.now()) => ({
  ...config,
  active: deps.isNoCodeAlarmActive(),
  resetToken,
  bypassed,
  cameras: [...latest.values()].filter(c => now - c.frameAt <= NO_CODE_STALE_MS).map(c => ({
    clientIp: c.clientIp, hasCode: c.hasCode, frameAgeMs: now - c.frameAt,
    consecutiveNoCodeFrames: c.consecutiveNoCodeFrames,
  })),
  lastAlarmAt,
  alarmCameras,
});
export const startNoCodeAlarmMonitor = () => {
  if (timer) return;
  // Monitor must run even when disabled so the runtime switch can enable it.
  timer = setInterval(() => {
    evaluate().catch(err => logger.error(`无喷码报警评估失败: ${err}`));
  }, 1000);
  initializeNoCodeAlarm().catch(err => logger.error(`无喷码配置加载失败: ${err}`));
};
export const stopNoCodeAlarmMonitor = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
export const resetNoCodeAlarmState = () => { resetCounts(); latest.clear(); lastAlarmAt = null; alarmCameras = []; bypassed = false; pendingRaise = false; pendingClear = false; };
export const __setDepsForTest = (next: Partial<typeof defaultDeps> | null) => {
  deps = next ? { ...defaultDeps, ...next } : defaultDeps;
  loaded = false;
};
