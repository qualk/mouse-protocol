/**
 * MCHOSE MagDock — the magnetic charging base, which carries the RGB the mouse
 * itself does not have.
 *
 * It is a **separate device with a separate protocol**: product id `0x1012` on
 * usage page `0xff00`, a WCH controller rather than the mouse's RealTek, and
 * plain (non-inverted) frames on unnumbered output report 0:
 *
 *   [0] 0xaa start
 *   [1] command
 *   [2] command type — 0 request, 2 response
 *   [3] frame sequence
 *   [4] total frames
 *   [5] parameter length
 *   [6…] parameters
 *
 * Replies use the same layout, so a reply's payload begins at offset 6.
 */

export const MCHOSE_DOCK_PRODUCT_ID = 0x1012;
export const MCHOSE_DOCK_USAGE_PAGE = 0xff00;
export const MCHOSE_DOCK_USAGE = 0x0001;

/** Unnumbered report: the id byte is 0. */
export const MCHOSE_DOCK_REPORT_ID = 0;
export const MCHOSE_DOCK_FRAME_LENGTH = 63;
export const MCHOSE_DOCK_PAYLOAD_OFFSET = 6;

const START = 0xaa;
const REQUEST = 0;
const RESPONSE = 2;

export const MCHOSE_DOCK_COMMAND = {
  readLighting: 7,
  writeLighting: 39,
} as const;

export function mchoseDockEncode(command: number, params: readonly number[] = []): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(MCHOSE_DOCK_FRAME_LENGTH);
  frame[0] = START;
  frame[1] = command;
  frame[2] = REQUEST;
  frame[3] = 0;
  frame[4] = 0;
  frame[5] = params.length;
  params.forEach((value, index) => { frame[MCHOSE_DOCK_PAYLOAD_OFFSET + index] = value & 0xff; });
  return frame;
}

/** Payload of a reply to `command`, or null when this is not that reply. */
export function mchoseDockPayload(raw: Uint8Array, command: number): Uint8Array | null {
  if (raw.length <= MCHOSE_DOCK_PAYLOAD_OFFSET) return null;
  if (raw[0] !== START || raw[1] !== command) return null;
  if (raw[2] !== RESPONSE && raw[2] !== REQUEST) return null;
  return raw.subarray(MCHOSE_DOCK_PAYLOAD_OFFSET);
}

/**
 * Effect ids, from MCHOSE's own enum
 * (`{static:0, breath:1, shiningBrightly:2, loop:3, goFlow:4, music:5}`).
 */
export const MCHOSE_DOCK_EFFECT = {
  static: 0,
  breathing: 1,
  shining: 2,
  cycling: 3,
  flow: 4,
  music: 5,
} as const;

/**
 * The shared `MouseLightingMode` union has no MCHOSE-specific names, so each
 * effect is mapped to its nearest shared label. "Shining" and "music" have no
 * exact counterpart — they are approximated by Spectrum and Reactive, which is
 * how they read in the panel.
 */
export const MCHOSE_DOCK_MODE_LABELS: ReadonlyArray<readonly [number, string]> = [
  [MCHOSE_DOCK_EFFECT.static, "Static"],
  [MCHOSE_DOCK_EFFECT.breathing, "Breathing single"],
  [MCHOSE_DOCK_EFFECT.shining, "Spectrum"],
  [MCHOSE_DOCK_EFFECT.cycling, "Cycling"],
  [MCHOSE_DOCK_EFFECT.flow, "Wave"],
  [MCHOSE_DOCK_EFFECT.music, "Reactive"],
];

/** Effects that actually use the base colour; the rest animate their own. */
export const MCHOSE_DOCK_COLOR_MODES: readonly string[] = ["Static", "Breathing single"];

/** Brightness and speed are both 0-4 in the protocol. */
export const MCHOSE_DOCK_LEVELS: readonly number[] = [0, 1, 2, 3, 4];

export interface MchoseDockLighting {
  enabled: boolean;
  effect: number;
  /** Count of effects the firmware reports; echoed back on write. */
  effectCount: number;
  speed: number;
  brightness: number;
  musicSync: boolean;
  color: [number, number, number];
  direction: number;
}

export function mchoseDockDecodeLighting(payload: Uint8Array): MchoseDockLighting | null {
  if (payload.length < 30) return null;
  return {
    enabled: payload[0] === 1,
    effect: payload[1] ?? 0,
    effectCount: payload[2] ?? 0,
    speed: payload[3] ?? 0,
    brightness: payload[4] ?? 0,
    musicSync: payload[5] === 1,
    color: [payload[6] ?? 0, payload[7] ?? 0, payload[8] ?? 0],
    direction: payload[29] ?? 0,
  };
}

/**
 * The write takes every field at once — there is no partial update — so a
 * caller changing one thing must supply the rest as they were.
 */
export function mchoseDockEncodeLighting(state: MchoseDockLighting): Uint8Array<ArrayBuffer> {
  return mchoseDockEncode(MCHOSE_DOCK_COMMAND.writeLighting, [
    state.enabled ? 1 : 0,
    state.effect,
    state.effectCount,
    state.speed,
    state.brightness,
    state.musicSync ? 1 : 0,
    state.color[0],
    state.color[1],
    state.color[2],
    state.direction,
  ]);
}

export function mchoseDockModeLabel(effect: number): string {
  return MCHOSE_DOCK_MODE_LABELS.find(([id]) => id === effect)?.[1] ?? "Static";
}

export function mchoseDockEffectFor(label: string): number | null {
  return MCHOSE_DOCK_MODE_LABELS.find(([, name]) => name === label)?.[0] ?? null;
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export function mchoseDockColorToHex(color: readonly [number, number, number]): string {
  return `#${color.map((c) => clampByte(c).toString(16).padStart(2, "0")).join("")}`;
}

export function mchoseDockColorFromHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
