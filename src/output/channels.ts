import type { AudioSignal, AudioSnapshot } from "../types/audio";
import { FeatureReceiver } from "./FeatureReceiver";
import {
  channelName,
  FEATURE_INTERVAL_MS,
  IDLE_HEARTBEAT_MS,
  isFresh,
  isOutputMessage,
  PROTOCOL_VERSION,
  type OutputMessage,
} from "./protocol";

export interface ChannelPort {
  postMessage(message: OutputMessage): void;
  close(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}
export type ChannelFactory = (name: string) => ChannelPort;
const createChannel: ChannelFactory = (name) => new BroadcastChannel(name);
interface FeatureSource {
  readonly signal: AudioSignal;
  getSnapshot(): AudioSnapshot;
}

export class ControllerChannel {
  private channel: ChannelPort;
  private timer: ReturnType<typeof setInterval>;
  private sequence = 0;
  private streamId = crypto.randomUUID();
  private startedAt: number;
  private lastSentAt = -Infinity;
  private lastState = "";
  private closed = false;
  private suspended = false;
  constructor(
    readonly controllerId: string,
    private source: FeatureSource,
    factory = createChannel,
    private now = Date.now,
  ) {
    this.startedAt = now();
    this.channel = factory(channelName(controllerId));
    this.channel.onmessage = ({ data }) => {
      if (
        isOutputMessage(data) &&
        data.controllerId === controllerId &&
        data.type === "hello" &&
        isFresh(data.sentAt, this.now())
      )
        this.publish(true);
    };
    this.publish(true);
    this.timer = setInterval(() => this.publish(), FEATURE_INTERVAL_MS);
  }
  private envelope() {
    return {
      version: PROTOCOL_VERSION,
      controllerId: this.controllerId,
      streamId: this.streamId,
      sequence: ++this.sequence,
      startedAt: this.startedAt,
      sentAt: this.now(),
    } as const;
  }
  private publish(force = false) {
    if (this.closed || this.suspended) return;
    const playback = this.source.getSnapshot().status;
    const sensitivity = this.source.signal.sensitivity;
    const state = `${playback}:${sensitivity}`;
    const now = this.now();
    if (
      !force &&
      playback !== "playing" &&
      state === this.lastState &&
      now - this.lastSentAt < IDLE_HEARTBEAT_MS
    )
      return;
    // Hello replies are also rate limited; the next scheduled tick/heartbeat will reply.
    if (now - this.lastSentAt < FEATURE_INTERVAL_MS) return;
    this.lastState = state;
    this.lastSentAt = now;
    this.channel.postMessage({
      ...this.envelope(),
      type: "features",
      scene: "pulse-reactor",
      playback,
      sensitivity,
      bass:
        playback === "playing"
          ? Math.min(1, Math.max(0, this.source.signal.bass))
          : 0,
    });
  }
  suspend = () => {
    this.disconnect();
    this.suspended = true;
  };
  resume = () => {
    this.suspended = false;
    this.lastSentAt = -Infinity;
    this.publish(true);
  };
  disconnect = () => {
    if (!this.closed)
      this.channel.postMessage({ ...this.envelope(), type: "disconnect" });
  };
  dispose() {
    if (this.closed) return;
    this.disconnect();
    this.closed = true;
    clearInterval(this.timer);
    this.channel.onmessage = null;
    this.channel.close();
  }
}

export function connectOutput(
  receiver: FeatureReceiver,
  factory = createChannel,
) {
  const channel = factory(channelName(receiver.controllerId));
  channel.onmessage = ({ data }) => {
    receiver.accept(data);
  };
  const hello = () => {
    receiver.checkStale();
    channel.postMessage({
      version: PROTOCOL_VERSION,
      type: "hello",
      controllerId: receiver.controllerId,
      sentAt: Date.now(),
    });
  };
  hello();
  const heartbeat = setInterval(hello, 1000);
  let frame = 0;
  let last = performance.now();
  const tick = (now: number) => {
    receiver.step(Math.min((now - last) / 1000, 0.25));
    last = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    clearInterval(heartbeat);
    cancelAnimationFrame(frame);
    channel.onmessage = null;
    channel.close();
    receiver.reset();
  };
}
