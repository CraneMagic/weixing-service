import {
  sendHexCommand,
  SerialPortType,
  turnOnRelay2,
  turnOffRelay2,
} from "./serial";
import { logger } from "../utils/logger";

async function requireSent(sent: Promise<boolean>, action: string): Promise<void> {
  if (!(await sent)) throw new Error(`${action}失败`);
}

/**
 * 切换到正常状态的硬件动作（绿灯开，红灯关，继电器2关）。
 * 供 HTTP 接口和服务内部（如无喷码报警）共用。
 */
export async function applyNormalState(current: () => boolean = () => true): Promise<void> {
  if (!current()) return;
  await requireSent(sendHexCommand([0xa0, 0x07, 0x00, 0xa7], SerialPortType.ALARM), "关闭红灯及蜂鸣指令发送");
  if (!current()) return;
  await requireSent(sendHexCommand([0xa0, 0x03, 0x00, 0xa3], SerialPortType.ALARM), "关闭红灯指令发送");
  if (!current()) return;
  await requireSent(sendHexCommand([0xa0, 0x02, 0x01, 0xa3], SerialPortType.ALARM), "打开绿灯指令发送");
  if (!current()) return;
  await requireSent(turnOffRelay2(), "关闭继电器2指令发送");
  logger.info("恢复正常状态的全部指令已发送: 绿灯开，红灯关，继电器2关");
}

/**
 * 切换到报警状态的硬件动作（红灯开，绿灯关，继电器2开）。
 * 供 HTTP 接口和服务内部（如无喷码报警）共用。
 */
export async function applyAlarmState(current: () => boolean = () => true): Promise<void> {
  // 关闭绿灯: A0 02 00 A2
  if (!current()) return;
  await requireSent(sendHexCommand([0xa0, 0x02, 0x00, 0xa2], SerialPortType.ALARM), "关闭绿灯指令发送");

  if (process.env.ALARM_WITH_SOUND !== "true") {
    // 打开红灯: A0 03 01 A4
    if (!current()) return;
    await requireSent(sendHexCommand([0xa0, 0x03, 0x01, 0xa4], SerialPortType.ALARM), "打开红灯指令发送");
  } else {
    // 打开红灯+蜂鸣: A0 07 01 A8
    if (!current()) return;
    await requireSent(sendHexCommand([0xa0, 0x07, 0x01, 0xa8], SerialPortType.ALARM), "打开红灯及蜂鸣指令发送");
  }

  // 打开继电器2: A0 02 01 A3 (持续报警)
  if (!current()) return;
  await requireSent(turnOnRelay2(), "打开继电器2指令发送");

  logger.info("报警状态静态指令已发送: 红灯开，绿灯关，继电器2开");
}

/** Manual all-off uses the same target synchronizer as red/green. */
export async function applyOffState(current: () => boolean = () => true): Promise<void> {
  if (!current()) return;
  await requireSent(sendHexCommand([0xa0, 0x00, 0x00, 0xa0], SerialPortType.ALARM), "关闭全部指示灯指令发送");
}
