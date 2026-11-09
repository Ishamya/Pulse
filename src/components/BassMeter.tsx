import { useEffect, useRef } from "react";
import type { AudioSignal } from "../types/audio";
export function BassMeter({ signal }: { signal: AudioSignal }) {
  const fill = useRef<HTMLDivElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const update = (now: number) => {
      if (now - last > 60) {
        if (fill.current)
          fill.current.style.transform = `scaleX(${signal.bass})`;
        if (value.current)
          value.current.textContent = `${Math.round(signal.bass * 100)}%`;
        last = now;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [signal]);
  return (
    <div className="bass-meter" aria-label="Live bass energy">
      <div className="meter-label">
        <span>BASS ENERGY</span>
        <span ref={value} aria-hidden="true">
          0%
        </span>
      </div>
      <div className="meter-track">
        <div ref={fill} className="meter-fill" />
      </div>
      <div className="meter-scale">
        <span>30 Hz</span>
        <span>180 Hz</span>
      </div>
    </div>
  );
}
