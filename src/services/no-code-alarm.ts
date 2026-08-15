import { isQualityBypassActive } from "../utils/qualityBypass";
import {
  raiseAlarm as raiseSharedAlarm,
  isReasonActive,
} from "./alarm-state";
import { logger } from "../utils/logger";

/**
 * 无喷码报警状态机。
 *
 * 三路相机各自由独立的 tcp-server 实例接收，单个实例只看得到一路，
 * 因此聚合放在 weixing-service：每个 tcp-server 每秒上报自己那一路的
 * 最新喷码状态，这里汇总判定。
 *
 * 判定「三路同时无喷码」需同时满足：
 *   1. 数据新鲜的相机数量 === NO_CODE_CAMERA_COUNT
 *   2. 每一路最新帧都在 NO_CODE_STALE_MS 以内（停机/断线/上报中断都不误报）
 *   3. 每一路最新帧 has_code === false
 *
 * 陈旧条目会在每次评估时从状态表剔除，否则历史上出现过的 IP（相机换 IP、
 * 临时接入的调试相机）会永远占着位置，让第 1 条永不成立、报警静默失效。
 *
 * 该状态连续成立满 NO_CODE_ALARM_DURATION_MS → 报警。
 * 报警后计时重新开始：故障持续存在时每 30 秒重复报警一次，
 * 因此用户手动清除报警后若问题未解决仍会再次报警。
 */

export const NO_CODE_ALARM_ENABLED =
  process.env.NO_CODE_ALARM_ENABLED === "true";

export const NO_CODE_ALARM_DURATION_MS = parseInt(
  process.env.NO_CODE_ALARM_DURATION_MS || "30000",
  10
);

export const NO_CODE_STALE_MS = parseInt(
  process.env.NO_CODE_STALE_MS || "5000",
  10
);

export const NO_CODE_CAMERA_COUNT = parseInt(
  process.env.NO_CODE_CAMERA_COUNT || "3",
  10
);

export const NO_CODE_EVAL_INTERVAL_MS = parseInt(
  process.env.NO_CODE_EVAL_INTERVAL_MS || "1000",
  10
);

interface CameraState {
  hasCode: boolean;
  /** 该路最新一帧的时刻（由上报里的 frameAgeMs 换算，避免依赖各容器时钟一致） */
  frameAt: number;
}

export interface NoCodeAlarmStatus {
  enabled: boolean;
  active: boolean;
  durationMs: number;
  cameras: { clientIp: string; hasCode: boolean; frameAgeMs: number }[];
  noCodeElapsedMs: number;
  lastAlarmAt: string | null;
}

const latest = new Map<string, CameraState>();
let noCodeSince: number | null = null;
let lastAlarmAt: number | null = null;
let evalTimer: ReturnType<typeof setInterval> | null = null;

/** 外部依赖，测试时可整体替换，使得报警的完整路径（含质量跳过分支）都能被覆盖 */
interface Deps {
  isBypassActive: () => Promise<boolean>;
  raiseAlarm: (detail: string) => Promise<void>;
  isNoCodeAlarmActive: () => boolean;
}

const defaultDeps: Deps = {
  isBypassActive: isQualityBypassActive,
  raiseAlarm: (detail) => raiseSharedAlarm("noCode", detail),
  isNoCodeAlarmActive: () => isReasonActive("noCode"),
};

let deps: Deps = defaultDeps;

/**
 * 执行报警动作。返回是否真的报了警 —— 质量跳过期间返回 false，
 * 这样 lastAlarmAt 不会被置位，前端也就不会弹出横幅。
 */
const doAlarm = async (cameras: string[]): Promise<boolean> => {
  if (await deps.isBypassActive()) {
    logger.info("质量跳过已开启，跳过无喷码报警");
    return false;
  }

  await deps.raiseAlarm(cameras.join(", "));
  return true;
};

/** 剔除陈旧条目，防止历史 IP 永久占位导致报警静默失效 */
const pruneStale = (now: number): void => {
  for (const [clientIp, state] of latest.entries()) {
    if (now - state.frameAt > NO_CODE_STALE_MS) {
      latest.delete(clientIp);
      logger.info(`相机 ${clientIp} 数据陈旧，已移出无喷码判定`);
    }
  }
};

const isAllNoCode = (now: number): boolean => {
  if (latest.size !== NO_CODE_CAMERA_COUNT) return false;

  for (const state of latest.values()) {
    if (state.hasCode) return false;
  }
  return true;
};

/**
 * 接收单路相机的喷码状态上报。
 * frameAgeMs 是「该路最新一帧距上报时刻过去了多久」，由上报方计算，
 * 这样跨容器不需要时钟同步。
 */
export const reportCamera = (
  clientIp: string,
  hasCode: boolean,
  frameAgeMs: number,
  now: number = Date.now()
): void => {
  if (!NO_CODE_ALARM_ENABLED) return;
  if (!clientIp || typeof hasCode !== "boolean") return;

  const age = Number.isFinite(frameAgeMs) && frameAgeMs > 0 ? frameAgeMs : 0;
  latest.set(clientIp, { hasCode, frameAt: now - age });
  evaluate(now);
};

/** 评估当前状态，必要时触发报警。由上报和周期定时器调用。 */
export const evaluate = (now: number = Date.now()): void => {
  if (!NO_CODE_ALARM_ENABLED) return;

  pruneStale(now);

  if (!isAllNoCode(now)) {
    if (noCodeSince !== null) {
      logger.info("无喷码状态中断，计时清零");
      noCodeSince = null;
    }
    return;
  }

  if (noCodeSince === null) {
    noCodeSince = now;
    logger.info(`检测到 ${NO_CODE_CAMERA_COUNT} 路同时无喷码，开始计时`);
    return;
  }

  if (now - noCodeSince < NO_CODE_ALARM_DURATION_MS) return;

  const cameras = Array.from(latest.keys()).sort();
  logger.warn(
    `无喷码报警触发: ${cameras.join(", ")} 持续 ${now - noCodeSince}ms 无喷码`
  );

  // 先重置计时，再执行报警动作：避免异步报警期间被重复触发
  noCodeSince = now;

  doAlarm(cameras)
    .then((raised) => {
      // 只有真的报了警才记录时刻；被质量跳过挡下时不记，前端不弹横幅
      if (raised) lastAlarmAt = now;
    })
    .catch((err) => {
      logger.error(`无喷码报警动作失败: ${err}`);
    });
};

/**
 * 供前端轮询的状态。
 * active 直接由共享的报警原因集合派生，而不是本地标志 ——
 * 这样质量跳过挡下的"报警"不会显示，通过 /api/alarm/clear 的清除也能立刻反映。
 */
export const getStatus = (now: number = Date.now()): NoCodeAlarmStatus => ({
  enabled: NO_CODE_ALARM_ENABLED,
  active: deps.isNoCodeAlarmActive(),
  durationMs: NO_CODE_ALARM_DURATION_MS,
  cameras: Array.from(latest.entries()).map(([clientIp, s]) => ({
    clientIp,
    hasCode: s.hasCode,
    frameAgeMs: now - s.frameAt,
  })),
  noCodeElapsedMs: noCodeSince === null ? 0 : now - noCodeSince,
  lastAlarmAt: lastAlarmAt === null ? null : new Date(lastAlarmAt).toISOString(),
});

export const startNoCodeAlarmMonitor = (): void => {
  if (!NO_CODE_ALARM_ENABLED) {
    logger.info("无喷码报警未启用 (NO_CODE_ALARM_ENABLED)");
    return;
  }
  if (evalTimer) return;

  evalTimer = setInterval(() => evaluate(), NO_CODE_EVAL_INTERVAL_MS);
  logger.info(
    `无喷码报警已启用: ${NO_CODE_CAMERA_COUNT} 路同时无喷码持续 ${NO_CODE_ALARM_DURATION_MS}ms 报警，陈旧阈值 ${NO_CODE_STALE_MS}ms`
  );
};

export const stopNoCodeAlarmMonitor = (): void => {
  if (!evalTimer) return;
  clearInterval(evalTimer);
  evalTimer = null;
};

/** 仅供测试：清空状态 */
export const resetNoCodeAlarmState = (): void => {
  latest.clear();
  noCodeSince = null;
  lastAlarmAt = null;
};

/** 仅供测试：替换外部依赖 */
export const __setDepsForTest = (next: Partial<Deps> | null): void => {
  deps = next ? { ...defaultDeps, ...next } : defaultDeps;
};
