"use client";

import { useEffect, useRef, useState } from "react";
import { computeTourLayout, type TourRect, type TourViewport } from "./tourLayout";
import { InterviewCard } from "../components/InterviewCard";
import { SupportCard } from "../components/SupportCard";
import { IntegrationsCard } from "../components/IntegrationsCard";
import { SignalStreamCard } from "../components/SignalStreamCard";
import { DossierCard } from "../components/DossierCard";
import { GuidedTour, TOUR_STEPS } from "../components/GuidedTour";
import type { TourTargetId } from "../components/GuidedTour";

const getViewportState = (): TourViewport => {
  if (typeof window === "undefined") {
    return {
      width: 0,
      height: 0,
      offsetTop: 0,
      offsetLeft: 0,
      keyboardInset: 0
    };
  }

  const visualViewport = window.visualViewport;
  const width = visualViewport?.width ?? window.innerWidth;
  const height = visualViewport?.height ?? window.innerHeight;
  const offsetTop = visualViewport?.offsetTop ?? 0;
  const offsetLeft = visualViewport?.offsetLeft ?? 0;
  const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);

  return {
    width,
    height,
    offsetTop,
    offsetLeft,
    keyboardInset
  };
};

const toTourRect = (element: HTMLElement): TourRect => {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
};

export default function Home() {
  const [activeTourIndex, setActiveTourIndex] = useState<number | null>(0);
  const [tourLayout, setTourLayout] = useState<ReturnType<typeof computeTourLayout> | null>(null);
  const [viewportState, setViewportState] = useState<TourViewport>(getViewportState);
  const [featureId, setFeatureId] = useState("");
  const [output, setOutput] = useState("Ready.");
  const tourRefs = useRef<Record<TourTargetId, HTMLElement | null>>({
    interviewStart: null,
    supportEmail: null,
    supportNotes: null,
    supportSend: null
  });

  useEffect(() => {
    const updateViewport = () => setViewportState(getViewportState());
    const handleFocusShift = () => {
      window.setTimeout(updateViewport, 40);
      window.setTimeout(updateViewport, 240);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("focusin", handleFocusShift);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("focusin", handleFocusShift);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (activeTourIndex === null) {
      setTourLayout(null);
      return;
    }

    const step = TOUR_STEPS[activeTourIndex];
    const target = tourRefs.current[step.id];
    if (!target) {
      return;
    }

    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth"
    });

    const refreshLayout = () => {
      const currentTarget = tourRefs.current[step.id];
      if (!currentTarget) {
        return;
      }
      setTourLayout(
        computeTourLayout({
          target: toTourRect(currentTarget),
          viewport: viewportState
        })
      );
    };

    refreshLayout();

    const resizeObserver = new ResizeObserver(refreshLayout);
    resizeObserver.observe(target);
    const timeoutId = window.setTimeout(refreshLayout, 320);

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [activeTourIndex, viewportState]);

  const registerTourTarget = (id: TourTargetId) => (node: HTMLElement | null) => {
    tourRefs.current[id] = node;
  };

  const nextTourStep = () => {
    setActiveTourIndex((current) => {
      if (current === null) {
        return 0;
      }
      return current >= TOUR_STEPS.length - 1 ? null : current + 1;
    });
  };

  const previousTourStep = () => {
    setActiveTourIndex((current) => {
      if (current === null) {
        return 0;
      }
      return current <= 0 ? 0 : current - 1;
    });
  };

  return (
    <main>
      <div className="hero">
        <div>
          <span className="eyebrow">Operator Console</span>
          <h1>Scope Desktop</h1>
          <small>Arena-equivalent local-first workflow for interviews, signals, dossiers, and support diagnostics.</small>
        </div>
        <div className="hero-actions">
          <button className="secondary hero-button" onClick={() => setActiveTourIndex(0)}>
            Launch Guided Tour
          </button>
          <small>Tour stays visible above the mobile keyboard using `visualViewport` re-layout.</small>
        </div>
      </div>

      <div className="grid">
        <InterviewCard setOutput={setOutput} registerTourTarget={registerTourTarget} />
        <SupportCard setOutput={setOutput} registerTourTarget={registerTourTarget} />
        <IntegrationsCard setOutput={setOutput} />
        <SignalStreamCard setOutput={setOutput} onFeatureIdFound={setFeatureId} />
        <DossierCard featureId={featureId} setFeatureId={setFeatureId} setOutput={setOutput} />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Output</h3>
        <pre>{output}</pre>
      </section>

      <GuidedTour
        activeTourIndex={activeTourIndex}
        tourLayout={tourLayout}
        viewportState={viewportState}
        onNext={nextTourStep}
        onPrevious={previousTourStep}
        onClose={() => setActiveTourIndex(null)}
      />
    </main>
  );
}
