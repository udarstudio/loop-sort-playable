import { Graphics } from 'pixi.js';

const palette = {
  shadow: 0x181430,
  pavement: 0x211b3d,
  road: 0x262041,
  wall: 0x292143,
  roof: 0x30264c,
  trim: 0x392e55,
};

function drawWarehouse(yard: Graphics, x: number, y: number, width: number): void {
  yard
    .roundRect(x - 9, y - 10, width + 18, 125, 12).fill(palette.pavement)
    .roundRect(x + 3, y + 5, width, 91, 9).fill(palette.shadow)
    .roundRect(x, y + 16, width, 77, 8).fill(palette.wall)
    .roundRect(x, y, width, 71, 8).fill(palette.roof)
    .roundRect(x + 7, y + 6, width - 14, 3, 1.5).fill(palette.trim);

  const bayWidth = (width - 30) / 3;
  for (let bay = 0; bay < 3; bay++) {
    const bayX = x + 9 + bay * (bayWidth + 6);
    yard
      .roundRect(bayX, y + 19, bayWidth, 38, 4).fill(palette.wall)
      .roundRect(bayX + 4, y + 22, bayWidth - 8, 10, 3).fill(palette.trim)
      .roundRect(bayX + 3, y + 76, bayWidth - 6, 13, 2).fill(palette.shadow)
      .rect(bayX + 6, y + 80, bayWidth - 12, 2).fill(palette.trim)
      .rect(bayX + 6, y + 85, bayWidth - 12, 1).fill(palette.roof);
  }
}

function drawTank(yard: Graphics, x: number, y: number, radius: number): void {
  yard
    .circle(x + 3, y + 6, radius + 2).fill(palette.shadow)
    .circle(x, y, radius).fill(palette.wall)
    .circle(x, y - 3, radius - 3).fill(palette.roof)
    .circle(x, y - 3, radius - 8).stroke({ color: palette.trim, width: 1.5 })
    .roundRect(x - 2, y - radius + 6, 4, radius - 4, 1).fill(palette.trim)
    .circle(x, y - 3, 4).fill(palette.wall);
}

export function createYard(): Graphics {
  const yard = new Graphics();
  yard.eventMode = 'none';

  const serviceRoads = () => yard
    .moveTo(-102, -130).lineTo(-102, 302).quadraticCurveTo(-102, 345, -57, 345).lineTo(62, 345)
    .moveTo(304, 492).lineTo(423, 492).quadraticCurveTo(468, 492, 468, 538).lineTo(468, 920);
  serviceRoads().stroke({ color: palette.shadow, width: 46 });
  serviceRoads().stroke({ color: palette.road, width: 40 });

  for (let y = -104; y < 294; y += 25) yard.roundRect(-103, y, 2, 10, 1).fill(palette.trim);
  for (let x = -55; x < 28; x += 21) yard.roundRect(x, 344, 9, 2, 1).fill(palette.trim);
  for (let x = 330; x < 425; x += 21) yard.roundRect(x, 491, 9, 2, 1).fill(palette.trim);
  for (let y = 538; y < 900; y += 25) yard.roundRect(467, y, 2, 10, 1).fill(palette.trim);

  yard.roundRect(339, 322, 147, 94, 12).fill(palette.pavement);
  yard.roundRect(-92, 560, 113, 73, 10).fill(palette.pavement);

  const pipes = () => yard
    .moveTo(-32, -90).lineTo(-32, 143).quadraticCurveTo(-32, 166, -9, 166).lineTo(68, 166)
    .moveTo(10, -90).lineTo(10, 104).quadraticCurveTo(10, 123, 29, 123).lineTo(77, 123)
    .moveTo(298, 226).lineTo(385, 226).quadraticCurveTo(406, 226, 406, 247).lineTo(406, 349)
    .moveTo(330, 205).lineTo(423, 205).quadraticCurveTo(443, 205, 443, 225).lineTo(443, 359);
  pipes().stroke({ color: palette.shadow, width: 10, cap: 'round' });
  pipes().stroke({ color: palette.roof, width: 6, cap: 'round' });
  for (const [x, y] of [[-32, 89], [10, 22], [10, 76], [406, 274], [443, 252], [443, 295]]) {
    yard.roundRect(x - 5, y, 10, 4, 1).fill(palette.trim);
  }

  drawWarehouse(yard, -135, 390, 146);
  drawWarehouse(yard, 346, 54, 138);
  drawTank(yard, 360, 371, 18);
  drawTank(yard, 405, 367, 24);
  drawTank(yard, 450, 371, 18);
  drawTank(yard, -61, 597, 23);
  drawTank(yard, -10, 597, 23);

  return yard;
}
