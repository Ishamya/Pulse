import { useCallback, useEffect, useState } from "react";
export function useOutputFullscreen() {
  const [message, setMessage] = useState<string | null>(null);
  const toggle = useCallback(() => {
    const element = document.documentElement;
    if (!document.fullscreenElement && !element.requestFullscreen) {
      setMessage(
        "Fullscreen is unavailable in this browser. Maximize the output window instead.",
      );
      return;
    }
    const operation = document.fullscreenElement
      ? document.exitFullscreen()
      : element.requestFullscreen();
    void operation
      .then(() => setMessage(null))
      .catch(() =>
        setMessage(
          "Fullscreen was blocked. Double-click the canvas or press F to retry.",
        ),
      );
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "f" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [toggle]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  return { toggle, message };
}
