import type { PointData } from 'pixi.js';

const track = { left: 42, right: 318, top: 56, bottom: 270, radius: 35 };
const horizontal = track.right - track.left - 2 * track.radius;
const vertical = track.bottom - track.top - 2 * track.radius;
const cornerLength = track.radius * Math.PI / 2;
const leftCorner = track.left + track.radius;
const rightCorner = track.right - track.radius;
const topCorner = track.top + track.radius;
const bottomCorner = track.bottom - track.radius;
const leftDistance = horizontal + cornerLength;
const bottomDistance = leftDistance + vertical + cornerLength;
const rightDistance = bottomDistance + horizontal + cornerLength;
export const loopLength = 2 * (horizontal + vertical) + 4 * cornerLength;
export const baseConveyorSpeed = 30;

const sides = [
  { x: track.right - track.radius, y: track.top, dx: -1, dy: 0, length: horizontal, angle: Math.PI },
  { x: track.left, y: track.top + track.radius, dx: 0, dy: 1, length: vertical, angle: Math.PI / 2 },
  { x: track.left + track.radius, y: track.bottom, dx: 1, dy: 0, length: horizontal, angle: 0 },
  { x: track.right, y: track.bottom - track.radius, dx: 0, dy: -1, length: vertical, angle: -Math.PI / 2 },
];

export function wrapDistance(distance: number): number {
  return (distance % loopLength + loopLength) % loopLength;
}

export function positionOnConveyor(point: PointData, distance: number, lane = 0): number {
  for (const { x, y, dx, dy, length, angle } of sides) {
    if (distance < length) {
      point.x = x + dx * distance - dy * lane;
      point.y = y + dy * distance + dx * lane;
      return angle;
    }

    distance -= length;
    if (distance < cornerLength) {
      const centerX = x + dx * length + dy * track.radius;
      const centerY = y + dy * length - dx * track.radius;
      const heading = angle - distance / track.radius;
      point.x = centerX - Math.sin(heading) * (track.radius + lane);
      point.y = centerY + Math.cos(heading) * (track.radius + lane);
      return heading;
    }

    distance -= cornerLength;
  }

  return 0;
}

export function distanceOnConveyor({ x, y }: PointData): number {
  const left = x - leftCorner;
  const right = rightCorner - x;
  const top = y - topCorner;
  const bottom = bottomCorner - y;
  const dx = Math.min(left, right);
  const dy = Math.min(top, bottom);

  if (dx < 0 && dy < 0) {
    const arc = (Math.atan2(dy, dx) + Math.PI) * track.radius;
    if (left < 0) return top < 0 ? leftDistance - arc : bottomDistance - cornerLength + arc;
    return bottom < 0 ? rightDistance - arc : loopLength - cornerLength + arc;
  }

  const nearest = Math.min(dx, dy);
  if (nearest === top) return rightCorner - x;
  if (nearest === left) return leftDistance + y - topCorner;
  if (nearest === bottom) return bottomDistance + x - leftCorner;
  return rightDistance + bottomCorner - y;
}

export function conveyorRail(lane: number): PointData[] {
  const points: PointData[] = [];
  const cornerSegments = 6;
  let distance = 0;
  for (const side of sides) {
    const start = { x: 0, y: 0 };
    positionOnConveyor(start, distance, lane);
    points.push(start);
    distance += side.length;
    for (let index = 0; index < cornerSegments; index++) {
      const point = { x: 0, y: 0 };
      positionOnConveyor(point, distance + index * cornerLength / cornerSegments, lane);
      points.push(point);
    }
    distance += cornerLength;
  }
  return points;
}

export function conveyorEntryDistance(x: number): number {
  // The outer trucks meet the curved ends of the bottom straight.
  if (x < leftCorner) {
    return bottomDistance - track.radius * Math.asin(Math.min(1, (leftCorner - x) / track.radius));
  }
  if (x > rightCorner) {
    return bottomDistance + horizontal + track.radius * Math.asin(Math.min(1, (x - rightCorner) / track.radius));
  }
  return bottomDistance + x - leftCorner;
}
