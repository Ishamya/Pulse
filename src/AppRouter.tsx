import { useSyncExternalStore } from "react";
import App from "./App";
import { VisualOutput } from "./output/VisualOutput";
import { outputRoute } from "./output/protocol";
const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
export default function AppRouter() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  const route = outputRoute(hash);
  // Output never mounts App/useAudio, so it cannot create an audio engine/context.
  return route.isOutput ? (
    <VisualOutput key={route.controllerId} controllerId={route.controllerId} />
  ) : (
    <App />
  );
}
