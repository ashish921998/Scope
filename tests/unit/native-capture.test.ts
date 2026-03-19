import { describe, expect, it } from "vitest";
import { parseNativeCaptureEvent } from "../../apps/desktop/src/audio/nativeCapture";

describe("native capture event parsing", () => {
  it("returns null for empty lines", () => {
    expect(parseNativeCaptureEvent("   ")).toBeNull();
  });

  it("parses ready events", () => {
    const event = parseNativeCaptureEvent('{"type":"ready","sampleRateHz":24000,"sources":["mic","system"]}');
    expect(event).toEqual({
      type: "ready",
      sampleRateHz: 24000,
      sources: ["mic", "system"]
    });
  });

  it("parses chunk events with source identity", () => {
    const event = parseNativeCaptureEvent('{"type":"chunk","source":"mic","audioBase64":"AQID","frames":12,"timestampMs":99}');
    expect(event).toEqual({
      type: "chunk",
      source: "mic",
      audioBase64: "AQID",
      frames: 12,
      timestampMs: 99
    });
  });

  it("parses warning events", () => {
    expect(parseNativeCaptureEvent('{"type":"warning","code":"warn","message":"heads up"}')).toEqual({
      type: "warning",
      code: "warn",
      message: "heads up"
    });
  });

  it("parses fatal events", () => {
    expect(parseNativeCaptureEvent('{"type":"fatal","code":"fatal","message":"boom"}')).toEqual({
      type: "fatal",
      code: "fatal",
      message: "boom"
    });
  });

  it("parses stopped events", () => {
    expect(parseNativeCaptureEvent('{"type":"stopped"}')).toEqual({ type: "stopped" });
  });

  it("rejects invalid chunk sources", () => {
    expect(() =>
      parseNativeCaptureEvent('{"type":"chunk","source":"mixed","audioBase64":"AQID","frames":12,"timestampMs":99}')
    ).toThrow("valid source");
  });

  it("rejects unknown event types", () => {
    expect(() => parseNativeCaptureEvent('{"type":"unknown"}')).toThrow("Unknown native capture event");
  });

  it("rejects malformed json", () => {
    expect(() => parseNativeCaptureEvent("{not-json")).toThrow();
  });
});
