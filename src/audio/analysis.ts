/** Mean amplitude of FFT bins whose centers fall in the bass range (30–180 Hz). */
export function bassEnergy(
  data: Uint8Array,
  sampleRate: number,
  fftSize: number,
): number {
  if (!data.length || sampleRate <= 0 || fftSize <= 0) return 0;
  const first = Math.max(1, Math.ceil((30 * fftSize) / sampleRate));
  const last = Math.min(
    data.length - 1,
    Math.floor((180 * fftSize) / sampleRate),
  );
  if (last < first) return 0;
  let sum = 0;
  for (let i = first; i <= last; i++) sum += data[i] / 255;
  return sum / (last - first + 1);
}
/** Time-based attack/release smoothing, independent of display refresh rate. */
export function smoothEnergy(
  current: number,
  target: number,
  delta: number,
): number {
  const safeTarget = Math.min(1, Math.max(0, target));
  const tau = safeTarget > current ? 0.055 : 0.22;
  return (
    current + (safeTarget - current) * (1 - Math.exp(-Math.max(0, delta) / tau))
  );
}
