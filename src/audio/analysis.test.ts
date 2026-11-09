import { describe, expect, it } from "vitest";
import { bassEnergy, smoothEnergy } from "./analysis";
import { formatTime } from "../utils/time";

describe("bassEnergy", () => {
  it("returns zero for silence and unusable frequency ranges", () => {
    expect(bassEnergy(new Uint8Array(1024), 48000, 2048)).toBe(0);
    expect(bassEnergy(new Uint8Array(), 48000, 2048)).toBe(0);
    expect(bassEnergy(new Uint8Array(2), 48000, 2048)).toBe(0);
    expect(bassEnergy(new Uint8Array(1024), 0, 2048)).toBe(0);
  });
  it("normalizes only bass bins and excludes DC and high frequencies", () => {
    const bins = new Uint8Array(1024);
    bins[0] = 255;
    bins[400] = 255;
    expect(bassEnergy(bins, 48000, 2048)).toBe(0);
    bins.fill(255, 2, 8); // 46.875 through 164.0625 Hz
    expect(bassEnergy(bins, 48000, 2048)).toBe(1);
    bins[2] = 0;
    expect(bassEnergy(bins, 48000, 2048)).toBeCloseTo(5 / 6);
  });
  it("uses sample rate to select bins", () => {
    const bins = new Uint8Array(1024);
    bins.fill(255, 3, 16); // 32.3 through 161.5 Hz at 22050 Hz
    expect(bassEnergy(bins, 22050, 2048)).toBeGreaterThan(0.9);
  });
});
describe("smoothing", () => {
  it("has a faster attack than release and stays bounded", () => {
    expect(smoothEnergy(0, 1, 0.05)).toBeGreaterThan(
      1 - smoothEnergy(1, 0, 0.05),
    );
    expect(smoothEnergy(0, 3, 1)).toBeLessThanOrEqual(1);
    expect(smoothEnergy(0, 1, -1)).toBe(0);
    expect(smoothEnergy(0, 0, 1)).toBe(0);
  });
  it("is invariant to frame rate for a constant target", () => {
    const half = smoothEnergy(0, 1, 1 / 120);
    expect(smoothEnergy(half, 1, 1 / 120)).toBeCloseTo(
      smoothEnergy(0, 1, 1 / 60),
      10,
    );
  });
  it("decays toward silence", () => {
    expect(smoothEnergy(0.9, 0, 2)).toBeLessThan(0.001);
  });
});
it("formats transport timestamps without invalid values", () => {
  expect(formatTime(125.9)).toBe("2:05");
  expect(formatTime(-1)).toBe("0:00");
  expect(formatTime(NaN)).toBe("0:00");
});
