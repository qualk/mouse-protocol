import type { MouseStatus } from "../mouse-types.ts";
import { VENDOR_ID } from "../vendors.ts";
import { LAMZU_PRODUCTS } from "@openmouse/protocol/lamzu";

// Attack Shark mice ship from multiple OEMs with different VIDs and protocols:
//
//   0x1d57 — R1, X11 family: HID feature reports, 250 ms cmd delay
//   0x25a7 — X3, X6, X8, X11 direct: GearHub-derived protocol (report 0, 64 B)
//   0x373e — R5 Ultra, R3 (Lamzu OEM) — usagePage 0xffff feature reports
//
// PIDs change between firmware revisions, so detection is collection-based,
// not PID-based. For 0x373e we exclude known Lamzu PIDs.
//
// 0x1d57 interface 2 exposes its feature reports under Telephony usage 0x0b,
// while input report 3 carries battery/status/ack events. Chromium exposes
// this interface through WebHID on Linux when the hidraw node is permitted.
// Some platforms hide the feature collection; those units remain status-only.
//
// Protocol source: xb-bx/attack-shark-r1-driver (Odin)
//                  HarukaYamamoto0/attack-shark-x11-driver (TypeScript)
//                  dressedinblack5/attack-shark-x11-electron (TypeScript)
//                  qmk.top GearHub bundle (MU class — 0x25a7 protocol)
//                  Research credit: viix0dev

// ── VID constants ─────────────────────────────────────────────────────────

const VID_1D57 = 0x1d57; // R1 / X11 family
const VID_25A7 = VENDOR_ID.attackShark; // X3, X6, X8, X11 direct
const VID_373E = 0x373e; // Lamzu OEM (R5 Ultra, R3)

// ── 0x1d57 protocol (R1 / X11) ───────────────────────────────────────────
// Confirmed from open-source driver research.

const X11_WRITE_SETTLE_MS = 250;

// Polling rate: feature report 0x06, 9 bytes.
// [len=0x09, 0x01, rate_byte, checksum, 0, 0, 0, 0]
// (The browser prepends the report ID 0x06 when calling sendFeatureReport.)
const POLLING_REPORT_ID = 0x06;

const POLLING_RATES_1D57: ReadonlyArray<readonly [number, number]> = [
  [0x08, 125],
  [0x04, 250],
  [0x02, 500],
  [0x01, 1000],
];

// Battery arrives as input report with this 4-byte signature; byte 4 = %.
// The leading 0x03 is the HID report id of the battery packet.
const BATTERY_SIGNATURE = [0x03, 0x55, 0x40, 0x01];
const BATTERY_REPORT_ID = BATTERY_SIGNATURE[0];
const ACK_REPORT_ID = 0x03;
const ACK_STATUS = 0x50;

// The X11/R1 family's DPI register is an OEM lookup value rather than DPI/50.
const X11_DPI_CODES: readonly number[] = [
  0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x8, 0x9, 0xa, 0xb, 0xc, 0xe, 0xf, 0x10, 0x11, 0x12,
  0x13, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x22, 0x23, 0x24, 0x25,
  0x26, 0x27, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x36, 0x37, 0x38,
  0x39, 0x3a, 0x3b, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x4a, 0x4b,
  0x4c, 0x4d, 0x4e, 0x4f, 0x51, 0x52, 0x53, 0x54, 0x55, 0x57, 0x58, 0x59, 0x5a, 0x5b, 0x5c, 0x5e,
  0x5f, 0x60, 0x61, 0x62, 0x63, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70,
  0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7f, 0x80, 0x81, 0x82, 0x83,
  0x84, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8d, 0x8e, 0x8f, 0x90, 0x91, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa7, 0xa8, 0xa9,
  0xaa, 0xab, 0xac, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xbb, 0xbc,
  0xbd, 0xbe, 0xbf, 0xc0, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xcf,
  0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdd, 0xde, 0xdf, 0xe0, 0xe1,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xea, 0xeb, 0x76, 0x77, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7f,
  0x80, 0x81, 0x82, 0x83, 0x84, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8d, 0x8e, 0x8f, 0x90, 0x91,
  0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f, 0xa1, 0xa2, 0xa3, 0xa4,
  0xa5, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, 0xb5, 0xb6, 0xb7,
  0xb8, 0xb9, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc9, 0xca,
  0xcb, 0xcc, 0xcd, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdd,
  0xde, 0xdf, 0xe0, 0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xea, 0xeb,
  0x76, 0x77, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7f, 0x80, 0x81,
  0x82, 0x83, 0x84, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8d,
];

// ── 0x25a7 protocol (GearHub / MU class) ─────────────────────────────────
// Reverse-engineered from the qmk.top GearHub web driver JS bundle.
// Uses HID feature reports on report ID 0x00, 64 bytes total.
// Commands are padded to 9 bytes; checksum goes in byte[7].

const REPORT_ID_25A7 = 0x00;
const REPORT_LEN_25A7 = 64;
const CMD_LEN_25A7 = 9;
const CMD_DELAY_25A7_MS = 100;

// Command IDs (MU class)
const FEA_CMD_GET_REV = 0x80; // Get firmware revision
const FEA_CMD_GET_DPI = 0xd4; // Get DPI slots (param: profile)
const FEA_CMD_SET_REPORT_RATE = 0x04; // Set polling rate

/** Polling-rate byte codes used by the 0x25a7 protocol. */
export const POLLING_CODES_25A7: ReadonlyMap<number, number> = new Map([
  [125, 0x08],
  [250, 0x04],
  [500, 0x02],
  [1000, 0x01],
  [2000, 0x84],
  [4000, 0x82],
  [8000, 0x81],
]);

// ── Collection helpers ─────────────────────────────────────────────────────

function hasFeatureReports(collection: HIDCollectionInfo): boolean {
  if (collection.featureReports.length > 0) return true;
  return collection.children.some(hasFeatureReports);
}

function hasVendorControl(collection: HIDCollectionInfo): boolean {
  if (collection.usagePage === 0xffff && collection.featureReports.length > 0) return true;
  return collection.children.some(hasVendorControl);
}

function declaresInputReport(collection: HIDCollectionInfo, reportId: number): boolean {
  if (collection.inputReports.some((report) => report.reportId === reportId)) return true;
  return collection.children.some((child) => declaresInputReport(child, reportId));
}

// ── X11 / R1 family ──────────────────────────────────────────────────────

interface X11FamilyProduct {
  displayName: string;
  diagnosticName: string;
  wireless: boolean;
  model: "X11" | "R1" | "shared";
}

// fa60 identifies the receiver protocol, not the paired shell.
const X11_FAMILY_PRODUCTS: ReadonlyMap<number, X11FamilyProduct> = new Map([
  [0xfa55, {
    displayName: "Attack Shark X11", diagnosticName: "Attack Shark X11 (wired)",
    wireless: false, model: "X11",
  }],
  [0xfa60, {
    displayName: "Attack Shark X11 / R1", diagnosticName: "Attack Shark X11 / R1 (wireless receiver)",
    wireless: true, model: "shared",
  }],
  [0xfa61, {
    displayName: "Attack Shark R1", diagnosticName: "Attack Shark R1 (wired)",
    wireless: false, model: "R1",
  }],
]);

// The wireless receiver's interface 2 pushes battery packets on its own —
// no command needed — so a read-only claim of that entry costs nothing and
// risks nothing. The wired PIDs never report battery on this endpoint.
const X11_WIRELESS_PID = 0xfa60;

/**
 * If the granted devices include an X11-family unit that no driver could
 * claim, explain why instead of letting the generic "not a control
 * interface" error blame the picker choice. This fires only when the
 * status entry (the composite with a Consumer collection) was not among
 * the grants — the rows look identical in the picker, so say how to get
 * the right one — and it stays honest about settings being native-only.
 * Returns null when no X11-family device is present.
 */
export function attackSharkNativeOnlyMessage(devices: HIDDevice[]): string | null {
  const unit = devices.find(
    (device) => device.vendorId === VID_1D57 && X11_FAMILY_PRODUCTS.has(device.productId),
  );
  if (!unit) return null;
  const name = X11_FAMILY_PRODUCTS.get(unit.productId)?.diagnosticName ?? "Attack Shark X11 / R1";
  return `This ${name} cannot be configured through the browser: its settings channel `
    + "is on an interface the browser is not allowed to reach. To change its settings, "
    + "install the OpenMouse Bridge, then open Interface settings "
    + "→ Bridge → Native devices and click “Enable native control”.";
}

// ── Protocol family detection ─────────────────────────────────────────────

type ProtocolFamily = "1d57" | "1d57-x11" | "25a7" | "373e" | null;

function detectFamily(device: HIDDevice): ProtocolFamily {
  if (device.vendorId === VID_1D57) {
    // Some 0x1d57 mice (X8 SE, X11) use the GearHub protocol despite
    // sharing the R1 VID. Distinguish by checking for a vendor-specific
    // collection (usagePage 0xffff) which the GearHub interface exposes.
    if (device.collections.some(hasVendorControl)) return "25a7";

    if (device.collections.some(hasFeatureReports)) return "1d57";

    // On platforms that filter the Telephony feature collection, interface 2
    // still exposes its Consumer collection and autonomous battery stream.
    // Claim that entry read-only; plain boot keyboard/mouse entries stay refused.
    if (X11_FAMILY_PRODUCTS.has(device.productId)
      && device.collections.some((collection) => collection.usagePage === 0x0c)) {
      return "1d57-x11";
    }

    return null;
  }
  if (device.vendorId === VID_25A7) {
    return device.collections.some(hasVendorControl) ? "25a7" : null;
  }
  if (device.vendorId === VID_373E) {
    if (LAMZU_PRODUCTS.has(device.productId)) return null;
    return device.collections.some(hasVendorControl) ? "373e" : null;
  }
  return null;
}

const X11_DEFAULT_DPI_STAGES = [800, 1600, 2400, 3200, 5000, 22000] as const;
const R1_DEFAULT_DPI_STAGES = [800, 1600, 3200, 4000, 5000, 12000] as const;

export function encodeX11Dpi(dpi: number): number {
  const step = dpi <= 10000 ? 50 : 100;
  if (!Number.isInteger(dpi) || dpi < 50 || dpi > 22000 || dpi % step !== 0) {
    throw new Error("X11/R1 DPI must use 50-DPI steps through 10000 and 100-DPI steps above it.");
  }
  const index = dpi <= 10000 ? dpi / 50 - 1 : 200 + (dpi - 10100) / 100;
  return X11_DPI_CODES[index];
}

export function buildX11DpiReport(
  stages: readonly number[],
  activeStage: number,
  angleSnapping: boolean,
  rippleControl: boolean,
): Uint8Array {
  if (stages.length !== 6) throw new Error("X11/R1 requires six DPI stages.");
  if (!Number.isInteger(activeStage) || activeStage < 1 || activeStage > 6) {
    throw new Error("X11/R1 active DPI stage must be between 1 and 6.");
  }
  const report = new Uint8Array(56);
  report[0] = 0x04;
  report[1] = 0x38;
  report[2] = 0x01;
  report[3] = angleSnapping ? 1 : 0;
  report[4] = rippleControl ? 1 : 0;
  report[5] = 0x3f;
  let highDpiMask = 0;
  for (let i = 0; i < 6; i++) {
    const dpi = stages[i];
    report[8 + i] = encodeX11Dpi(dpi);
    if (dpi > 12000) highDpiMask |= 1 << i;
    report[16 + i] = ((dpi >= 10100 && dpi <= 12000) || (dpi >= 20100 && dpi <= 22000)) ? 1 : 0;
  }
  report[6] = highDpiMask;
  report[7] = highDpiMask;
  report[24] = activeStage;
  report.set([0xff, 0, 0, 0, 0xff, 0, 0, 0, 0xff, 0xff, 0xff, 0, 0, 0xff, 0xff,
    0xff, 0, 0xff, 0xff, 0x40, 0, 0xff, 0xff, 0xff, 0x02], 25);
  let checksum = 0;
  for (let i = 3; i <= 49; i++) checksum += report[i];
  report[50] = checksum >> 8;
  report[51] = checksum & 0xff;
  return report;
}

export function buildX11PreferencesReport(
  sleepSeconds: number,
  deepSleepSeconds: number,
  debounceMs: number,
  r1Wired: boolean,
): Uint8Array {
  if (!Number.isInteger(sleepSeconds) || sleepSeconds < 30 || sleepSeconds > 1800 || sleepSeconds % 30 !== 0) {
    throw new Error("X11/R1 sleep timeout must be 30..1800 seconds in 30-second steps.");
  }
  if (!Number.isInteger(deepSleepSeconds) || deepSleepSeconds < 60 || deepSleepSeconds > 3600 || deepSleepSeconds % 60 !== 0) {
    throw new Error("X11/R1 deep sleep timeout must be 60..3600 seconds in 60-second steps.");
  }
  if (!Number.isInteger(debounceMs) || debounceMs < 4 || debounceMs > 50 || debounceMs % 2 !== 0) {
    throw new Error("X11/R1 debounce must be an even value from 4 to 50 ms.");
  }
  const deepMinutes = deepSleepSeconds / 60;
  const bucket = Math.floor((deepMinutes - 1) / 16);
  const report = new Uint8Array([0x05, 0x0f, 0x01, 0x00, (bucket << 4) | 0x03,
    (0x08 + deepMinutes * 0x10) & 0xff, 0x00, 0xff, 0x00,
    sleepSeconds / 30, (debounceMs - 4) / 2 + 0x02, 0x01, 0x00, 0, 0]);
  if (r1Wired) {
    report[4] = 0x03 | ((deepMinutes >> 4) & 0x0f);
    report[5] = 0x08 | ((deepMinutes & 0x0f) << 4);
    report[6] = 0;
    report[7] = 0;
    report[8] = 0xff;
    report[10] = debounceMs / 2;
    const low = deepMinutes & 0x0f;
    const high = deepMinutes >> 4 & 0x0f;
    report[12] = (((low + high) & 0x0f) << 4) + 0x0a + report[9] + report[10];
  } else {
    for (let i = 3; i <= 10; i++) report[12] = (report[12] + report[i]) & 0xff;
  }
  return report;
}

// ── 0x25a7 helpers ────────────────────────────────────────────────────────

/**
 * Compute the GearHub checksum: one's-complement of the sum of the first 7
 * command bytes, stored in byte 7.  Byte 8 stays zero (unused padding).
 */
export function checksum25a7(cmd: Uint8Array): Uint8Array {
  const out = new Uint8Array(CMD_LEN_25A7);
  out.set(cmd.subarray(0, Math.min(cmd.length, CMD_LEN_25A7)));
  let sum = 0;
  for (let i = 0; i < 7; i++) sum = (sum + out[i]) & 0xff;
  out[7] = (0xff - sum) & 0xff;
  return out;
}

/**
 * Encode a 64-byte HID report that starts with the 9-byte padded+checksummed
 * command and is zero-padded to REPORT_LEN_25A7.
 */
function encodeReport25a7(cmd: Uint8Array): Uint8Array {
  const report = new Uint8Array(REPORT_LEN_25A7);
  report.set(checksum25a7(cmd));
  return report;
}

/** Lookup a polling-rate Hz value and return its byte code. */
function pollingHzToCode25a7(hz: number): number | undefined {
  return POLLING_CODES_25A7.get(hz);
}

// ── Driver ────────────────────────────────────────────────────────────────

export class AttackSharkHidClient {
  readonly canDisableSleep = false;
  readonly device: HIDDevice;

  private readonly family: ProtocolFamily;
  private lastStatus: MouseStatus | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private batteryPercent: number | null = null;
  private listening = false;
  private readonly acknowledgements = new Map<number, Array<() => void>>();
  private dpiStages: number[];
  private activeDpiStage = 1;
  private angleSnapping = false;
  private rippleControl = false;
  private sleepTimeoutSeconds = 300;
  private deepSleepTimeoutSeconds = 900;
  private debounceMs = 8;
  private pollingRateHz = 250;

  constructor(device: HIDDevice) {
    this.device = device;
    this.family = detectFamily(device);
    this.dpiStages = [...(X11_FAMILY_PRODUCTS.get(device.productId)?.model === "R1"
      ? R1_DEFAULT_DPI_STAGES : X11_DEFAULT_DPI_STAGES)];
    // The 1d57 firmware is write-only: configuration cannot be read back, so a
    // fresh client would otherwise show defaults after every page reload.
    // Restore the last values this browser successfully wrote instead.
    if (this.family === "1d57") this.restoreX11State();
  }

  static isSupported(device: HIDDevice): boolean {
    return detectFamily(device) !== null;
  }

  // Battery packets arrive as inputreport events; the raw packet's leading
  // 0x03 is the HID report id, which WebHID strips into event.reportId, so
  // rebuild the native shape before matching the signature.
  private readonly onInputReport = (event: HIDInputReportEvent): void => {
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    const packet = new Uint8Array(data.length + 1);
    packet[0] = event.reportId;
    packet.set(data, 1);
    const percent = AttackSharkHidClient.parseBatteryReport(packet);
    const heartbeatPercent = event.reportId === 0x03
      ? AttackSharkHidClient.parseHeartbeatReport(packet)
      : null;
    const battery = percent ?? heartbeatPercent;
    if (battery !== null) {
      this.batteryPercent = battery;
      if (this.lastStatus) {
        this.lastStatus = { ...this.lastStatus, batteryPercent: battery, batteryState: "Discharging" };
      }
    }

    // The receiver often emits 03 10 50 00 <report-id> after SET_REPORT. Use it
    // when present, but retain the 250 ms settle fallback since some accepted 
    // writes are followed by an unrelated status packet instead.
    if (event.reportId === ACK_REPORT_ID && data.length >= 4
      && data[1] === ACK_STATUS) {
      const reportId = data[3];
      const waiters = this.acknowledgements.get(reportId);
      if (waiters?.length) {
        this.acknowledgements.delete(reportId);
        for (const resolve of waiters) resolve();
      }
    }
  };

  async open(): Promise<void> {
    if (!this.device.opened) await this.device.open();
    if (this.device.vendorId === VID_1D57 && !this.listening) {
      this.device.addEventListener("inputreport", this.onInputReport);
      this.listening = true;
    }
  }

  async close(): Promise<void> {
    this.lastStatus = null;
    this.acknowledgements.clear();
    if (this.listening) {
      this.device.removeEventListener("inputreport", this.onInputReport);
      this.listening = false;
    }
    if (this.device.opened) await this.device.close();
  }

  async startNotifications(): Promise<boolean> {
    return false;
  }

  displayName(): string {
    // X11-family product strings are generic OEM labels ("2.4G Wireless
    // Device", "USB Gaming Mouse"), so name those models by PID instead.
    const product = this.device.vendorId === VID_1D57
      ? X11_FAMILY_PRODUCTS.get(this.device.productId)
      : undefined;
    if (product) return product.displayName;
    const name = this.device.productName?.trim();
    if (!name) return "Attack Shark";
    return /^attack\s*shark/i.test(name) ? name : `Attack Shark ${name}`;
  }

  deviceBrand(): string {
    return "Attack Shark";
  }

  isWireless(): boolean {
    if (this.device.vendorId === VID_1D57) {
      const product = X11_FAMILY_PRODUCTS.get(this.device.productId);
      if (product) return product.wireless;
    }
    return /receiver|dongle|wireless|2\.4g/i.test(this.device.productName || "");
  }

  getSupportedPollingRates(): number[] {
    if (this.family === "1d57") return POLLING_RATES_1D57.map(([, hz]) => hz);
    if (this.family === "25a7") return [...POLLING_CODES_25A7.keys()];
    return [];
  }

  getSleepOptions(): readonly number[] {
    return Array.from({ length: 60 }, (_, index) => (index + 1) * 30);
  }

  getDeepSleepOptions(): readonly number[] {
    return Array.from({ length: 60 }, (_, index) => (index + 1) * 60);
  }

  getDebounceMaxMs(): number {
    return 50;
  }

  getDpiOptions(): number[] {
    // 25a7 devices expose up to 8 DPI slots per profile.
    // The actual values are read dynamically in readStatus(); we return a
    // standard set of supported DPI steps so the UI can offer them.
    if (this.family === "25a7") {
      return [400, 800, 1200, 1600, 2400, 3200, 6400, 12000, 26000];
    }
    if (this.family === "1d57") {
      const options: number[] = [];
      for (let dpi = 50; dpi <= 10000; dpi += 50) options.push(dpi);
      for (let dpi = 10100; dpi <= 22000; dpi += 100) options.push(dpi);
      return options;
    }
    return [];
  }

  async readStatus(): Promise<MouseStatus> {
    await this.open();

    let pollingRateHz = 0;
    let dpi = 0;
    let firmware: string[] = [];

    if (this.family === "1d57") {
      // X11/R1 firmware accepts the native read request inconsistently. On some
      // receiver revisions, issuing 0xa0 immediately after WebHID open wedges
      // the input path and stops cursor reports. Keep connection activation
      // passive: report the last values this browser wrote (restored from
      // local storage when present) instead of hardware state.
      pollingRateHz = this.pollingRateHz;
      dpi = this.dpiStages[this.activeDpiStage] ?? 0;
    }
    if (this.family === "25a7") {
      const result = await this.read25a7Status().catch(() => null);
      if (result) {
        pollingRateHz = result.pollingRateHz;
        dpi = result.dpi;
        firmware = result.firmware;
      }
    }

    return this.lastStatus = {
      brand: "Attack Shark",
      name: this.displayName(),
      ui: {
        family: "attack-shark",
        settingsReady: this.family === "1d57" || this.family === "25a7",
        valuesVerified: this.family !== "1d57",
        dpiStageEditor: this.family === "1d57"
          ? { maxStages: 6, countEditable: false, minDpi: 50, maxDpi: 22000, stepDpi: 50 }
          : undefined,
        hideUnsupportedPollingRates: true,
        hideProcessingCard: this.family !== "1d57",
        // Wireless X11-family units push battery on their own — but only
        // show the column when the battery report is actually visible to
        // the browser. On known units it is declared under the protected
        // system-control collection, so Chrome hides it and the packet can
        // never arrive; an always-empty battery column would just confuse.
        forceShowBattery: (this.family === "1d57" || this.family === "1d57-x11")
          && this.isWireless()
          && this.device.collections.some((collection) => declaresInputReport(collection, BATTERY_REPORT_ID)),
        statusNote: this.family === "1d57-x11"
          ? "Status only: this mouse's settings channel is not reachable from a browser and needs a native driver."
          : undefined,
      },
      batteryPercent: this.batteryPercent,
      batteryState: this.batteryPercent !== null ? "Discharging" : "Unknown",
      dpi,
      dpiStages: this.family === "1d57" ? [...this.dpiStages] : undefined,
      activeDpiStage: this.family === "1d57" ? this.activeDpiStage : undefined,
      pollingRateHz,
      supportedPollingRates: this.getSupportedPollingRates(),
      activeProfile: null,
      angleSnapping: this.family === "1d57" ? this.angleSnapping : undefined,
      rippleControl: this.family === "1d57" ? this.rippleControl : undefined,
      sleepTimeout: this.family === "1d57" ? this.sleepTimeoutSeconds : undefined,
      deepSleepTimeout: this.family === "1d57" ? this.deepSleepTimeoutSeconds : undefined,
      debounceMs: this.family === "1d57" ? this.debounceMs : undefined,
      connectionType: this.isWireless() ? "Wireless" : "Wired",
      connectionDetail: this.device.productId === X11_WIRELESS_PID
        ? "Shared X11/R1 2.4 GHz receiver"
        : undefined,
      liftOffDistance: null,
      firmware,
    };
  }

  async setDpi(dpi: number): Promise<number> {
    if (this.family !== "1d57") throw new Error("DPI control is not implemented for this Attack Shark model.");
    encodeX11Dpi(dpi);
    this.dpiStages[this.activeDpiStage] = dpi;
    await this.writeX11DpiReport();
    this.patchX11Status({ dpi, dpiStages: [...this.dpiStages], activeDpiStage: this.activeDpiStage });
    return dpi;
  }

  async setDpiStageValue(stage: number, dpi: number): Promise<number> {
    if (this.family !== "1d57") throw new Error("DPI control is not implemented for this Attack Shark model.");
    if (!Number.isInteger(stage) || stage < 0 || stage >= 6) throw new Error("X11/R1 DPI stage must be between 0 and 5.");
    encodeX11Dpi(dpi);
    this.dpiStages[stage] = dpi;
    await this.writeX11DpiReport();
    this.patchX11Status({ dpi: this.dpiStages[this.activeDpiStage], dpiStages: [...this.dpiStages] });
    return dpi;
  }

  async setActiveDpiStage(stage: number): Promise<number> {
    if (this.family !== "1d57") throw new Error("DPI stage control is not implemented for this Attack Shark model.");
    if (!Number.isInteger(stage) || stage < 0 || stage >= 6) throw new Error("X11/R1 DPI stage must be between 0 and 5.");
    this.activeDpiStage = stage;
    await this.writeX11DpiReport();
    this.patchX11Status({ dpi: this.dpiStages[stage], activeDpiStage: stage });
    return stage;
  }

  async setAngleSnapping(enabled: boolean): Promise<boolean> {
    if (this.family !== "1d57") throw new Error("Angle snapping is not implemented for this Attack Shark model.");
    this.angleSnapping = enabled;
    await this.writeX11DpiReport();
    this.patchX11Status({ angleSnapping: enabled });
    return enabled;
  }

  async setRippleControl(enabled: boolean): Promise<boolean> {
    if (this.family !== "1d57") throw new Error("Ripple control is not implemented for this Attack Shark model.");
    this.rippleControl = enabled;
    await this.writeX11DpiReport();
    this.patchX11Status({ rippleControl: enabled });
    return enabled;
  }

  async setSleepTimeout(seconds: number): Promise<number> {
    if (this.family !== "1d57") throw new Error("Sleep control is not implemented for this Attack Shark model.");
    const report = buildX11PreferencesReport(
      seconds, this.deepSleepTimeoutSeconds, this.debounceMs, this.device.productId === 0xfa61,
    );
    await this.writeX11Report(0x05, report);
    this.sleepTimeoutSeconds = seconds;
    this.patchX11Status({ sleepTimeout: seconds });
    return seconds;
  }

  async setDebounceTime(milliseconds: number): Promise<number> {
    if (this.family !== "1d57") throw new Error("Debounce control is not implemented for this Attack Shark model.");
    const report = buildX11PreferencesReport(
      this.sleepTimeoutSeconds, this.deepSleepTimeoutSeconds, milliseconds, this.device.productId === 0xfa61,
    );
    await this.writeX11Report(0x05, report);
    this.debounceMs = milliseconds;
    this.patchX11Status({ debounceMs: milliseconds });
    return milliseconds;
  }

  async setDeepSleepTimeout(seconds: number): Promise<number> {
    if (this.family !== "1d57") throw new Error("Deep sleep control is not implemented for this Attack Shark model.");
    const report = buildX11PreferencesReport(this.sleepTimeoutSeconds, seconds, this.debounceMs,
      this.device.productId === 0xfa61);
    await this.writeX11Report(0x05, report);
    this.deepSleepTimeoutSeconds = seconds;
    this.patchX11Status({ deepSleepTimeout: seconds });
    return seconds;
  }

  private async writeX11DpiReport(): Promise<void> {
    await this.writeX11Report(0x04, buildX11DpiReport(
      this.dpiStages,
      this.activeDpiStage + 1,
      this.angleSnapping,
      this.rippleControl,
    ));
  }

  private async writeX11Report(reportId: number, fullReport: Uint8Array): Promise<void> {
    await this.open();
    await this.run(async () => {
      const acknowledgement = this.waitForAck(reportId);
      const wiredLength = reportId === 0x04 ? 52 : reportId === 0x05 ? 13 : fullReport.length;
      const length = this.device.productId === X11_WIRELESS_PID ? fullReport.length : wiredLength;
      await this.device.sendFeatureReport(reportId, fullReport.slice(1, length));
      await Promise.all([acknowledgement, this.delay(X11_WRITE_SETTLE_MS)]);
    });
  }

  private patchX11Status(changes: Partial<MouseStatus>): void {
    if (this.lastStatus) this.lastStatus = { ...this.lastStatus, ...changes };
    if (this.family === "1d57") this.persistX11State();
  }

  private x11StorageKey(): string {
    return `openmouse:attackshark-1d57:${this.device.productId.toString(16)}`;
  }

  private persistX11State(): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return;
      storage.setItem(this.x11StorageKey(), JSON.stringify({
        dpiStages: this.dpiStages,
        activeDpiStage: this.activeDpiStage,
        angleSnapping: this.angleSnapping,
        rippleControl: this.rippleControl,
        sleepTimeoutSeconds: this.sleepTimeoutSeconds,
        deepSleepTimeoutSeconds: this.deepSleepTimeoutSeconds,
        debounceMs: this.debounceMs,
        pollingRateHz: this.pollingRateHz,
      }));
    } catch {
      // Private browsing or quota errors must never break device control.
    }
  }

  private restoreX11State(): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return;
      const raw = storage.getItem(this.x11StorageKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        dpiStages?: unknown;
        activeDpiStage?: unknown;
        angleSnapping?: unknown;
        rippleControl?: unknown;
        sleepTimeoutSeconds?: unknown;
        deepSleepTimeoutSeconds?: unknown;
        debounceMs?: unknown;
        pollingRateHz?: unknown;
      };
      const dpiStages = Array.isArray(saved.dpiStages) ? saved.dpiStages : null;
      if (dpiStages?.length === 6 && dpiStages.every((dpi) => {
        try {
          encodeX11Dpi(dpi as number);
          return true;
        } catch {
          return false;
        }
      })) {
        this.dpiStages = [...(dpiStages as number[])];
      }
      if (saved.activeDpiStage === 0 || saved.activeDpiStage === 1 || saved.activeDpiStage === 2
        || saved.activeDpiStage === 3 || saved.activeDpiStage === 4 || saved.activeDpiStage === 5) {
        this.activeDpiStage = saved.activeDpiStage;
      }
      if (typeof saved.angleSnapping === "boolean") this.angleSnapping = saved.angleSnapping;
      if (typeof saved.rippleControl === "boolean") this.rippleControl = saved.rippleControl;
      try {
        buildX11PreferencesReport(
          typeof saved.sleepTimeoutSeconds === "number" ? saved.sleepTimeoutSeconds : this.sleepTimeoutSeconds,
          typeof saved.deepSleepTimeoutSeconds === "number" ? saved.deepSleepTimeoutSeconds : this.deepSleepTimeoutSeconds,
          typeof saved.debounceMs === "number" ? saved.debounceMs : this.debounceMs,
          this.device.productId === 0xfa61,
        );
        if (typeof saved.sleepTimeoutSeconds === "number") this.sleepTimeoutSeconds = saved.sleepTimeoutSeconds;
        if (typeof saved.deepSleepTimeoutSeconds === "number") this.deepSleepTimeoutSeconds = saved.deepSleepTimeoutSeconds;
        if (typeof saved.debounceMs === "number") this.debounceMs = saved.debounceMs;
      } catch {
        // A corrupt entry restores nothing for the timing group.
      }
      if (typeof saved.pollingRateHz === "number"
        && POLLING_RATES_1D57.some(([, hz]) => hz === saved.pollingRateHz)) {
        this.pollingRateHz = saved.pollingRateHz;
      }
    } catch {
      // A corrupt entry means fresh defaults; never break device control.
    }
  }

  async setPollingRate(pollingRateHz: number): Promise<number> {
    if (this.family === "1d57-x11") {
      throw new Error(
        "This mouse's settings channel is not reachable from a browser; "
        + "changing settings needs the native Attack Shark X11 driver.",
      );
    }
    if (this.family === "1d57") {
      const entry = POLLING_RATES_1D57.find(([, hz]) => hz === pollingRateHz);
      if (!entry) throw new Error(`This mouse does not support ${pollingRateHz} Hz.`);
      await this.write1d57PollingRate(entry[0]);
      this.pollingRateHz = pollingRateHz;
      if (this.lastStatus) this.lastStatus = { ...this.lastStatus, pollingRateHz };
      if (this.family === "1d57") this.persistX11State();
      return pollingRateHz;
    }
    if (this.family === "25a7") {
      const code = pollingHzToCode25a7(pollingRateHz);
      if (code === undefined) throw new Error(`This mouse does not support ${pollingRateHz} Hz.`);
      await this.write25a7PollingRate(code);
      if (this.lastStatus) this.lastStatus = { ...this.lastStatus, pollingRateHz };
      return pollingRateHz;
    }
    throw new Error("Polling rate control is not yet implemented for this Attack Shark model.");
  }

  // ── 0x25a7 low-level ──────────────────────────────────────────────────

  /**
   * Send a 9-byte command via a 64-byte HID feature report (report ID 0x00),
   * then wait a short delay for the device to process it.
   */
  private async sendCmd25a7(cmd: Uint8Array): Promise<void> {
    const report = encodeReport25a7(cmd);
    await this.run(() => this.device.sendFeatureReport(REPORT_ID_25A7, report as BufferSource));
    await this.delay(CMD_DELAY_25A7_MS);
  }

  /**
   * Send a command and read back the 64-byte feature report reply.
   */
  private async askCmd25a7(cmd: Uint8Array): Promise<Uint8Array> {
    await this.sendCmd25a7(cmd);
    const reply = await this.run(() => this.device.receiveFeatureReport(REPORT_ID_25A7));
    return this.copyView(reply);
  }

  /**
   * Get firmware revision string(s) from the device.
   * Command 0x80 → response byte[1..2] = version (little-endian uint16).
   */
  private async getFirmware25a7(): Promise<string[]> {
    const resp = await this.askCmd25a7(new Uint8Array([FEA_CMD_GET_REV]));
    if (resp[0] !== FEA_CMD_GET_REV) return [];
    const version = resp[1] | (resp[2] << 8);
    return version !== 0 ? [`v${version}`] : [];
  }

  /**
   * Get DPI configuration for a profile.
   * Command 0xD4 [profile] → response contains active DPI index, slot count,
   * and per-slot X/Y values encoded as LE uint16.
   */
  private async getDpi25a7(profile: number): Promise<{ activeIndex: number; slots: number; dpis: number[] }> {
    const resp = await this.askCmd25a7(new Uint8Array([FEA_CMD_GET_DPI, profile]));
    if (resp[0] !== FEA_CMD_GET_DPI) return { activeIndex: 0, slots: 0, dpis: [] };
    const activeIndex = resp[2] > 8 ? 0 : resp[2];
    const slotCount = resp[3];
    const dpis: number[] = [];
    for (let i = 0; i < slotCount; i++) {
      const x = resp[8 + i * 2] | (resp[9 + i * 2] << 8);
      dpis.push(x);
    }
    return { activeIndex, slots: slotCount, dpis };
  }

  /**
   * Set polling rate via command 0x04.
   */
  private async write25a7PollingRate(code: number): Promise<void> {
    await this.sendCmd25a7(new Uint8Array([FEA_CMD_SET_REPORT_RATE, 0, code]));
  }

  /**
   * Read all status from a 0x25a7 device (firmware + DPI + polling rate).
   */
  private async read25a7Status(): Promise<{ pollingRateHz: number; dpi: number; firmware: string[] }> {
    const firmware = await this.getFirmware25a7();

    // Read DPI from profile 0
    const dpiResult = await this.getDpi25a7(0);
    const dpi = dpiResult.dpis[dpiResult.activeIndex] ?? 0;

    // Polling rate is not directly readable via a single command in the MU
    // class protocol; we default to 1000 Hz and let the user set it.
    const pollingRateHz = 1000;

    return { pollingRateHz, dpi, firmware };
  }

  // ── 0x1d57 low-level ──────────────────────────────────────────────────

  private async write1d57PollingRate(rateByte: number): Promise<void> {
    await this.open();
    // 8 data bytes — browser prepends report ID 0x06.
    // Structure: [0x09, 0x01, rate, checksum, 0, 0, 0, 0]
    const data = new Uint8Array([0x09, 0x01, rateByte, (0xff - rateByte) & 0xff, 0, 0, 0, 0]);
    await this.run(async () => {
      const acknowledgement = this.waitForAck(POLLING_REPORT_ID);
      await this.device.sendFeatureReport(POLLING_REPORT_ID, data);
      await Promise.all([acknowledgement, this.delay(X11_WRITE_SETTLE_MS)]);
    });
  }

  private waitForAck(reportId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const waiters = this.acknowledgements.get(reportId);
        if (waiters) {
          const index = waiters.indexOf(onAck);
          if (index >= 0) waiters.splice(index, 1);
          if (waiters.length === 0) this.acknowledgements.delete(reportId);
        }
        resolve(false);
      }, X11_WRITE_SETTLE_MS);
      const onAck = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      const waiters = this.acknowledgements.get(reportId) ?? [];
      waiters.push(onAck);
      this.acknowledgements.set(reportId, waiters);
    });
  }

  // ── shared helpers ────────────────────────────────────────────────────

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private copyView(view: DataView): Uint8Array {
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }

  /** Check if an input report matches the battery signature. */
  static isBatteryReport(data: Uint8Array): boolean {
    return BATTERY_SIGNATURE.every((byte, i) => data[i] === byte);
  }

  /** Extract battery percentage from a battery input report. */
  static parseBatteryReport(data: Uint8Array): number | null {
    if (!AttackSharkHidClient.isBatteryReport(data)) return null;
    const pct = data[4];
    return pct >= 0 && pct <= 100 ? pct : null;
  }

  /** Extract the R1/X11 heartbeat battery value: byte 4 is 0..10 (tens of %). */
  static parseHeartbeatReport(data: Uint8Array): number | null {
    if (data.length < 5 || data[0] !== 0x03 || data[1] !== 0x10 || data[2] !== 0x40 || data[3] !== 0x01) return null;
    return data[4] <= 10 ? data[4] * 10 : null;
  }
}
