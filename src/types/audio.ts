export type PlaybackStatus =
  "empty" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";
export interface AudioSnapshot {
  status: PlaybackStatus;
  name: string;
  duration: number;
  position: number;
  error: string | null;
}
export interface AudioSignal {
  bass: number;
  sensitivity: number;
}
