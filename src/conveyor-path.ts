import type { Container } from 'pixi.js';

const track = { left: 42, right: 318, top: 56, bottom: 270, radius: 35 };
const horizontal = track.right - track.left - 2 * track.radius;
const vertical = track.bottom - track.top - 2 * track.radius;
const cornerLength = track.radius * Math.PI / 2;
export const loopLength = 2 * (horizontal + vertical) + 4 * cornerLength;
export const baseConveyorSpeed = 27;

const sides = [
  { x: track.right - track.radius, y: track.top, dx: -1, dy: 0, length: horizontal, angle: Math.PI },
  { x: track.left, y: track.top + track.radius, dx: 0, dy: 1, length: vertical, angle: Math.PI / 2 },
  { x: track.left + track.radius, y: track.bottom, dx: 1, dy: 0, length: horizontal, angle: 0 },
  { x: track.right, y: track.bottom - track.radius, dx: 0, dy: -1, length: vertical, angle: -Math.PI / 2 },
];

export function positionOnConveyor(view: Container, distance: number): number {
  for (const { x, y, dx, dy, length, angle } of sides) {
    if (distance < length) {
      view.position.set(x + dx * distance, y + dy * distance);
      return angle;
    }

    distance -= length;
    if (distance < cornerLength) {
      const centerX = x + dx * length + dy * track.radius;
      const centerY = y + dy * length - dx * track.radius;
      const heading = angle - distance / track.radius;
      view.position.set(
        centerX - Math.sin(heading) * track.radius,
        centerY + Math.cos(heading) * track.radius,
      );
      return heading;
    }

    distance -= cornerLength;
  }

  return 0;
}

export function conveyorEntryDistance(x: number): number {
  const bottomStart = track.left + track.radius;
  const bottomEnd = track.right - track.radius;
  const bottomDistance = horizontal + vertical + 2 * cornerLength;

  // The outer trucks meet the curved ends of the bottom straight.
  if (x < bottomStart) {
    return bottomDistance - track.radius * Math.asin(Math.min(1, (bottomStart - x) / track.radius));
  }
  if (x > bottomEnd) {
    return bottomDistance + horizontal + track.radius * Math.asin(Math.min(1, (x - bottomEnd) / track.radius));
  }
  return bottomDistance + x - bottomStart;
}
