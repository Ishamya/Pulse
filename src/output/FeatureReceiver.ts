import type { AudioSignal } from "../types/audio";
import { isFresh, isOutputMessage, STALE_AFTER_MS } from "./protocol";

/** Pure receiver state; no audio resources and no React updates per feature. */
export class FeatureReceiver {
  readonly signal: AudioSignal = { bass: 0, sensitivity: 1 };
  private connected = false;
  private failure: string | null = null;
  private streamId = "";
  private startedAt = -1;
  private sequence = -1;
  private sentAt = -1;
  private targetBass = 0;
  private retired = new Set<string>();
  private listeners = new Set<() => void>();
  constructor(readonly controllerId: string) {}
  getSnapshot = () =>
    this.failure ?? (this.connected ? "connected" : "disconnected");
  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => {
      this.listeners.delete(notify);
    };
  };
  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    this.listeners.forEach((notify) => notify());
  }
  accept(value: unknown, now = Date.now()): boolean {
    if (
      !isOutputMessage(value) ||
      value.controllerId !== this.controllerId ||
      value.type === "hello" ||
      !isFresh(value.sentAt, now)
    )
      return false;
    this.checkStale(now);
    if (value.type === "disconnect") {
      if (
        value.streamId !== this.streamId ||
        value.sequence <= this.sequence ||
        value.sentAt < this.sentAt
      )
        return false;
      this.sequence = value.sequence;
      this.sentAt = value.sentAt;
      this.targetBass = 0;
      this.setConnected(false);
      return true;
    }
    if (this.retired.has(value.streamId)) return false;
    if (value.streamId !== this.streamId) {
      // A newer controller incarnation may reconnect after a refresh. Old queued
      // frames can never switch us back to a retired incarnation.
      if (
        value.startedAt < this.startedAt ||
        (this.connected && value.startedAt === this.startedAt)
      )
        return false;
      if (this.streamId) this.retired.add(this.streamId);
      this.streamId = value.streamId;
      this.startedAt = value.startedAt;
      this.sequence = -1;
      this.sentAt = -1;
    }
    if (value.sequence <= this.sequence || value.sentAt < this.sentAt)
      return false;
    this.sequence = value.sequence;
    this.sentAt = value.sentAt;
    this.signal.sensitivity = value.sensitivity;
    // Bass is already sensitivity-adjusted in the authoritative audio engine.
    this.targetBass = value.playback === "playing" ? value.bass : 0;
    this.setConnected(true);
    return true;
  }
  checkStale(now = Date.now()) {
    if (now - this.sentAt > STALE_AFTER_MS) {
      this.targetBass = 0;
      this.setConnected(false);
    }
  }
  step(deltaSeconds: number, now = Date.now()) {
    this.checkStale(now);
    const tau = this.targetBass > this.signal.bass ? 0.04 : 0.12;
    this.signal.bass +=
      (this.targetBass - this.signal.bass) *
      (1 - Math.exp(-Math.max(0, deltaSeconds) / tau));
  }
  fail(message: string) {
    this.failure = message;
    this.targetBass = 0;
    this.connected = false;
    this.listeners.forEach((notify) => notify());
  }
  reset() {
    this.targetBass = 0;
    this.signal.bass = 0;
    this.setConnected(false);
  }
}
