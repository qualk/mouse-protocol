import assert from "node:assert/strict";
import test from "node:test";
import {
  MCHOSE_BUTTONS,
  MCHOSE_BUTTON_ACTIONS,
  MCHOSE_BUTTON_TYPE,
  mchoseDecodeButtons,
  mchoseDescribeButton,
  mchoseEncodeButton,
  mchoseFindButtonAction,
  mchoseEncodeReadButtonName,
  mchoseDecodeButtonName,
  MCHOSE_READ_BUTTON_NAME,
} from "./buttons.ts";

/**
 * The button table as read from a real A7 V2 Ultra+: left/middle/right/DPI on
 * their factory functions, and forward/back mapped to keyboard F9 and F10.
 */
const CONFIG_WITH_BUTTONS = new Uint8Array(64);
CONFIG_WITH_BUTTONS.set([0x00, 0x30, 0x20, 0x00, 0x40, 0x06], 0);
CONFIG_WITH_BUTTONS.set([
  0x00, 0x00, 0x00, 0x00, // 0 left    type 0
  0x10, 0x00, 0x00, 0x00, // 1 middle  type 0
  0x20, 0x00, 0x00, 0x00, // 2 right   type 0
  0x32, 0x00, 0x42, 0x00, // 3 forward type 2, 0x004200 = F9
  0x42, 0x00, 0x43, 0x00, // 4 back    type 2, 0x004300 = F10
  0x50, 0x00, 0x00, 0x00, // 5 DPI     type 0
], 20);

test("the six buttons decode in the order the blob stores them", () => {
  const buttons = mchoseDecodeButtons(CONFIG_WITH_BUTTONS);
  assert.ok(buttons);
  assert.equal(buttons.length, 6);
  assert.deepEqual(buttons.map((b) => b.buttonIndex), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(MCHOSE_BUTTONS, ["Left", "Middle", "Right", "Forward", "Back", "DPI"]);
});

test("the captured mapping names the keyboard keys behind forward and back", () => {
  const buttons = mchoseDecodeButtons(CONFIG_WITH_BUTTONS)!;
  assert.deepEqual(buttons.map((b) => b.label), [
    "Default", "Default", "Default", "F9", "F10", "Default",
  ]);
});

test("type and value must be matched together, since values collide", () => {
  // 0x010000 is left-click as a mouse action but "DPI switch" as a DPI action.
  assert.equal(mchoseDescribeButton(MCHOSE_BUTTON_TYPE.mouse, 0x010000), "Left click");
  assert.equal(mchoseDescribeButton(MCHOSE_BUTTON_TYPE.dpi, 0x010000), "DPI switch");
  assert.equal(mchoseDescribeButton(MCHOSE_BUTTON_TYPE.profile, 0x010000), "Switch to profile 1");
});

test("a macro and an unrecognised assignment are still named", () => {
  assert.equal(mchoseDescribeButton(MCHOSE_BUTTON_TYPE.macro, 0x123456), "Macro");
  assert.match(mchoseDescribeButton(6, 0xabcdef), /^Unknown \(type 6, 0xabcdef\)$/);
});

test("default is the only action carrying a zero value", () => {
  const zeroed = MCHOSE_BUTTON_ACTIONS.filter((entry) => entry.value === 0);
  assert.deepEqual(zeroed.map((entry) => entry.label), ["Default"]);
  assert.equal(zeroed[0]!.type, MCHOSE_BUTTON_TYPE.default);
});

test("every action label is unique, since the picker keys on it", () => {
  const labels = MCHOSE_BUTTON_ACTIONS.map((entry) => entry.label);
  assert.equal(new Set(labels).size, labels.length);
});

test("the write is a standalone command with a 24-bit big-endian value", () => {
  const tokens = mchoseEncodeButton(3, MCHOSE_BUTTON_TYPE.media, 0xcd0000);
  assert.deepEqual(tokens, [0x52, 3, 0, MCHOSE_BUTTON_TYPE.media, 0xcd, 0x00, 0x00]);
});

test("resetting a button to default sends type 0 and value 0", () => {
  const action = mchoseFindButtonAction("Default")!;
  assert.deepEqual(
    mchoseEncodeButton(0, action.type, action.value),
    [0x52, 0, 0, 0, 0, 0, 0],
  );
});

test("the write refuses a button this mouse does not have", () => {
  assert.throws(() => mchoseEncodeButton(6, 1, 0), /0-5/);
  assert.throws(() => mchoseEncodeButton(-1, 1, 0), /0-5/);
});

test("actions round-trip from label to bytes and back to label", () => {
  for (const entry of MCHOSE_BUTTON_ACTIONS) {
    const tokens = mchoseEncodeButton(0, entry.type, entry.value);
    const value = (tokens[4]! << 16) | (tokens[5]! << 8) | tokens[6]!;
    assert.equal(value, entry.value, `${entry.label} value survives encoding`);
    assert.equal(mchoseDescribeButton(entry.type, value), entry.label);
  }
});

test("mchoseFindButtonAction rejects an unknown label", () => {
  assert.equal(mchoseFindButtonAction("Launch rocket"), null);
});

test("decoding rejects a payload too short to hold the table", () => {
  assert.equal(mchoseDecodeButtons(CONFIG_WITH_BUTTONS.subarray(0, 30)), null);
});

test("a macro's name is read per button and echoes its index", () => {
  assert.deepEqual(mchoseEncodeReadButtonName(3), [MCHOSE_READ_BUTTON_NAME, 3]);
  assert.throws(() => mchoseEncodeReadButtonName(6), /0-5/);

  // "Spray" stored on button 3.
  const named = new Uint8Array([3, 5, 0x53, 0x70, 0x72, 0x61, 0x79]);
  assert.equal(mchoseDecodeButtonName(named, 3), "Spray");
  // A reply for a different button must never be adopted.
  assert.equal(mchoseDecodeButtonName(named, 4), null);
});

test("a button with no macro reports no name", () => {
  // What every button on the test hardware answered: index echoed, length 0.
  assert.equal(mchoseDecodeButtonName(new Uint8Array([0, 0, 0, 0]), 0), null);
  assert.equal(mchoseDecodeButtonName(new Uint8Array([2, 99, 0x41]), 2), null, "length beyond the payload");
});
