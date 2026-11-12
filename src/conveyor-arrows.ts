import { Container, Graphics, GraphicsContext } from 'pixi.js';

const track = { left: 42, right: 318, top: 56, bottom: 270, radius: 35 };
const horizontal = track.right - track.left - 2 * track.radius;
const vertical = track.bottom - track.top - 2 * track.radius;
const cornerLength = track.radius * Math.PI / 2;
const loopLength = 2 * (horizontal + vertical) + 4 * cornerLength;
const arrowSpeed = 27;
const arrowCount = 20;
const arrowSide = 7;
const arrowAltitude = arrowSide * Math.sqrt(3) / 2;

const sides = [
  { x: track.right - track.radius, y: track.top, dx: -1, dy: 0, length: horizontal, angle: Math.PI },
  { x: track.left, y: track.top + track.radius, dx: 0, dy: 1, length: vertical, angle: Math.PI / 2 },
  { x: track.left + track.radius, y: track.bottom, dx: 1, dy: 0, length: horizontal, angle: 0 },
  { x: track.right, y: track.bottom - track.radius, dx: 0, dy: -1, length: vertical, angle: -Math.PI / 2 },
];

function positionArrow(arrow: Graphics, distance: number): void {
  for (const { x, y, dx, dy, length, angle } of sides) {
    if (distance < length) {
      arrow.position.set(x + dx * distance, y + dy * distance);
      arrow.rotation = angle;
      return;
    }

    distance -= length;
    if (distance < cornerLength) {
      const centerX = x + dx * length + dy * track.radius;
      const centerY = y + dy * length - dx * track.radius;
      const heading = angle - distance / track.radius;
      arrow.position.set(
        centerX - Math.sin(heading) * track.radius,
        centerY + Math.cos(heading) * track.radius,
      );
      arrow.rotation = heading;
      return;
    }

    distance -= cornerLength;
  }
}

export function createConveyorFlow() {
  const view = new Container();
  const triangle = new GraphicsContext()
    .poly([
      -arrowAltitude / 3, -arrowSide / 2,
      2 * arrowAltitude / 3, 0,
      -arrowAltitude / 3, arrowSide / 2,
    ])
    .fill({ color: 0xe1d4ff, alpha: 0.2 });
  const arrows = Array.from({ length: arrowCount }, () => view.addChild(new Graphics(triangle)));
  const spacing = loopLength / arrowCount;
  let offset = 0;

  function advance(deltaMS: number): void {
    offset = (offset + arrowSpeed * deltaMS / 1000) % loopLength;

    arrows.forEach((arrow, index) => {
      positionArrow(arrow, (offset + index * spacing) % loopLength);
    });
  }

  advance(0);
  return { view, advance };
}
