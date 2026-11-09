import type { PlaybackStatus } from "../types/audio";

export const PROTOCOL_VERSION = 1;
export const FEATURE_INTERVAL_MS = 25; // 40 Hz while playing
export const IDLE_HEARTBEAT_MS = 500;
export const STALE_AFTER_MS = 3000;
export const CLOCK_TOLERANCE_MS = 1000;
export const isControllerId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(value);
export const channelName = (id: string) => `pulse:visual-output:v1:${id}`;

interface Envelope {
  version: 1;
  controllerId: string;
  sentAt: number;
}
export interface HelloMessage extends Envelope {
  type: "hello";
}
interface ControllerEnvelope extends Envelope {
  streamId: string;
  sequence: number;
  startedAt: number;
}
export interface FeatureMessage extends ControllerEnvelope {
  type: "features";
  bass: number;
  sensitivity: number;
  playback: PlaybackStatus;
  scene: "pulse-reactor";
}
export interface DisconnectMessage extends ControllerEnvelope {
  type: "disconnect";
}
export type OutputMessage = HelloMessage | FeatureMessage | DisconnectMessage;
const playbackStates = new Set([
  "empty",
  "loading",
  "ready",
  "playing",
  "paused",
  "ended",
  "error",
]);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Validate structured-clone input before it can reach shader uniforms. */
export function isOutputMessage(value: unknown): value is OutputMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (
    m.version !== PROTOCOL_VERSION ||
    !isControllerId(m.controllerId) ||
    !finite(m.sentAt) ||
    m.sentAt < 0
  )
    return false;
  if (m.type === "hello") return true;
  if (
    !isControllerId(m.streamId) ||
    !Number.isSafeInteger(m.sequence) ||
    (m.sequence as number) < 0 ||
    !finite(m.startedAt) ||
    m.startedAt < 0 ||
    m.startedAt > m.sentAt
  )
    return false;
  if (m.type === "disconnect") return true;
  return (
    m.type === "features" &&
    m.scene === "pulse-reactor" &&
    finite(m.bass) &&
    m.bass >= 0 &&
    m.bass <= 1 &&
    finite(m.sensitivity) &&
    m.sensitivity >= 0.2 &&
    m.sensitivity <= 2.5 &&
    typeof m.playback === "string" &&
    playbackStates.has(m.playback)
  );
}
export function isFresh(sentAt: number, now: number) {
  return now - sentAt <= STALE_AFTER_MS && sentAt - now <= CLOCK_TOLERANCE_MS;
}
export function outputUrl(href: string, controllerId: string): string {
  const url = new URL(href);
  url.hash = `output=${controllerId}`;
  return url.href;
}
export function outputRoute(hash: string): {
  isOutput: boolean;
  controllerId: string | null;
} {
  const isOutput = hash === "#output" || hash.startsWith("#output=");
  const id = hash.slice("#output=".length);
  return { isOutput, controllerId: isOutput && isControllerId(id) ? id : null };
}
