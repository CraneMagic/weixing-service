import { getParameterOrCreate, saveParameter } from "../services/db";

export type QualityBypassState = {
  enabled: boolean;
  durationMinutes: number;
  enabledAt: string | null; // ISO string
};

const PARAM_KEY = "qualityBypass";
const DEFAULT_STATE: QualityBypassState = {
  enabled: false,
  durationMinutes: 15,
  enabledAt: null,
};

export async function getQualityBypassState(): Promise<QualityBypassState> {
  const value = (await getParameterOrCreate(
    PARAM_KEY
  )) as QualityBypassState | null;
  if (!value) return { ...DEFAULT_STATE };
  // 容错：补齐缺失字段
  return {
    enabled: Boolean((value as any).enabled),
    durationMinutes:
      typeof (value as any).durationMinutes === "number"
        ? (value as any).durationMinutes
        : DEFAULT_STATE.durationMinutes,
    enabledAt:
      typeof (value as any).enabledAt === "string"
        ? (value as any).enabledAt
        : null,
  };
}

export async function setQualityBypassState(
  next: QualityBypassState
): Promise<void> {
  await saveParameter(PARAM_KEY, next);
}

function calcRemainingSeconds(
  state: QualityBypassState,
  nowMs: number
): number {
  if (!state.enabled || !state.enabledAt) return 0;
  const startMs = Date.parse(state.enabledAt);
  if (isNaN(startMs)) return 0;
  const ttlMs = state.durationMinutes * 60 * 1000;
  const remaining = Math.max(0, startMs + ttlMs - nowMs);
  return Math.floor(remaining / 1000);
}

export async function isQualityBypassActive(): Promise<boolean> {
  const nowMs = Date.now();
  const state = await getQualityBypassState();
  const remaining = calcRemainingSeconds(state, nowMs);
  if (state.enabled && remaining === 0) {
    // 过期则自动复位
    await setQualityBypassState({
      enabled: false,
      durationMinutes: state.durationMinutes,
      enabledAt: null,
    });
    return false;
  }
  return state.enabled && remaining > 0;
}

export async function getBypassStateWithRemaining(): Promise<
  QualityBypassState & { remainingSeconds: number }
> {
  const nowMs = Date.now();
  const state = await getQualityBypassState();
  const remainingSeconds = calcRemainingSeconds(state, nowMs);
  if (state.enabled && remainingSeconds === 0) {
    // 过期则复位并返回复位后的状态
    const reset: QualityBypassState = {
      enabled: false,
      durationMinutes: state.durationMinutes,
      enabledAt: null,
    };
    await setQualityBypassState(reset);
    return { ...reset, remainingSeconds: 0 };
  }
  return { ...state, remainingSeconds };
}

export async function enableBypass(
  durationMinutes?: number
): Promise<QualityBypassState & { remainingSeconds: number }> {
  const current = await getQualityBypassState();
  const next: QualityBypassState = {
    enabled: true,
    durationMinutes:
      typeof durationMinutes === "number" && durationMinutes > 0
        ? durationMinutes
        : current.durationMinutes ?? DEFAULT_STATE.durationMinutes,
    enabledAt: new Date().toISOString(),
  };
  await setQualityBypassState(next);
  const remainingSeconds = calcRemainingSeconds(next, Date.now());
  return { ...next, remainingSeconds };
}

export async function disableBypass(): Promise<
  QualityBypassState & { remainingSeconds: number }
> {
  const current = await getQualityBypassState();
  const next: QualityBypassState = {
    enabled: false,
    durationMinutes: current.durationMinutes,
    enabledAt: null,
  };
  await setQualityBypassState(next);
  return { ...next, remainingSeconds: 0 };
}
