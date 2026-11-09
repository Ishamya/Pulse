import { useEffect, useState, useSyncExternalStore } from "react";
import { PulseReactor } from "../rendering/PulseReactor";
import { useOutputFullscreen } from "../hooks/useOutputFullscreen";
import { FeatureReceiver } from "./FeatureReceiver";
import { connectOutput } from "./channels";

export function VisualOutput({
  controllerId,
}: {
  controllerId: string | null;
}) {
  const [receiver] = useState(
    () => new FeatureReceiver(controllerId ?? "invalid"),
  );
  const connection = useSyncExternalStore(
    receiver.subscribe,
    receiver.getSnapshot,
  );
  const fullscreen = useOutputFullscreen();
  useEffect(() => {
    const oldTitle = document.title;
    document.title = "PULSE — Visual Output";
    let disconnect: (() => void) | undefined;
    if (controllerId && typeof BroadcastChannel !== "undefined") {
      try {
        disconnect = connectOutput(receiver);
      } catch {
        receiver.fail("Visual output could not connect to the controller.");
      }
    }
    return () => {
      disconnect?.();
      document.title = oldTitle;
    };
  }, [controllerId, receiver]);
  const status = !controllerId
    ? "Invalid output link. Open Visual Output from the controller."
    : typeof BroadcastChannel === "undefined"
      ? "Visual output is unavailable in this browser."
      : connection === "connected"
        ? null
        : connection === "disconnected"
          ? "Controller disconnected · waiting for signal"
          : connection;
  return (
    <main
      className="visual-output"
      onDoubleClick={fullscreen.toggle}
      aria-label="Pulse Reactor visual output. Double-click or press F for fullscreen."
    >
      <PulseReactor signal={receiver.signal} outputOnly />
      {(status || fullscreen.message) && (
        <div className="output-status" role="status">
          {fullscreen.message ?? status}
        </div>
      )}
    </main>
  );
}
