export interface TourRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TourViewport {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  keyboardInset: number;
}

export interface TourLayoutResult {
  spotlight: TourRect;
  card: TourRect;
  docked: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const computeTourLayout = (params: {
  target: TourRect;
  viewport: TourViewport;
  preferredCardHeight?: number;
  cardWidth?: number;
}): TourLayoutResult => {
  const margin = 12;
  const spotlightPad = 8;
  const cardWidth = Math.min(params.cardWidth ?? 360, params.viewport.width - margin * 2);
  const cardHeight = Math.min(params.preferredCardHeight ?? 220, params.viewport.height - margin * 2);
  const spotlight: TourRect = {
    top: params.target.top - spotlightPad,
    left: params.target.left - spotlightPad,
    width: params.target.width + spotlightPad * 2,
    height: params.target.height + spotlightPad * 2
  };

  const narrowViewport = params.viewport.width < 820;
  const keyboardVisible = params.viewport.keyboardInset > 80;
  const spaceBelow = params.viewport.offsetTop + params.viewport.height - (params.target.top + params.target.height);
  const docked = narrowViewport || keyboardVisible || spaceBelow < cardHeight + margin * 2;

  const left = clamp(
    params.target.left,
    params.viewport.offsetLeft + margin,
    params.viewport.offsetLeft + params.viewport.width - cardWidth - margin
  );

  if (docked) {
    return {
      spotlight,
      card: {
        top: params.viewport.offsetTop + params.viewport.height - cardHeight - margin,
        left: params.viewport.offsetLeft + margin,
        width: params.viewport.width - margin * 2,
        height: cardHeight
      },
      docked
    };
  }

  const topCandidate = params.target.top + params.target.height + margin;
  const top = clamp(
    topCandidate,
    params.viewport.offsetTop + margin,
    params.viewport.offsetTop + params.viewport.height - cardHeight - margin
  );

  return {
    spotlight,
    card: {
      top,
      left,
      width: cardWidth,
      height: cardHeight
    },
    docked
  };
};
