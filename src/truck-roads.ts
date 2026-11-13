import { Graphics } from 'pixi.js';

export const roadPalette = {
  shadow: 0x221a3c,
  surface: 0x32274d,
  trim: 0x51416f,
  markings: 0x554570,
};

export function createTruckRoad(
  left: number, right: number, top: number, bottom: number, laneDividers: readonly number[],
): Graphics {
  const road = new Graphics();

  function layer(inset: number, color: number): void {
    const x = left + inset;
    const endX = right - inset;
    road
      .moveTo(x + 31, top)
      .lineTo(endX - 31, top)
      .bezierCurveTo(endX - 31, top + 22, endX, top + 20, endX, top + 49)
      .lineTo(endX, bottom)
      .lineTo(x, bottom)
      .lineTo(x, top + 49)
      .bezierCurveTo(x, top + 20, x + 31, top + 22, x + 31, top)
      .closePath().fill(color);
  }

  layer(0, roadPalette.shadow);
  layer(3, roadPalette.trim);
  layer(6, roadPalette.surface);

  const laneTop = top + 40;
  const dashLength = 12;
  const dashSpacing = 22;
  for (const x of laneDividers) {
    for (let y = laneTop; y < bottom; y += dashSpacing) {
      road.roundRect(x - 1, y, 2, Math.min(dashLength, bottom - y), 1).fill(roadPalette.markings);
    }
  }
  return road;
}
