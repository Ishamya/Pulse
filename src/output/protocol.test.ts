import { describe, expect, it } from "vitest";
import {
  isFresh,
  isOutputMessage,
  outputRoute,
  outputUrl,
  STALE_AFTER_MS,
  type FeatureMessage,
} from "./protocol";
const id = "controller-123456789";
const feature: FeatureMessage = {
  version: 1,
  type: "features",
  controllerId: id,
  streamId: "stream-1234567890",
  startedAt: 100,
  sequence: 1,
  sentAt: 200,
  scene: "pulse-reactor",
  bass: 0.7,
  sensitivity: 1.5,
  playback: "playing",
};
describe("output protocol v1", () => {
  it("validates hello, features and disconnect envelopes", () => {
    expect(isOutputMessage(feature)).toBe(true);
    expect(
      isOutputMessage({
        version: 1,
        type: "hello",
        controllerId: id,
        sentAt: 200,
      }),
    ).toBe(true);
    expect(isOutputMessage({ ...feature, type: "disconnect" })).toBe(true);
  });
  it.each([
    null,
    {},
    { ...feature, version: 2 },
    { ...feature, type: "play" },
    { ...feature, bass: NaN },
    { ...feature, bass: 1.1 },
    { ...feature, bass: -1 },
    { ...feature, sensitivity: 10 },
    { ...feature, playback: "fake" },
    { ...feature, scene: "other" },
    { ...feature, sequence: 1.5 },
    { ...feature, sentAt: Infinity },
    { ...feature, startedAt: 300 },
    { ...feature, controllerId: "bad/path" },
  ])("rejects malformed or unsupported payload %#", (value) => {
    expect(isOutputMessage(value)).toBe(false);
  });
  it("bounds stale and future timestamps", () => {
    expect(isFresh(200, 200 + STALE_AFTER_MS)).toBe(true);
    expect(isFresh(200, 201 + STALE_AFTER_MS)).toBe(false);
    expect(isFresh(2000, 0)).toBe(false);
  });
  it("preserves a Pages subdirectory and query parameters", () => {
    const url = new URL(outputUrl("https://example.com/Pulse/?test=1#old", id));
    expect(url.pathname).toBe("/Pulse/");
    expect(url.search).toBe("?test=1");
    expect(outputRoute(url.hash)).toEqual({ isOutput: true, controllerId: id });
    expect(outputRoute("#output=broken")).toEqual({
      isOutput: true,
      controllerId: null,
    });
    expect(outputRoute("#output").isOutput).toBe(true);
    expect(outputRoute("").isOutput).toBe(false);
  });
});
