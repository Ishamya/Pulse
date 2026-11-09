import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startControllerSession } from "./controllerSession";
import type { AudioSnapshot } from "../types/audio";

const savedId = "saved-controller-1234";
const disposers: (() => void)[] = [];
const source = {
  signal: { bass: 0, sensitivity: 1 },
  getSnapshot: (): AudioSnapshot => ({
    status: "empty",
    name: "",
    duration: 0,
    position: 0,
    error: null,
  }),
};
let activeChannels: number;
let storage: Map<string, string>;
let held: Set<string>;

beforeEach(() => {
  vi.useFakeTimers();
  activeChannels = 0;
  storage = new Map([["pulse.visual-controller.v1", savedId]]);
  held = new Set();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      constructor() {
        activeChannels++;
      }
      postMessage() {}
      close() {
        activeChannels--;
      }
    },
  );
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        name: string,
        options: { signal: AbortSignal },
        callback: () => Promise<void>,
      ) => {
        await Promise.resolve();
        if (options.signal.aborted)
          throw new DOMException("Aborted", "AbortError");
        if (held.has(name))
          await new Promise<void>((_, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        held.add(name);
        try {
          await callback();
        } finally {
          held.delete(name);
        }
      },
    },
  });
});
afterEach(async () => {
  disposers.splice(0).forEach((dispose) => dispose());
  await vi.advanceTimersByTimeAsync(0);
  expect(activeChannels).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("controller ownership", () => {
  it("preserves refresh identity and cancels discarded StrictMode setup", async () => {
    const discarded = vi.fn();
    const error = vi.fn();
    const stop = startControllerSession(source, discarded, error);
    stop();
    const ready = vi.fn();
    disposers.push(startControllerSession(source, ready, error));
    await vi.advanceTimersByTimeAsync(0);
    expect(discarded).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledWith(savedId);
    expect(error).not.toHaveBeenCalled();
    expect(activeChannels).toBe(1);
  });
  it("isolates copied tab identities without creating duplicate publishers", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const error = vi.fn();
    disposers.push(startControllerSession(source, first, error));
    await vi.advanceTimersByTimeAsync(0);
    disposers.push(startControllerSession(source, second, error));
    await vi.advanceTimersByTimeAsync(300);
    expect(first).toHaveBeenCalledWith(savedId);
    expect(second).toHaveBeenCalledOnce();
    expect(second.mock.calls[0][0]).not.toBe(savedId);
    expect(activeChannels).toBe(2);
    expect(held.size).toBe(2);
    expect(error).not.toHaveBeenCalled();
  });
  it("uses unique ephemeral sessions without Web Locks", () => {
    vi.stubGlobal("navigator", {});
    const first = vi.fn();
    const second = vi.fn();
    disposers.push(startControllerSession(source, first, vi.fn()));
    disposers.push(startControllerSession(source, second, vi.fn()));
    expect(first.mock.calls[0][0]).not.toBe(second.mock.calls[0][0]);
    expect(first.mock.calls[0][0]).not.toBe(savedId);
  });
  it("reports unavailable BroadcastChannel without creating resources", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const error = vi.fn();
    disposers.push(startControllerSession(source, vi.fn(), error));
    expect(error).toHaveBeenCalledOnce();
    expect(activeChannels).toBe(0);
  });
});
