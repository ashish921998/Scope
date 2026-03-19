"use client";

import type { TourViewport } from "../app/tourLayout";

type TourTargetId = "interviewStart" | "supportEmail" | "supportNotes" | "supportSend";

const TOUR_STEPS: Array<{
  id: TourTargetId;
  title: string;
  body: string;
}> = [
  {
    id: "interviewStart",
    title: "Start the working session",
    body: "Kick off the interview first. The guide keeps the call-to-action visible even on narrow mobile screens."
  },
  {
    id: "supportEmail",
    title: "Focus an input without losing the guide",
    body: "Tap this email field on a real phone. The tour card re-docks against the visible viewport when the keyboard opens."
  },
  {
    id: "supportNotes",
    title: "Textareas stay reachable",
    body: "This notes field is the failure case on many mobile overlays. The target is auto-scrolled into view with extra keyboard-safe margin."
  },
  {
    id: "supportSend",
    title: "Finish from the action row",
    body: "Primary actions remain above the keyboard, and the guide never traps taps away from the highlighted control."
  }
];

export interface TourLayoutResult {
  spotlight: { top: number; left: number; width: number; height: number };
  card: { top: number; left: number; width: number; height: number };
  docked: boolean;
}

export interface GuidedTourProps {
  activeTourIndex: number | null;
  tourLayout: TourLayoutResult | null;
  viewportState: TourViewport;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export { TOUR_STEPS };
export type { TourTargetId };

export function GuidedTour({
  activeTourIndex,
  tourLayout,
  viewportState,
  onNext,
  onPrevious,
  onClose
}: GuidedTourProps) {
  if (activeTourIndex === null || !tourLayout) {
    return null;
  }

  return (
    <div className="tour-layer" aria-live="polite">
      <div className="tour-veil" />
      <div
        className="tour-spotlight"
        style={{
          top: tourLayout.spotlight.top,
          left: tourLayout.spotlight.left,
          width: tourLayout.spotlight.width,
          height: tourLayout.spotlight.height
        }}
      />
      <aside
        className={`tour-card ${tourLayout.docked ? "is-docked" : ""}`}
        style={{
          top: tourLayout.card.top,
          left: tourLayout.card.left,
          width: tourLayout.card.width,
          minHeight: tourLayout.card.height
        }}
      >
        <span className="tour-kicker">
          Guided Tour {activeTourIndex + 1}/{TOUR_STEPS.length}
        </span>
        <h3>{TOUR_STEPS[activeTourIndex].title}</h3>
        <p>{TOUR_STEPS[activeTourIndex].body}</p>
        <div className="tour-metrics">
          <span>Viewport {Math.round(viewportState.width)}x{Math.round(viewportState.height)}</span>
          <span>{viewportState.keyboardInset > 80 ? "Keyboard detected" : "Keyboard hidden"}</span>
        </div>
        <div className="tour-actions">
          <button className="secondary" onClick={onPrevious} disabled={activeTourIndex === 0}>
            Back
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button onClick={onNext}>
            {activeTourIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </aside>
    </div>
  );
}
