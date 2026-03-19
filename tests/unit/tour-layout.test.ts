import { computeTourLayout } from "../../apps/renderer/app/tourLayout";

describe("tour layout", () => {
  it("docks the card when the keyboard shrinks the viewport", () => {
    const layout = computeTourLayout({
      target: {
        top: 420,
        left: 24,
        width: 280,
        height: 48
      },
      viewport: {
        width: 390,
        height: 500,
        offsetTop: 0,
        offsetLeft: 0,
        keyboardInset: 280
      }
    });

    expect(layout.docked).toBe(true);
    expect(layout.card.left).toBe(12);
    expect(layout.card.width).toBe(366);
    expect(layout.card.top).toBeGreaterThanOrEqual(0);
  });

  it("keeps the card near the target when there is enough room", () => {
    const layout = computeTourLayout({
      target: {
        top: 80,
        left: 200,
        width: 240,
        height: 44
      },
      viewport: {
        width: 1200,
        height: 900,
        offsetTop: 0,
        offsetLeft: 0,
        keyboardInset: 0
      }
    });

    expect(layout.docked).toBe(false);
    expect(layout.card.top).toBeGreaterThan(layout.spotlight.top);
    expect(layout.card.left).toBeGreaterThanOrEqual(12);
  });
});
