# PULSE

A browser-based audio-reactive visual instrument for progressive house, melodic techno, and the frequencies in between. Phase 1 establishes a real local audio pipeline and **Pulse Reactor**, a GPU-rendered geometric scene. No backend, account, API keys, or audio uploads.

## Run locally

Requires Node.js 22.12+, 24 LTS, or 26+ and npm (Vitest 5 does not support Node 20 or odd-numbered Node 23/25 releases).

```sh
cd ~/Projects/Pulse
npm install
npm run dev
```

Open the Local URL printed by Vite. Select **Load audio**, choose a file, then press **Play**. Playback starts only from a user gesture. Use Pause to hold your position, Stop/reset to return to the beginning, or the timeline to seek. Sensitivity changes how strongly bass drives the reactor; it does not change listening volume. Use your device's volume controls for listening level.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

## Phase 1

- Responsive dark performance interface with violet/cyan accents.
- Local audio decoding with Web Audio; play, pause/resume, replay, stop/reset, seeking, track name, and elapsed/duration display.
- Decode and playback errors, oversized/empty-file checks, stale file-load cancellation, and resource cleanup.
- AnalyserNode FFT with normalized 30–180 Hz amplitude and time-based attack/release smoothing.
- Pulse Reactor: animated wire geometry, shader displacement, concentric orbital structures, and scale/intensity driven by bass.
- Bass energy indicator and sensitivity control, with no per-frame React state changes.
- Capped device pixel ratio (1.75), no post-processing, and rendering suspended while the page is hidden. Audio continues in the background when the browser permits it.
- WebGL fallback messaging that leaves audio controls accessible.
- Utility and audio lifecycle tests, including file replacement and pending playback cancellation.

## Separate visual output — Phase 1.1

Click **Open Visual Output** in the controller's visualization controls. Allow popups for PULSE if the browser blocks it. The new tab contains only Pulse Reactor; audio, file access, playback, and analysis stay exclusively in the controller. Drag the output tab into a separate window to move it to another monitor. In the output, **double-click the canvas** or press **F** to toggle fullscreen; **Escape** exits fullscreen. Fullscreen is never requested automatically.

The `#output=<controller-id>` route preserves the current pathname (including `/Pulse/`) and query parameters, so refreshes work on static GitHub Pages hosting. Even an invalid output link renders a safe idle output rather than mounting the audio controller.

Each controller publishes to `pulse:visual-output:v1:<controller-id>`. The versioned protocol has `hello`, `features`, and `disconnect` messages with wall-clock timestamps. Controller messages include an instance identifier, start timestamp, and increasing sequence number. Features contain only normalized bass, sensitivity, playback state, and the `pulse-reactor` scene identifier. No audio samples, FFT arrays, files, track names, or playback commands cross the channel. Sensitivity is already applied by AudioEngine and is not applied twice in the output.

Feature updates are capped at 40 Hz during playback, with 500 ms idle heartbeats. Outputs send a hello every second to recover after refresh. Receivers validate payloads, reject stale/future, duplicate, out-of-order, foreign-controller, and retired-instance messages, and interpolate bass using time-based smoothing. After three seconds without fresh features, or an explicit controller disconnect, bass fades to zero and a subtle disconnected indicator appears. Ambient scene motion continues. Animation phase is local to each renderer; this is feature synchronization, not frame-locked video output.

Web Locks give one publisher exclusive ownership of a controller identity. Session storage retains that identity across controller reloads; a short lock-acquisition grace period handles navigation/React StrictMode cleanup. Duplicated tabs with copied session storage get separate identities and channels. Channels, locks, timers, and receiver animation callbacks are cleaned up on unmount. Output reloads never create an AudioEngine or AudioContext. A controller reload requires reselecting the local audio file, as in Phase 1.

BroadcastChannel requires both tabs to use the same origin/browser storage partition. Use localhost or HTTPS. Browsers without BroadcastChannel show an unavailable message. Without Web Locks, each controller uses a unique temporary identity for isolation; reopening the output is then necessary after a controller reload. Blocked session storage also prevents retaining the output association across reloads.

Analysis uses a 40 Hz controller timer independently of the controller canvas; hiding the controller does not deliberately stop analysis. Browsers/OS power policies can still throttle or suspend background timers/audio, which can reduce feature cadence or trigger safe idle. Keep the controller visible in a second window for live performance. Physical external-monitor movement, OS display scaling, long-running background behavior, and browser-specific fullscreen permissions require manual checks.

Manual acceptance:

1. Run `npm run dev`, load a bass-heavy local track, and open the visual output. Confirm there is sound only from the controller and no header/player/controls in the output.
2. Play, pause, resume, seek, reset, and change sensitivity in the controller. Confirm the output follows bass changes and settles to ambient motion when paused/stopped.
3. Press F or double-click the output canvas, exit with Escape, then resize/move it to an external monitor. Confirm the canvas fills the viewport.
4. Reload the output; it should reconnect without audio. Reload the controller; the output should reconnect to an idle controller, then respond after a file is loaded again.
5. Close the controller; the output should fade to idle and show the disconnected indicator within three seconds. Close/reopen output tabs repeatedly and confirm the controller still works.
6. Open an independent or duplicated controller tab; it should control only its own outputs. Check the browser console for errors.

Phase 1.1 verification: TypeScript, ESLint, all 54 unit tests, and the production build pass. Headless Chrome with software WebGL verified output opening/closing, shader bass synchronization using a synthetic local WAV, sensitivity, pause/resume/reset, fullscreen gestures, viewport resizing, output/controller refresh, duplicated-controller isolation, and disconnect/reconnect. The same acceptance checks passed against the built app served under `/Pulse/`, with no console errors. These checks do not establish hardware FPS, physical multi-monitor behavior, or cross-browser compatibility. The existing large-bundle build warning remains.

## Stack and structure

React 19, TypeScript, Vite, Tailwind CSS 4, Three.js, React Three Fiber, Web Audio API, and Lucide icons. ESLint and Vitest provide static checks and tests. A targeted npm override upgrades minimatch 7–10 to patched 11.0.1+ for the development lint toolchain; retain it until upstream dependencies adopt the fix.

```text
src/
  audio/        AudioEngine, FFT utilities, and tests
  rendering/    Pulse Reactor and WebGL fallback
  output/       Channel protocol, controller ownership, receiver, output view, tests
  components/   Bass energy meter
  hooks/        Audio ownership and document visibility
  types/        Audio state and signal contracts
  utils/        Transport time formatting
  App.tsx       Functional instrument interface
  styles.css    Tailwind entry and visual system
```

AudioEngine owns the AudioContext, decoded buffer, source, analyser, and analysis loop. A subscription publishes transport snapshots at roughly 10 Hz during playback. High-frequency bass data lives in a shared signal read directly by the renderer and meter. Buffer sources are replaced when resuming/seeking and disconnected on stop/replacement. Unmount closes the audio context. Files are decoded directly from ArrayBuffers; no object URLs are created.

## Audio limitations

Codec/container support depends on the browser and OS. MP3 and WAV are good starting points; M4A/AAC, OGG, FLAC, and AIFF support varies. Unsupported or corrupt files display a recoverable error. File extensions alone do not guarantee decoding.

Files are fully decoded in memory. There is a 150 MB compressed-file limit, but long, highly compressed tracks can still consume substantial RAM; start with shorter tracks. Files are never sent over the network. Selecting a new file stops the current track. There is no bundled demo music, microphone/system input, streaming source, advanced beat detector, or BPM estimation.

The bass value measures average FFT amplitude, not calibrated loudness or beats. Quiet masters may need higher sensitivity. Paused/stopped audio resets the signal; ambient scene motion continues. Background audio may be suspended by browser/OS power policies. WebGL and hardware acceleration are needed for the visualization. No measured FPS claim is made; performance depends on the device.

## Accessibility and verification

Transport buttons and ranges have accessible labels, visible keyboard focus, disabled states, and browser-native keyboard interactions. Errors are announced through an alert; transport status uses a polite status region. The decorative scene uses slow continuous motion without intentional strobes. The reduced-motion OS preference disables ambient rotation/distortion animation and attenuates user-initiated audio reactions.

Automated audio lifecycle tests use a mock AudioContext. They verify application logic, not actual device output or browser codec implementations. Manual acceptance should include:

1. Load a supported track; Play, Pause, resume, seek, reset, and replay after the end.
2. Compare silence against a bass-heavy section and adjust sensitivity.
3. Replace a track while playing/decoding and try an unsupported file.
4. Check keyboard controls, mobile width, tab hiding/restoring, and WebGL fallback.
5. Check the browser console and listen for unexpected playback artifacts.

## GitHub Pages intention

The production output is `dist/`. Vite uses `base: './'` so emitted assets resolve relative to a Pages project subdirectory. There is no client-side router requiring server rewrites and no runtime backend. A future approved phase can add GitHub Actions deployment. No repository, commit, push, or deployment is part of Phase 1.

## Planned future phases (not implemented)

Recommended Phase 2: browser/device acceptance testing and performance profiling, clearer signal calibration, and measured rendering/bundle optimizations. Later approved phases may introduce additional scenes, advanced frequency/beat analysis, live audio inputs, and performance presets. Keep each phase independently reviewed before expanding scope.
