import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MchoseDockHidClient } from "./dock-hid.ts";
import { MchoseHidClient } from "./hid.ts";
import { MCHOSE_DOCK_COMMAND, MCHOSE_DOCK_EFFECT } from "@openmouse/protocol/mchose";

/** The lighting block a real MagDock returned: cycling, brightness 2, red. */
const LIGHTING = [0x01, 0x03, 0x06, 0x02, 0x02, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00];

function fakeDock(overrides?: Partial<HIDDevice>) {
  const state = { params: [...LIGHTING] };
  const listeners: Array<(event: unknown) => void> = [];

  const reply = (command: number): Uint8Array => {
    const buf = new Uint8Array(63);
    buf.set([0xaa, command, 0x02, 0x00, 0x00, 0x1e], 0);
    buf.set(state.params, 6);
    return buf;
  };

  const device = {
    vendorId: 0x3837,
    productId: 0x1012,
    productName: "MCHOSE MagDock",
    opened: true,
    collections: [
      { usagePage: 0xff00, usage: 0x0001, type: 0, children: [], input: 0, output: 0, feature: 0 },
    ],
    open: async () => {},
    close: async () => {},
    addEventListener: (_type: string, fn: (event: unknown) => void) => { listeners.push(fn); },
    removeEventListener: (_type: string, fn: (event: unknown) => void) => {
      const at = listeners.indexOf(fn);
      if (at >= 0) listeners.splice(at, 1);
    },
    sendReport: async (_id: number, data: ArrayBuffer | ArrayLike<number>) => {
      const frame = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      const command = frame[1]!;
      if (command === MCHOSE_DOCK_COMMAND.writeLighting) {
        // The dock takes the whole block at once.
        state.params = [...frame.subarray(6, 6 + 10), state.params[10]!];
      }
      // Answer on the next tick, as the real device does.
      const answer = reply(command === MCHOSE_DOCK_COMMAND.writeLighting
        ? MCHOSE_DOCK_COMMAND.writeLighting
        : command);
      setTimeout(() => {
        for (const fn of [...listeners]) fn({ data: new DataView(answer.buffer), reportId: 0 });
      }, 0);
    },
    ...overrides,
  } as unknown as HIDDevice;

  return { device, state };
}

describe("MchoseDockHidClient", () => {
  it("claims the MagDock on its own usage page", () => {
    assert.equal(MchoseDockHidClient.isSupported(fakeDock().device), true);
  });

  it("does not claim the mouse, and the mouse driver does not claim it", () => {
    const dock = fakeDock().device;
    assert.equal(MchoseHidClient.isSupported(dock), false, "mouse driver rejects the dock");

    const mouse = fakeDock({
      productId: 0x100b,
      collections: [
        { usagePage: 0xff01, usage: 0x0001, type: 0, children: [], input: 0, output: 0, feature: 0 },
      ],
    } as unknown as Partial<HIDDevice>).device;
    assert.equal(MchoseDockHidClient.isSupported(mouse), false, "dock driver rejects the mouse");
  });

  it("rejects another vendor's device on the same usage page", () => {
    const { device } = fakeDock({ vendorId: 0x046d } as Partial<HIDDevice>);
    assert.equal(MchoseDockHidClient.isSupported(device), false);
  });

  it("reads the base lighting and shapes it as a non-mouse status", async () => {
    const status = await new MchoseDockHidClient(fakeDock().device).readStatus();
    assert.equal(status.brand, "MCHOSE");
    assert.equal(status.name, "MCHOSE MagDock");
    assert.equal(status.ui?.settingsReady, false, "not a mouse: no settings grid");
    assert.equal(status.lighting?.zone, "Base");
    assert.equal(status.lighting?.mode, "Cycling");
    assert.equal(status.lighting?.color, "#ff0000");
    assert.equal(status.lighting?.brightness, 2);
    assert.ok(status.lighting?.modes.includes("Off"));
  });

  it("setLighting writes the whole block, carrying over what is unchanged", async () => {
    const { device, state } = fakeDock();
    const client = new MchoseDockHidClient(device);
    const status = await client.readStatus();
    await client.setLighting({ ...status.lighting!, mode: "Static", color: "#00ff00" });

    assert.equal(state.params[0], 1, "still on");
    assert.equal(state.params[1], MCHOSE_DOCK_EFFECT.static);
    assert.deepEqual(state.params.slice(6, 9), [0x00, 0xff, 0x00], "green");
    assert.equal(state.params[3], 2, "speed carried over");
    assert.equal(state.params[2], 6, "effect count carried over");
  });

  it("Off switches the base off without losing the effect", async () => {
    const { device, state } = fakeDock();
    const client = new MchoseDockHidClient(device);
    const status = await client.readStatus();
    await client.setLighting({ ...status.lighting!, mode: "Off" });
    assert.equal(state.params[0], 0, "disabled");
    assert.equal(state.params[1], MCHOSE_DOCK_EFFECT.cycling, "effect remembered");
    assert.equal((await client.readStatus()).lighting?.mode, "Off");
  });

  it("selecting Reactive turns on the music sync flag", async () => {
    const { device, state } = fakeDock();
    const client = new MchoseDockHidClient(device);
    const status = await client.readStatus();
    await client.setLighting({ ...status.lighting!, mode: "Reactive" });
    assert.equal(state.params[1], MCHOSE_DOCK_EFFECT.music);
    assert.equal(state.params[5], 1, "music sync set");
  });

  it("getDpiOptions is callable, as the app calls it for every client", () => {
    assert.deepEqual(new MchoseDockHidClient(fakeDock().device).getDpiOptions(), []);
  });
});
