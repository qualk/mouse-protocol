import assert from "node:assert/strict";
import test from "node:test";
import {
  MCHOSE_DOCK_COMMAND,
  MCHOSE_DOCK_EFFECT,
  MCHOSE_DOCK_FRAME_LENGTH,
  MCHOSE_DOCK_PAYLOAD_OFFSET,
  mchoseDockColorFromHex,
  mchoseDockColorToHex,
  mchoseDockDecodeLighting,
  mchoseDockEffectFor,
  mchoseDockEncode,
  mchoseDockEncodeLighting,
  mchoseDockModeLabel,
  mchoseDockPayload,
} from "./dock.ts";

/**
 * Captured from a real MCHOSE MagDock: the reply to the lighting read, with the
 * base on mode 3 (colour cycling) at brightness 2 and a red base colour.
 */
const REPLY = new Uint8Array(63);
REPLY.set([0xaa, 0x07, 0x02, 0x00, 0x00, 0x1e], 0);
REPLY.set([0x01, 0x03, 0x06, 0x02, 0x02, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00], 6);

test("a request frame carries the dock's plain, non-inverted header", () => {
  const frame = mchoseDockEncode(MCHOSE_DOCK_COMMAND.readLighting);
  assert.equal(frame.length, MCHOSE_DOCK_FRAME_LENGTH);
  assert.equal(frame[0], 0xaa, "start byte");
  assert.equal(frame[1], MCHOSE_DOCK_COMMAND.readLighting);
  assert.equal(frame[2], 0, "request");
  assert.equal(frame[5], 0, "no parameters");
  // Unlike the mouse, nothing here is XOR'd.
  assert.equal(frame[6], 0x00);
});

test("parameters land after the six-byte header", () => {
  const frame = mchoseDockEncode(MCHOSE_DOCK_COMMAND.writeLighting, [1, 2, 3]);
  assert.equal(frame[5], 3, "parameter length");
  assert.deepEqual([...frame.subarray(6, 9)], [1, 2, 3]);
});

test("a reply is only accepted for the command that was sent", () => {
  assert.ok(mchoseDockPayload(REPLY, MCHOSE_DOCK_COMMAND.readLighting));
  assert.equal(mchoseDockPayload(REPLY, MCHOSE_DOCK_COMMAND.writeLighting), null);
  const wrongStart = Uint8Array.from(REPLY);
  wrongStart[0] = 0x55;
  assert.equal(mchoseDockPayload(wrongStart, MCHOSE_DOCK_COMMAND.readLighting), null);
  assert.equal(mchoseDockPayload(new Uint8Array(4), MCHOSE_DOCK_COMMAND.readLighting), null);
});

test("the captured lighting state decodes field for field", () => {
  const payload = mchoseDockPayload(REPLY, MCHOSE_DOCK_COMMAND.readLighting)!;
  const state = mchoseDockDecodeLighting(payload);
  assert.deepEqual(state, {
    enabled: true,
    effect: MCHOSE_DOCK_EFFECT.cycling,
    effectCount: 6,
    speed: 2,
    brightness: 2,
    musicSync: false,
    color: [255, 0, 0],
    direction: 0,
  });
});

test("decoding rejects a payload too short to hold the block", () => {
  assert.equal(mchoseDockDecodeLighting(new Uint8Array(10)), null);
});

test("effects map onto the shared lighting labels", () => {
  assert.equal(mchoseDockModeLabel(MCHOSE_DOCK_EFFECT.static), "Static");
  assert.equal(mchoseDockModeLabel(MCHOSE_DOCK_EFFECT.cycling), "Cycling");
  assert.equal(mchoseDockModeLabel(MCHOSE_DOCK_EFFECT.flow), "Wave");
  assert.equal(mchoseDockEffectFor("Breathing single"), MCHOSE_DOCK_EFFECT.breathing);
  assert.equal(mchoseDockEffectFor("Reactive"), MCHOSE_DOCK_EFFECT.music);
  assert.equal(mchoseDockEffectFor("Nonexistent"), null);
});

test("an unknown effect id falls back rather than throwing", () => {
  assert.equal(mchoseDockModeLabel(99), "Static");
});

test("the write sends every field, since there is no partial update", () => {
  const payload = mchoseDockPayload(REPLY, MCHOSE_DOCK_COMMAND.readLighting)!;
  const state = mchoseDockDecodeLighting(payload)!;
  const frame = mchoseDockEncodeLighting({ ...state, brightness: 4 });
  assert.equal(frame[1], MCHOSE_DOCK_COMMAND.writeLighting);
  assert.equal(frame[5], 10, "ten parameters");
  const params = [...frame.subarray(MCHOSE_DOCK_PAYLOAD_OFFSET, MCHOSE_DOCK_PAYLOAD_OFFSET + 10)];
  assert.deepEqual(params, [1, 3, 6, 2, 4, 0, 255, 0, 0, 0]);
});

test("a decoded state re-encodes to the same parameters", () => {
  const payload = mchoseDockPayload(REPLY, MCHOSE_DOCK_COMMAND.readLighting)!;
  const state = mchoseDockDecodeLighting(payload)!;
  const frame = mchoseDockEncodeLighting(state);
  const params = [...frame.subarray(MCHOSE_DOCK_PAYLOAD_OFFSET, MCHOSE_DOCK_PAYLOAD_OFFSET + 9)];
  assert.deepEqual(params, [...payload.subarray(0, 9)], "round-trips the captured block");
});

test("colours convert both ways", () => {
  assert.equal(mchoseDockColorToHex([255, 0, 0]), "#ff0000");
  assert.equal(mchoseDockColorToHex([0, 255, 8]), "#00ff08");
  assert.deepEqual(mchoseDockColorFromHex("#00ff08"), [0, 255, 8]);
  assert.deepEqual(mchoseDockColorFromHex("00FF08"), [0, 255, 8]);
  assert.equal(mchoseDockColorFromHex("not a colour"), null);
});
