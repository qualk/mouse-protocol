/**
 * MCHOSE button-remapping vocabulary.
 *
 * A button assignment is a `type` nibble plus a 24-bit big-endian value, and
 * the type selects which table the value is looked up in — the same value means
 * different things under different types (`0x010000` is left-click under type 1
 * but "DPI switch" under type 5). All of it is transcribed from M HUB's own
 * tables; see docs/mchose-protocol.md.
 */

export const MCHOSE_BUTTON_TYPE = {
  /** Restore the button's factory function. Always paired with value 0. */
  default: 0,
  mouse: 1,
  keyboard: 2,
  media: 3,
  macro: 4,
  dpi: 5,
  system: 8,
  disable: 9,
  profile: 10,
} as const;

/** Physical buttons, in the order the config blob stores them. */
export const MCHOSE_BUTTONS: readonly string[] = [
  "Left", "Middle", "Right", "Forward", "Back", "DPI",
];

export interface MchoseButtonAction {
  label: string;
  type: number;
  value: number;
  group: string;
}

const action = (group: string, type: number) =>
  (label: string, value: number): MchoseButtonAction => ({ label, type, value, group });

const mouse = action("Mouse", MCHOSE_BUTTON_TYPE.mouse);
const key = action("Keyboard", MCHOSE_BUTTON_TYPE.keyboard);
const media = action("Media", MCHOSE_BUTTON_TYPE.media);
const dpi = action("DPI", MCHOSE_BUTTON_TYPE.dpi);
const system = action("System", MCHOSE_BUTTON_TYPE.system);
const profile = action("Profile", MCHOSE_BUTTON_TYPE.profile);

/** Keyboard entries, as `label` -> low 16 bits; the high byte is the modifier. */
const KEYS: ReadonlyArray<readonly [string, number]> = [
  ["A", 0x0400], ["B", 0x0500], ["C", 0x0600], ["D", 0x0700], ["E", 0x0800],
  ["F", 0x0900], ["G", 0x0a00], ["H", 0x0b00], ["I", 0x0c00], ["J", 0x0d00],
  ["K", 0x0e00], ["L", 0x0f00], ["M", 0x1000], ["N", 0x1100], ["O", 0x1200],
  ["P", 0x1300], ["Q", 0x1400], ["R", 0x1500], ["S", 0x1600], ["T", 0x1700],
  ["U", 0x1800], ["V", 0x1900], ["W", 0x1a00], ["X", 0x1b00], ["Y", 0x1c00],
  ["Z", 0x1d00],
  ["1", 0x1e00], ["2", 0x1f00], ["3", 0x2000], ["4", 0x2100], ["5", 0x2200],
  ["6", 0x2300], ["7", 0x2400], ["8", 0x2500], ["9", 0x2600], ["0", 0x2700],
  ["F1", 0x3a00], ["F2", 0x3b00], ["F3", 0x3c00], ["F4", 0x3d00], ["F5", 0x3e00],
  ["F6", 0x3f00], ["F7", 0x4000], ["F8", 0x4100], ["F9", 0x4200], ["F10", 0x4300],
  ["F11", 0x4400], ["F12", 0x4500],
  ["Esc", 0x2900], ["Tab", 0x2b00], ["Space", 0x2c00], ["Enter", 0x2800],
  ["Backspace", 0x2a00], ["Delete", 0x4c00], ["Insert", 0x4900],
  ["Home", 0x4a00], ["End", 0x4d00], ["Page Up", 0x4b00], ["Page Down", 0x4e00],
  ["Up", 0x5200], ["Down", 0x5100], ["Left", 0x5000], ["Right", 0x4f00],
  ["Caps Lock", 0x3900], ["Num Lock", 0x5300], ["Scroll Lock", 0x4700],
  ["Print Screen", 0x4600], ["Pause", 0x4800], ["Menu", 0x6500],
  ["Left Ctrl", 0xe000], ["Left Shift", 0xe100], ["Left Alt", 0xe200],
  ["Left Windows", 0xe300], ["Right Ctrl", 0xe400], ["Right Shift", 0xe500],
  ["Right Alt", 0xe600], ["Right Windows", 0xe700],
];

/** Shortcuts, where the top byte carries the modifier bitmask. */
const SHORTCUTS: ReadonlyArray<readonly [string, number]> = [
  ["Ctrl + A", 0x010400], ["Ctrl + C", 0x010600], ["Ctrl + N", 0x011100],
  ["Ctrl + O", 0x011200], ["Ctrl + S", 0x011600], ["Ctrl + T", 0x011700],
  ["Ctrl + V", 0x011900], ["Ctrl + W", 0x011a00], ["Ctrl + X", 0x011b00],
  ["Ctrl + Y", 0x011c00], ["Ctrl + Z", 0x011d00], ["Ctrl + Esc", 0x012900],
  ["Ctrl + Shift + Esc", 0x032900],
  ["Alt + Tab", 0x042b00], ["Alt + F4", 0x043d00], ["Alt + Esc", 0x042900],
  ["Alt + Left", 0x045000], ["Alt + Right", 0x044f00],
  ["Win + D", 0x080700], ["Win + E", 0x080800], ["Win + L", 0x080f00],
  ["Win + R", 0x081500], ["Win + S", 0x081600], ["Win + Tab", 0x082b00],
];

/**
 * Everything a button can be set to. "Default" restores the factory function
 * and is the only entry whose value must be zero.
 */
export const MCHOSE_BUTTON_ACTIONS: readonly MchoseButtonAction[] = [
  { label: "Default", type: MCHOSE_BUTTON_TYPE.default, value: 0, group: "Basic" },
  { label: "Disabled", type: MCHOSE_BUTTON_TYPE.disable, value: 0xffffff, group: "Basic" },

  mouse("Left click", 0x010000),
  mouse("Right click", 0x020000),
  mouse("Middle click", 0x040000),
  mouse("Forward", 0x100000),
  mouse("Back", 0x080000),
  mouse("Wheel up", 0x000200),
  mouse("Wheel down", 0x00fe00),

  dpi("DPI switch", 0x010000),
  dpi("DPI +", 0x020000),
  dpi("DPI -", 0x030000),

  media("Play / Pause", 0xcd0000),
  media("Next track", 0xb50000),
  media("Previous track", 0xb60000),
  media("Stop", 0xb70000),
  media("Volume +", 0xe90000),
  media("Volume -", 0xea0000),
  media("Mute", 0xe20000),

  system("Copy", 0x070106),
  system("Cut", 0x07011b),
  system("Paste", 0x070119),
  system("Screen brightness +", 0x0c6f00),
  system("Screen brightness -", 0x0c7000),

  profile("Switch to profile 1", 0x010000),
  profile("Switch to profile 2", 0x020000),
  profile("Switch to profile 3", 0x030000),
  profile("Cycle profiles", 0x040000),

  ...KEYS.map(([label, value]) => key(label, value)),
  ...SHORTCUTS.map(([label, value]) => key(label, value)),
];

/** Look up an action by its display label. */
export function mchoseFindButtonAction(label: string): MchoseButtonAction | null {
  return MCHOSE_BUTTON_ACTIONS.find((entry) => entry.label === label) ?? null;
}

/**
 * Name a stored assignment. Type and value must be matched together, since the
 * same value means different things under different types.
 */
export function mchoseDescribeButton(type: number, value: number): string {
  if (type === MCHOSE_BUTTON_TYPE.default) return "Default";
  if (type === MCHOSE_BUTTON_TYPE.macro) return "Macro";
  const found = MCHOSE_BUTTON_ACTIONS.find(
    (entry) => entry.type === type && entry.value === value,
  );
  if (found) return found.label;
  return `Unknown (type ${type}, 0x${value.toString(16).padStart(6, "0")})`;
}

/** Six four-byte entries starting at this offset of the 0x67 config payload. */
export const MCHOSE_BUTTON_TABLE_OFFSET = 20;
export const MCHOSE_BUTTON_ENTRY_LENGTH = 4;

export interface MchoseButtonAssignment {
  /** Which physical button this entry belongs to, from the high nibble. */
  buttonIndex: number;
  type: number;
  value: number;
  label: string;
}

export function mchoseDecodeButtons(payload: Uint8Array): MchoseButtonAssignment[] | null {
  const end = MCHOSE_BUTTON_TABLE_OFFSET + MCHOSE_BUTTONS.length * MCHOSE_BUTTON_ENTRY_LENGTH;
  if (payload.length < end) return null;
  return MCHOSE_BUTTONS.map((_, index) => {
    const at = MCHOSE_BUTTON_TABLE_OFFSET + index * MCHOSE_BUTTON_ENTRY_LENGTH;
    const header = payload[at] ?? 0;
    const type = header & 0x0f;
    const value = ((payload[at + 1] ?? 0) << 16)
      | ((payload[at + 2] ?? 0) << 8)
      | (payload[at + 3] ?? 0);
    return {
      buttonIndex: (header >> 4) & 0x0f,
      type,
      value,
      label: mchoseDescribeButton(type, value),
    };
  });
}

/**
 * Build the `0x52` write. Unlike DPI and polling this is a standalone command,
 * not part of the config blob, so it only ever touches one button.
 */
export function mchoseEncodeButton(
  buttonIndex: number,
  type: number,
  value: number,
): number[] {
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex >= MCHOSE_BUTTONS.length) {
    throw new Error(`Button index must be 0-${MCHOSE_BUTTONS.length - 1}.`);
  }
  return [
    0x52,
    buttonIndex,
    0,
    type & 0x0f,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

/**
 * Per-button name, read with `0x12 0x63 <index>`. A button carrying a macro
 * stores the macro's name here; every other button answers with a zero length.
 * The reply echoes the button index, which is what makes it safe to match.
 */
export const MCHOSE_READ_BUTTON_NAME = 0x63;
const MCHOSE_BUTTON_NAME_MAX = 20;

export function mchoseEncodeReadButtonName(buttonIndex: number): number[] {
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex >= MCHOSE_BUTTONS.length) {
    throw new Error(`Button index must be 0-${MCHOSE_BUTTONS.length - 1}.`);
  }
  return [MCHOSE_READ_BUTTON_NAME, buttonIndex];
}

export function mchoseDecodeButtonName(payload: Uint8Array, buttonIndex: number): string | null {
  if (payload.length < 2 || payload[0] !== buttonIndex) return null;
  const size = payload[1] ?? 0;
  if (size === 0 || size > MCHOSE_BUTTON_NAME_MAX || payload.length < 2 + size) return null;
  const name = String.fromCharCode(...payload.subarray(2, 2 + size)).trim();
  return name.length ? name : null;
}
