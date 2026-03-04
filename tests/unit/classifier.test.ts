import { classifySignal } from "../../packages/core/src/signals/classifier";

describe("signal classifier", () => {
  it("classifies explicit bug language as bug with high confidence", () => {
    const result = classifySignal("The app crashes with an exception every time we save a report");
    expect(result.type).toBe("bug");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("classifies analytics language as analytics insight", () => {
    const result = classifySignal("Our funnel conversion drops 30% after activation");
    expect(result.type).toBe("analytics_insight");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
