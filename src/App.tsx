import { useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  FileAudio,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useAudio } from "./hooks/useAudio";
import { PulseReactor } from "./rendering/PulseReactor";
import { BassMeter } from "./components/BassMeter";
import { formatTime } from "./utils/time";

export default function App() {
  const audio = useAudio();
  const input = useRef<HTMLInputElement>(null);
  const [sensitivity, setSensitivity] = useState(1);
  const canPlay = ["ready", "playing", "paused", "ended"].includes(
    audio.status,
  );
  const playing = audio.status === "playing";
  const status =
    audio.status === "empty"
      ? "AWAITING AUDIO"
      : audio.status === "loading"
        ? "DECODING AUDIO"
        : playing
          ? "SIGNAL ACTIVE"
          : audio.status === "error"
            ? "INPUT ERROR"
            : "SIGNAL STANDBY";
  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="./" aria-label="PULSE home">
          <Activity size={26} strokeWidth={1.7} />
          <span>
            PULSE<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-description">AUDIO / VISUAL INSTRUMENT</span>
        <span className="version">
          <span className="tiny-dot" /> PHASE 01{" "}
          <span className="version-number">v0.1</span>
        </span>
      </header>
      <main>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">YOUR SOUND, IN ANOTHER DIMENSION</div>
            <h1>
              Enter the signal<span>.</span>
            </h1>
          </div>
          <div className="local-note">
            <Headphones size={15} />
            <span>Local audio. Infinite atmosphere.</span>
          </div>
        </div>
        <section
          className="instrument"
          aria-label="Pulse Reactor visual instrument"
        >
          <div className="viewport">
            <div className="viewport-grid" aria-hidden="true" />
            <div className="scene-label">
              <span className="scene-index">01</span>
              <div>
                <h2>Pulse Reactor</h2>
                <p>AUDIO-REACTIVE GEOMETRY</p>
              </div>
            </div>
            <div
              className={`signal-status ${playing ? "active" : ""}`}
              role="status"
            >
              <span className="tiny-dot" />
              {status}
            </div>
            <div
              className="scene"
              aria-label="Animated geometric reactor responding to bass"
            >
              <PulseReactor signal={audio.engine.signal} />
            </div>
            <div className="viewport-bottom">
              <span>
                <span className="crosshair">+</span> REALTIME / WEBGL
              </span>
              <span>
                SCENE 001 <span className="divider">/</span> REACTOR
              </span>
            </div>
            {!audio.name && (
              <div className="scene-hint">
                <span className="hint-line" />
                Bring your own frequency
                <span className="hint-line" />
              </div>
            )}
          </div>
          <div className="control-deck">
            <div className="transport-main">
              <div className="track-icon">
                <FileAudio size={22} strokeWidth={1.4} />
              </div>
              <div className="track-copy">
                <span className="eyebrow">AUDIO SOURCE</span>
                <div className="track-name" title={audio.name || undefined}>
                  {audio.name || "No track loaded"}
                </div>
                <span className="track-detail">
                  {audio.name
                    ? `${audio.status === "loading" ? "Decoding locally" : "LOCAL FILE"}${audio.duration ? ` · ${formatTime(audio.duration)}` : ""}`
                    : "Choose a track to bring the reactor to life"}
                </span>
              </div>
              <input
                ref={input}
                tabIndex={-1}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.aiff"
                className="sr-only"
                aria-label="Choose a local audio file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void audio.engine.load(file);
                  event.target.value = "";
                }}
              />
              <button
                className="upload-button"
                onClick={() => input.current?.click()}
              >
                <Upload size={15} />
                <span>{audio.name ? "Change audio" : "Load audio"}</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="playback-row">
              <div className="playback-buttons">
                <button
                  className="play-button"
                  disabled={!canPlay}
                  onClick={() =>
                    playing ? audio.engine.pause() : void audio.engine.play()
                  }
                  aria-label={
                    playing
                      ? "Pause"
                      : audio.status === "ended"
                        ? "Replay"
                        : "Play"
                  }
                >
                  {playing ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" />
                  )}
                </button>
                <button
                  className="reset-button"
                  disabled={!canPlay}
                  onClick={() => audio.engine.stop()}
                  aria-label="Stop and reset"
                >
                  <RotateCcw size={17} />
                </button>
              </div>
              <span className="time">{formatTime(audio.position)}</span>
              <input
                aria-label="Playback position"
                aria-valuetext={`${formatTime(audio.position)} of ${formatTime(audio.duration)}`}
                type="range"
                min="0"
                max={audio.duration || 1}
                step="0.1"
                value={audio.position}
                disabled={!canPlay}
                onChange={(event) =>
                  audio.engine.seek(Number(event.target.value))
                }
                className="progress-range"
              />
              <span className="time duration">
                {formatTime(audio.duration)}
              </span>
            </div>
            {audio.error && (
              <p className="error-message" role="alert">
                {audio.error}
              </p>
            )}
            <div className="reactivity-row">
              <div className="reactivity-heading">
                <AudioLines size={17} />
                <div>
                  <span className="control-title">Audio reactivity</span>
                  <p>Low frequencies drive the reactor</p>
                </div>
              </div>
              <BassMeter signal={audio.engine.signal} />
              <div className="sensitivity">
                <div className="meter-label">
                  <label htmlFor="sensitivity">SENSITIVITY</label>
                  <output htmlFor="sensitivity">
                    {sensitivity.toFixed(1)}×
                  </output>
                </div>
                <input
                  id="sensitivity"
                  type="range"
                  min="0.2"
                  max="2.5"
                  step="0.1"
                  value={sensitivity}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSensitivity(value);
                    audio.engine.setSensitivity(value);
                  }}
                />
                <div className="meter-scale">
                  <span>SUBTLE</span>
                  <span>INTENSE</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="below-instrument">
          <p>
            <span className="tiny-dot" />
            Your music stays on your device. Always.
          </p>
          <span>MP3, WAV, OGG & other browser-supported audio</span>
        </div>
      </main>
      <footer>
        <span>
          PULSE <span className="footer-slash">/</span> SOUND INTO FORM
        </span>
        <span>Built for the frequencies you feel.</span>
      </footer>
    </div>
  );
}
