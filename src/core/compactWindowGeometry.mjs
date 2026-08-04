const MIN_VISUAL_SIZE = 48;
const MAX_VISUAL_SIZE = 430;
const SHAPE_PADDING = 4;
const RESIZE_HANDLE_SIZE = 28;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampedRect(rect, viewport) {
  const left = clamp(Math.floor(rect.x), 0, viewport.width);
  const top = clamp(Math.floor(rect.y), 0, viewport.height);
  const right = clamp(Math.ceil(rect.x + rect.width), left, viewport.width);
  const bottom = clamp(Math.ceil(rect.y + rect.height), top, viewport.height);
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0
    ? { x: left, y: top, width, height }
    : undefined;
}

export function computeCompactLayout(input = {}) {
  const width = finiteDimension(input.width, 120);
  const height = finiteDimension(input.height, 140);
  const horizontalPadding = clamp(width * 0.025, 5, 10);
  const verticalPadding = clamp(height * 0.025, 5, 10);
  const availableWidth = Math.max(MIN_VISUAL_SIZE, width - (horizontalPadding * 2));
  const availableHeight = Math.max(MIN_VISUAL_SIZE, height - (verticalPadding * 2));
  const visualSize = clamp(
    Math.min(availableWidth * 0.96, availableHeight * 0.96),
    MIN_VISUAL_SIZE,
    MAX_VISUAL_SIZE,
  );
  const centerY = height / 2;
  const feedbackVisible = input.feedbackVisible === true;
  const feedbackPhase = typeof input.feedbackPhase === "string"
    ? input.feedbackPhase
    : "idle";
  const feedbackHeight = feedbackPhase === "loading" ? 30 : 26;
  const feedbackGap = clamp(visualSize * 0.012, 2, 4);
  const feedbackScale = feedbackPhase === "loading" ? 1.02 : 0.94;
  const feedbackWidth = Math.min(
    availableWidth,
    Math.max(58, visualSize * feedbackScale),
  );
  const naturalFeedbackTop = centerY + (visualSize / 2) + feedbackGap;
  const feedbackTop = feedbackVisible
    ? Math.min(
      height - verticalPadding - feedbackHeight,
      naturalFeedbackTop,
    )
    : naturalFeedbackTop;

  return {
    visualSize,
    centerY,
    feedbackWidth,
    feedbackHeight,
    feedbackTop,
    feedbackGap,
    menuX: visualSize * 0.34,
    menuY: visualSize * 0.34,
  };
}

export function computeCompactShapeRects(input = {}) {
  const width = Math.max(1, Math.round(finiteDimension(input.width, 120)));
  const height = Math.max(1, Math.round(finiteDimension(input.height, 140)));
  const visualSize = finiteDimension(input.visualSize, 58);
  const centerY = finiteDimension(input.centerY, height / 2);
  const centerX = width / 2;
  const mascot = typeof input.mascot === "string" ? input.mascot : "cockapoo";
  const isGreenKnightPup = mascot === "green-knight-pup";
  const mascotWidth = visualSize * (isGreenKnightPup ? 0.82 : 1);
  const mascotHeight = visualSize * (isGreenKnightPup ? 1.04 : 1);
  const viewport = { width, height };
  const rects = [
    clampedRect({
      x: centerX - (mascotWidth / 2) - SHAPE_PADDING,
      y: centerY - (mascotHeight / 2) - SHAPE_PADDING,
      width: mascotWidth + (SHAPE_PADDING * 2),
      height: mascotHeight + (SHAPE_PADDING * 2),
    }, viewport),
    clampedRect({
      x: centerX + finiteDimension(input.menuX, visualSize * 0.34)
        - (RESIZE_HANDLE_SIZE / 2),
      y: centerY - finiteDimension(input.menuY, visualSize * 0.34)
        - (RESIZE_HANDLE_SIZE / 2),
      width: RESIZE_HANDLE_SIZE,
      height: RESIZE_HANDLE_SIZE,
    }, viewport),
  ];

  if (input.feedbackVisible === true) {
    const feedbackWidth = finiteDimension(input.feedbackWidth, visualSize);
    const feedbackHeight = finiteDimension(input.feedbackHeight, 26);
    rects.push(clampedRect({
      x: centerX - (feedbackWidth / 2) - 2,
      y: finiteDimension(input.feedbackTop, centerY + (visualSize / 2)) - 2,
      width: feedbackWidth + 4,
      height: feedbackHeight + 4,
    }, viewport));
  }

  return rects.filter(Boolean);
}
