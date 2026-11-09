import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./AudioEngine";

let deferredDecode: Promise<{ duration: number }> | undefined;
let resume: () => Promise<void>;
const sources: FakeSource[] = [];
const contexts: FakeContext[] = [];
class FakeSource {
  buffer: unknown;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeContext {
  constructor() {
    contexts.push(this);
  }
  state = "running";
  currentTime = 0;
  destination = {};
  sampleRate = 48000;
  createAnalyser() {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn(),
    };
  }
  createBufferSource() {
    const source = new FakeSource();
    sources.push(source);
    return source;
  }
  decodeAudioData() {
    return deferredDecode ?? Promise.resolve({ duration: 120 });
  }
  resume() {
    return resume();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}
const file = (name = "track.wav", size = 100) =>
  ({ name, size, arrayBuffer: async () => new ArrayBuffer(8) }) as File;
let engine: AudioEngine;
beforeEach(() => {
  deferredDecode = undefined;
  resume = () => Promise.resolve();
  sources.length = 0;
  contexts.length = 0;
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  engine = new AudioEngine();
});
afterEach(() => {
  engine.dispose();
  vi.unstubAllGlobals();
});
describe("audio lifecycle", () => {
  it("loads, plays, pauses, resumes, resets and seeks within bounds", async () => {
    await engine.load(file());
    expect(engine.getSnapshot()).toMatchObject({
      status: "ready",
      duration: 120,
      name: "track.wav",
    });
    await engine.play();
    expect(engine.getSnapshot().status).toBe("playing");
    engine.pause();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().status).toBe("paused");
    engine.seek(500);
    expect(engine.getSnapshot().position).toBe(120);
    await engine.play();
    expect(sources[1].start).toHaveBeenCalledWith(0, 0);
    engine.stop();
    expect(engine.getSnapshot()).toMatchObject({
      status: "ready",
      position: 0,
    });
    expect(engine.signal.bass).toBe(0);
  });
  it("resumes at the paused position without counting paused time", async () => {
    await engine.load(file());
    await engine.play();
    contexts[0].currentTime = 35;
    engine.pause();
    expect(engine.getSnapshot().position).toBe(35);
    contexts[0].currentTime = 80;
    await engine.play();
    expect(sources[1].start).toHaveBeenCalledWith(0, 35);
    contexts[0].currentTime = 90;
    engine.pause();
    expect(engine.getSnapshot().position).toBe(45);
  });
  it("seeking to the end finishes instead of restarting the track", async () => {
    await engine.load(file());
    await engine.play();
    engine.seek(120);
    await Promise.resolve();
    expect(engine.getSnapshot()).toMatchObject({
      status: "ended",
      position: 120,
    });
    expect(sources).toHaveLength(1);
  });
  it("handles natural completion and replay", async () => {
    await engine.load(file());
    await engine.play();
    sources[0].onended?.();
    expect(engine.getSnapshot()).toMatchObject({
      status: "ended",
      position: 120,
    });
    await engine.play();
    expect(sources[1].start).toHaveBeenCalledWith(0, 0);
  });
  it("ignores stale decodes when a new track replaces the old one", async () => {
    let finish!: (value: { duration: number }) => void;
    deferredDecode = new Promise((resolve) => {
      finish = resolve;
    });
    const first = engine.load(file("first.wav"));
    await Promise.resolve();
    deferredDecode = undefined;
    await engine.load(file("second.wav"));
    finish({ duration: 99 });
    await first;
    expect(engine.getSnapshot()).toMatchObject({
      name: "second.wav",
      duration: 120,
      status: "ready",
    });
  });
  it("does not start playback after Stop during an outstanding resume", async () => {
    await engine.load(file());
    let finish!: () => void;
    resume = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const pending = engine.play();
    engine.stop();
    finish();
    await pending;
    expect(sources).toHaveLength(0);
    expect(engine.getSnapshot().status).toBe("ready");
  });
  it("preserves playback intent across rapid seeks", async () => {
    await engine.load(file());
    await engine.play();
    engine.seek(20);
    engine.seek(40);
    await Promise.resolve();
    expect(engine.getSnapshot().status).toBe("playing");
    expect(sources.at(-1)?.start).toHaveBeenCalledWith(0, 40);
  });
  it("reports decode and resume errors without unhandled rejection", async () => {
    deferredDecode = Promise.reject(new Error("unsupported codec"));
    await engine.load(file());
    expect(engine.getSnapshot().status).toBe("error");
    deferredDecode = undefined;
    await engine.load(file());
    resume = () => Promise.reject(new Error("blocked"));
    await engine.play();
    expect(engine.getSnapshot()).toMatchObject({
      status: "paused",
      error: expect.stringContaining("blocked"),
    });
  });
  it("rejects empty and oversized files", async () => {
    await engine.load(file("empty.wav", 0));
    expect(engine.getSnapshot().error).toContain("empty");
    await engine.load(file("huge.wav", 151 * 1024 * 1024));
    expect(engine.getSnapshot().error).toContain("150 MB");
  });
});
