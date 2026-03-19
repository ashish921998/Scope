import { describe, expect, it } from "vitest";
import { parseNativeCaptureEvent } from "../../apps/desktop/src/audio/nativeCapture";

describe("native capture event parsing", () => {
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

  it("rejects invalid chunk sources", () => {
    expect(() =>
      parseNativeCaptureEvent('{"type":"chunk","source":"mixed","audioBase64":"AQID","frames":12,"timestampMs":99}')
    ).toThrow("valid source");
  });
});
