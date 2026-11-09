import { useEffect, useState, useSyncExternalStore } from "react";
import { AudioEngine } from "../audio/AudioEngine";
export function useAudio() {
  const [engine] = useState(() => new AudioEngine());
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    const stop = engine.startAnalysis();
    return () => {
      stop();
      engine.dispose();
    };
  }, [engine]);
  return { engine, ...snapshot };
}
