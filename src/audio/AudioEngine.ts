import type { AudioSignal, AudioSnapshot } from "../types/audio";
import { bassEnergy, smoothEnergy } from "./analysis";

const initial: AudioSnapshot = {
  status: "empty",
  name: "",
  duration: 0,
  position: 0,
  error: null,
};

/** Owns all audio resources. No rendering dependencies or per-frame React updates. */
export class AudioEngine {
  readonly signal: AudioSignal = { bass: 0, sensitivity: 1 };
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private snapshot: AudioSnapshot = { ...initial };
  private listeners = new Set<() => void>();
  private offset = 0;
  private startedAt = 0;
  private generation = 0;
  private playbackGeneration = 0;
  private wantsPlayback = false;
  private analysisTimer?: ReturnType<typeof setInterval>;
  private lastFrame = 0;
  private lastPublish = 0;

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<AudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private ensureContext() {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.35;
      this.analyser.connect(this.context.destination);
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return this.context;
  }
  private disconnectSource() {
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = undefined;
    }
  }
  private getPosition() {
    return Math.min(
      this.snapshot.duration,
      this.offset +
        (this.snapshot.status === "playing" && this.context
          ? this.context.currentTime - this.startedAt
          : 0),
    );
  }
  setSensitivity(value: number) {
    this.signal.sensitivity = Math.min(2.5, Math.max(0.2, value));
  }
  async load(file: File) {
    const generation = ++this.generation;
    ++this.playbackGeneration;
    this.wantsPlayback = false;
    this.disconnectSource();
    this.buffer = undefined;
    this.offset = 0;
    this.signal.bass = 0;
    this.update({
      status: "loading",
      name: file.name,
      duration: 0,
      position: 0,
      error: null,
    });
    try {
      // Decoding expands compressed audio in memory; keep accidental huge files bounded.
      if (file.size > 150 * 1024 * 1024)
        throw new Error("Choose a file smaller than 150 MB.");
      if (!file.size)
        throw new Error("This file is empty. Choose an audio file.");
      const context = this.ensureContext();
      const data = await file.arrayBuffer();
      if (generation !== this.generation) return;
      const buffer = await context.decodeAudioData(data);
      if (generation !== this.generation) return;
      this.buffer = buffer;
      this.update({ status: "ready", duration: buffer.duration });
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({
        status: "error",
        error:
          error instanceof Error && /150 MB|empty/.test(error.message)
            ? error.message
            : "This audio could not be decoded. Try a browser-supported MP3, WAV, M4A, or OGG file.",
      });
    }
  }
  async play() {
    if (!this.buffer || this.snapshot.status === "playing") return;
    this.wantsPlayback = true;
    const generation = this.generation;
    const playbackGeneration = ++this.playbackGeneration;
    try {
      const context = this.ensureContext();
      await context.resume(); // Called directly from the user's Play gesture.
      if (
        generation !== this.generation ||
        playbackGeneration !== this.playbackGeneration ||
        !this.buffer
      )
        return;
      if (context.state !== "running") throw new Error("Audio is blocked");
      if (this.offset >= this.buffer.duration) this.offset = 0;
      this.disconnectSource();
      const source = context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(this.analyser!);
      this.source = source;
      this.startedAt = context.currentTime;
      source.onended = () => {
        if (this.source !== source) return;
        source.disconnect();
        this.source = undefined;
        this.offset = this.snapshot.duration;
        this.wantsPlayback = false;
        this.signal.bass = 0;
        this.update({ status: "ended", position: this.offset });
      };
      source.start(0, this.offset);
      this.update({ status: "playing", error: null });
    } catch {
      if (
        generation === this.generation &&
        playbackGeneration === this.playbackGeneration
      ) {
        this.wantsPlayback = false;
        this.update({
          status: "paused",
          error:
            "Playback was blocked or interrupted. Press Play to try again.",
        });
      }
    }
  }
  pause() {
    this.wantsPlayback = false;
    ++this.playbackGeneration;
    if (this.snapshot.status !== "playing") return;
    this.offset = this.getPosition();
    this.disconnectSource();
    this.signal.bass = 0;
    this.update({ status: "paused", position: this.offset });
  }
  stop() {
    this.wantsPlayback = false;
    ++this.playbackGeneration;
    if (!this.buffer) return;
    this.disconnectSource();
    this.offset = 0;
    this.signal.bass = 0;
    this.update({ status: "ready", position: 0, error: null });
  }
  seek(position: number) {
    ++this.playbackGeneration;
    if (!this.buffer) return;
    const playing = this.wantsPlayback;
    this.disconnectSource();
    this.offset = Math.max(0, Math.min(this.buffer.duration, position));
    this.signal.bass = 0;
    if (this.offset >= this.buffer.duration) {
      this.wantsPlayback = false;
      this.update({ status: "ended", position: this.offset });
      return;
    }
    this.update({ status: "paused", position: this.offset });
    if (playing) void this.play();
  }
  startAnalysis() {
    clearInterval(this.analysisTimer);
    this.lastFrame = performance.now();
    const tick = () => {
      const now = performance.now();
      const delta = Math.min((now - this.lastFrame) / 1000, 0.1);
      this.lastFrame = now;
      let target = 0;
      if (
        this.snapshot.status === "playing" &&
        this.context?.state === "running" &&
        this.analyser &&
        this.bins
      ) {
        this.analyser.getByteFrequencyData(this.bins);
        target =
          bassEnergy(
            this.bins,
            this.context.sampleRate,
            this.analyser.fftSize,
          ) * this.signal.sensitivity;
      }
      this.signal.bass = smoothEnergy(this.signal.bass, target, delta);
      if (now - this.lastPublish >= 100 && this.snapshot.status === "playing") {
        this.lastPublish = now;
        this.update({ position: this.getPosition() });
      }
    };
    // Separate from rendering: an output on another monitor still needs features
    // when the controller has no visible canvas. Browsers may throttle timers.
    const timer = setInterval(tick, 25);
    this.analysisTimer = timer;
    return () => {
      clearInterval(timer);
    };
  }
  dispose() {
    this.wantsPlayback = false;
    ++this.playbackGeneration;
    ++this.generation;
    clearInterval(this.analysisTimer);
    this.disconnectSource();
    this.analyser?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.buffer = undefined;
    this.signal.bass = 0;
  }
}
