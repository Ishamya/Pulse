import { useEffect, useState } from "react";
import type { AudioEngine } from "../audio/AudioEngine";
import { startControllerSession } from "../output/controllerSession";
import { outputUrl } from "../output/protocol";

export function useControllerOutput(engine: AudioEngine) {
  const [controllerId, setControllerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      startControllerSession(engine, setControllerId, () =>
        setError(
          "Visual output requires BroadcastChannel and permission to communicate between tabs.",
        ),
      ),
    [engine],
  );
  const openOutput = () => {
    if (!controllerId) return;
    // Synchronous within the click handler, before any await, for popup policies.
    const output = window.open(
      outputUrl(window.location.href, controllerId),
      "_blank",
    );
    if (!output) {
      setError(
        "The visual output was blocked. Allow popups for PULSE and try again.",
      );
      return;
    }
    output.opener = null;
    setError(null);
  };
  return { ready: controllerId !== null, error, openOutput };
}
