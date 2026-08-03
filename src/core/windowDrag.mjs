const MAX_SCREEN_COORDINATE = 100_000;

export function normalizeDragPoint(input = {}) {
  const screenX = Number(input.screenX);
  const screenY = Number(input.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)
    || Math.abs(screenX) > MAX_SCREEN_COORDINATE
    || Math.abs(screenY) > MAX_SCREEN_COORDINATE) {
    return undefined;
  }
  return {
    screenX: Math.round(screenX),
    screenY: Math.round(screenY),
  };
}

export function createWindowDragSession(point, startBounds) {
  if (!point || !startBounds) {
    return undefined;
  }
  return {
    startScreenX: point.screenX,
    startScreenY: point.screenY,
    screenX: point.screenX,
    screenY: point.screenY,
    startBounds: { ...startBounds },
  };
}

export function updateWindowDragSession(session, point) {
  if (!session || !point) {
    return false;
  }
  session.screenX = point.screenX;
  session.screenY = point.screenY;
  return true;
}

export function resolveWindowDragBounds(session) {
  if (!session) {
    return undefined;
  }
  return {
    ...session.startBounds,
    x: session.startBounds.x + session.screenX - session.startScreenX,
    y: session.startBounds.y + session.screenY - session.startScreenY,
  };
}
