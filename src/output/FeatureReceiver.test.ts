import { describe, expect, it, vi } from "vitest";
import { FeatureReceiver } from "./FeatureReceiver";
import { STALE_AFTER_MS, type FeatureMessage } from "./protocol";
const id = "controller-123456789";
const make = (patch: Partial<FeatureMessage> = {}): FeatureMessage => ({
  version: 1,
  type: "features",
  controllerId: id,
  streamId: "stream-1234567890",
  sequence: 1,
  startedAt: 100,
  sentAt: 200,
  bass: 0.8,
  sensitivity: 2,
  playback: "playing",
  scene: "pulse-reactor",
  ...patch,
});
describe("feature synchronization", () => {
  it("smooths the controller's normalized bass without applying sensitivity twice", () => {
    const receiver = new FeatureReceiver(id);
    const notify = vi.fn();
    receiver.subscribe(notify);
    expect(receiver.accept(make(), 200)).toBe(true);
    receiver.step(0.016, 210);
    expect(receiver.signal.bass).toBeGreaterThan(0);
    expect(receiver.signal.bass).toBeLessThan(0.8);
    receiver.step(1, 220);
    expect(receiver.signal.bass).toBeCloseTo(0.8, 5);
    expect(receiver.signal.sensitivity).toBe(2);
    receiver.accept(make({ sequence: 2, sentAt: 230 }), 230);
    expect(notify).toHaveBeenCalledOnce(); // Connection updates, not every feature.
  });
  it.each(["paused", "ready", "ended", "loading", "error", "empty"] as const)(
    "settles into ambient motion on %s",
    (playback) => {
      const receiver = new FeatureReceiver(id);
      receiver.accept(make(), 200);
      receiver.step(1, 200);
      receiver.accept(make({ sequence: 2, sentAt: 250, playback }), 250);
      receiver.step(1, 250);
      expect(receiver.signal.bass).toBeLessThan(0.001);
      expect(receiver.getSnapshot()).toBe("connected");
    },
  );
  it("ignores foreign, out-of-order, duplicate, stale and future frames", () => {
    const receiver = new FeatureReceiver(id);
    expect(receiver.accept(make(), 200)).toBe(true);
    for (const frame of [
      make({ controllerId: "foreign-controller-1", sequence: 2 }),
      make(),
      make({ sequence: 0 }),
      make({ sentAt: 199, sequence: 2 }),
      make({ sentAt: 10000, sequence: 2 }),
    ]) {
      expect(receiver.accept(frame, 200)).toBe(false);
    }
    expect(
      receiver.accept(make({ sequence: 2 }), 200 + STALE_AFTER_MS + 1),
    ).toBe(false);
  });
  it("times out silently crashed controllers, fades bass, and reconnects", () => {
    const receiver = new FeatureReceiver(id);
    receiver.accept(make(), 200);
    receiver.step(1, 200);
    receiver.step(1, 200 + STALE_AFTER_MS + 1);
    expect(receiver.getSnapshot()).toBe("disconnected");
    expect(receiver.signal.bass).toBeLessThan(0.001);
    receiver.accept(make({ sequence: 2, sentAt: 4000 }), 4000);
    expect(receiver.getSnapshot()).toBe("connected");
  });
  it("handles explicit disconnect and ignores late disconnects from a replaced controller", () => {
    const receiver = new FeatureReceiver(id);
    receiver.accept(make(), 200);
    expect(
      receiver.accept(
        { ...make({ sequence: 2, sentAt: 210 }), type: "disconnect" },
        210,
      ),
    ).toBe(true);
    expect(receiver.getSnapshot()).toBe("disconnected");
    const fresh = make({
      streamId: "new-stream-12345678",
      startedAt: 300,
      sentAt: 310,
    });
    receiver.accept(fresh, 310);
    expect(
      receiver.accept(
        { ...make({ sequence: 3, sentAt: 320 }), type: "disconnect" },
        320,
      ),
    ).toBe(false);
    expect(receiver.accept(make({ sequence: 4, sentAt: 330 }), 330)).toBe(
      false,
    );
    expect(receiver.getSnapshot()).toBe("connected");
  });
  it("accepts a newer controller incarnation after refresh and rejects older epochs", () => {
    const receiver = new FeatureReceiver(id);
    receiver.accept(make(), 200);
    expect(
      receiver.accept(
        make({ streamId: "refresh-1234567890", startedAt: 300, sentAt: 300 }),
        300,
      ),
    ).toBe(true);
    expect(
      receiver.accept(
        make({ streamId: "old-stream-1234567", startedAt: 50, sentAt: 310 }),
        310,
      ),
    ).toBe(false);
  });
  it("is frame-rate independent for a constant signal", () => {
    const a = new FeatureReceiver(id);
    const b = new FeatureReceiver(id);
    a.accept(make(), 200);
    b.accept(make(), 200);
    a.step(1 / 60, 200);
    b.step(1 / 120, 200);
    b.step(1 / 120, 200);
    expect(a.signal.bass).toBeCloseTo(b.signal.bass, 10);
  });
});
