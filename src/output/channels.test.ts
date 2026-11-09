import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControllerChannel,
  connectOutput,
  type ChannelFactory,
  type ChannelPort,
} from "./channels";
import { FeatureReceiver } from "./FeatureReceiver";
import {
  STALE_AFTER_MS,
  type FeatureMessage,
  type OutputMessage,
} from "./protocol";
import type { AudioSnapshot } from "../types/audio";

const id = "controller-123456789";
class BusPort implements ChannelPort {
  static ports = new Set<BusPort>();
  onmessage: ChannelPort["onmessage"] = null;
  sent: OutputMessage[] = [];
  constructor(readonly name: string) {
    BusPort.ports.add(this);
  }
  postMessage(message: OutputMessage) {
    this.sent.push(message);
    for (const port of BusPort.ports) {
      if (port !== this && port.name === this.name)
        port.onmessage?.({
          data: structuredClone(message),
        } as MessageEvent<unknown>);
    }
  }
  close() {
    BusPort.ports.delete(this);
  }
}
const factory: ChannelFactory = (name) => new BusPort(name);
const cleanups: (() => void)[] = [];
const source = () => ({
  signal: { bass: 0.65, sensitivity: 1.5 },
  snapshot: {
    status: "playing",
    name: "private.wav",
    duration: 120,
    position: 10,
    error: null,
  } as AudioSnapshot,
  getSnapshot() {
    return this.snapshot;
  },
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  );
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  BusPort.ports.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("channel lifecycle", () => {
  it("sends at 40 Hz, carries only compact features, and synchronizes the output", () => {
    const audio = source();
    const controller = new ControllerChannel(id, audio, factory);
    cleanups.push(() => controller.dispose());
    const receiver = new FeatureReceiver(id);
    cleanups.push(connectOutput(receiver, factory));
    vi.advanceTimersByTime(1000);
    const port = [...BusPort.ports][0];
    const features = port.sent.filter(
      (m): m is FeatureMessage => m.type === "features",
    );
    expect(features.length).toBe(41); // Initial frame plus 40 ticks.
    expect(features.at(-1)).toMatchObject({
      bass: 0.65,
      sensitivity: 1.5,
      playback: "playing",
      scene: "pulse-reactor",
    });
    expect(Object.keys(features[0]).sort()).toEqual(
      [
        "version",
        "type",
        "controllerId",
        "streamId",
        "sequence",
        "startedAt",
        "sentAt",
        "bass",
        "sensitivity",
        "playback",
        "scene",
      ].sort(),
    );
    expect(receiver.getSnapshot()).toBe("connected");
    receiver.step(1);
    expect(receiver.signal.bass).toBeCloseTo(audio.signal.bass);
    audio.snapshot.status = "paused";
    vi.advanceTimersByTime(25);
    receiver.step(1);
    expect(receiver.signal.bass).toBeLessThan(0.001);
  });
  it("uses idle heartbeats and immediately serves a refreshed output", () => {
    const audio = source();
    audio.snapshot.status = "ready";
    const controller = new ControllerChannel(id, audio, factory);
    cleanups.push(() => controller.dispose());
    vi.advanceTimersByTime(1000);
    const port = [...BusPort.ports][0];
    expect(port.sent.filter((m) => m.type === "features")).toHaveLength(3);
    const oldReceiver = new FeatureReceiver(id);
    const close = connectOutput(oldReceiver, factory);
    vi.advanceTimersByTime(500);
    expect(oldReceiver.getSnapshot()).toBe("connected");
    close();
    vi.advanceTimersByTime(30);
    const refreshed = new FeatureReceiver(id);
    cleanups.push(connectOutput(refreshed, factory));
    expect(refreshed.getSnapshot()).toBe("connected");
  });
  it("announces shutdown, isolates controllers, and releases all resources on reconnection", () => {
    const controller = new ControllerChannel(id, source(), factory);
    const receiver = new FeatureReceiver(id);
    const wrong = new ControllerChannel(
      "other-controller-1234",
      source(),
      factory,
    );
    cleanups.push(() => wrong.dispose());
    const close = connectOutput(receiver, factory);
    vi.advanceTimersByTime(25);
    expect(receiver.getSnapshot()).toBe("connected");
    controller.dispose();
    controller.dispose();
    expect(receiver.getSnapshot()).toBe("disconnected");
    const replacement = new ControllerChannel(id, source(), factory);
    expect(receiver.getSnapshot()).toBe("connected");
    close();
    const newClose = connectOutput(receiver, factory);
    vi.advanceTimersByTime(50);
    newClose();
    replacement.dispose();
    wrong.dispose();
    expect(BusPort.ports.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("suspends on page hide and resumes after restoration", () => {
    const controller = new ControllerChannel(id, source(), factory);
    cleanups.push(() => controller.dispose());
    const receiver = new FeatureReceiver(id);
    cleanups.push(connectOutput(receiver, factory));
    vi.advanceTimersByTime(25);
    controller.suspend();
    expect(receiver.getSnapshot()).toBe("disconnected");
    vi.advanceTimersByTime(STALE_AFTER_MS + 100);
    expect(receiver.getSnapshot()).toBe("disconnected");
    controller.resume();
    expect(receiver.getSnapshot()).toBe("connected");
  });
});
