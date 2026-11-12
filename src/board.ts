import { Graphics } from 'pixi.js';

export const boardWidth = 360;
export const boardHeight = 628;

const colors = {
  pink: { face: 0xf542ac, light: 0xff73cb, dark: 0xae176e },
  orange: { face: 0xe67739, light: 0xffa36a, dark: 0xa64620 },
  white: { face: 0xe3e2e8, light: 0xffffff, dark: 0x9693a5 },
};

type Color = keyof typeof colors;
type Stack = readonly [color: Color, rows: number];

const carriers: readonly { color: Color; stacks: readonly Stack[] }[] = [
  { color: 'pink', stacks: [
    ['pink', 1], ['orange', 1], ['white', 1], ['pink', 2], ['white', 1],
    ['orange', 1], ['white', 1], ['orange', 1], ['pink', 1], ['white', 1],
    ['orange', 1], ['pink', 1], ['orange', 1], ['white', 1], ['pink', 1],
  ] },
  { color: 'white', stacks: [] },
  { color: 'orange', stacks: [
    ['pink', 6], ['white', 1], ['orange', 1], ['pink', 1], ['white', 2],
    ['orange', 1], ['pink', 2], ['white', 1], ['orange', 1],
  ] },
  { color: 'pink', stacks: [
    ['pink', 5], ['orange', 1], ['white', 2], ['orange', 1], ['pink', 1],
    ['orange', 1], ['white', 1], ['pink', 1], ['white', 1], ['orange', 1], ['pink', 1],
  ] },
  { color: 'white', stacks: [
    ['white', 4], ['pink', 2], ['white', 1], ['orange', 1], ['white', 1], ['pink', 1],
  ] },
  { color: 'orange', stacks: [
    ['orange', 1], ['pink', 2], ['orange', 1], ['white', 2], ['orange', 1],
    ['pink', 1], ['orange', 1], ['white', 1], ['pink', 2],
  ] },
];

function drawConveyor(board: Graphics): void {
  board
    .roundRect(22, 43, 316, 248, 54).fill(0x14112f)
    .roundRect(24, 38, 312, 250, 53).fill(0x64509b)
    .roundRect(27, 40, 306, 245, 50).fill(0x382b58)
    .roundRect(57, 71, 246, 184, 20).fill(0x7561af)
    .roundRect(60, 74, 240, 178, 17).fill(0x181436);
}

function drawCarrier(board: Graphics, x: number, color: Color, stacks: readonly Stack[]): void {
  const y = 304;
  const rowHeight = 15.15;
  const { face, light, dark } = colors[color];

  board
    .roundRect(x + 1, y + 3, 35, 260, 5).fill(0x15112f)
    .roundRect(x, y + 8, 34, 252, 5).fill(dark)
    .roundRect(x + 2, y + 8, 30, 247, 4).fill(face)
    .roundRect(x + 4, y + 9, 26, 238, 3).fill(dark)
    .roundRect(x + 5, y + 10, 24, 235, 3).fill({ color: face, alpha: 0.84 })
    .roundRect(x, y, 3, 249, 1.5).fill(light)
    .roundRect(x + 31, y, 3, 249, 1.5).fill(face);

  let blockY = y;

  for (const [blockColor, rows] of stacks) {
    const block = colors[blockColor];
    const height = rows * rowHeight;
    board
      .roundRect(x + 5, blockY, 24, height, 2).fill(block.dark)
      .roundRect(x + 6, blockY + 1, 22, height - 2.5, 1.5).fill(block.face)
      .rect(x + 7, blockY + 1, 20, 0.75).fill(block.light);
    blockY += height;
  }

  board
    .roundRect(x + 4, y + 248, 26, 5, 2).fill(light)
    .roundRect(x + 6, y + 258, 8, 3, 1).fill(0xffdd6d)
    .roundRect(x + 20, y + 258, 8, 3, 1).fill(0xffdd6d);
}

export function createBoard(): Graphics {
  const board = new Graphics();
  drawConveyor(board);

  carriers.forEach(({ color, stacks }, index) => {
    drawCarrier(board, 42 + index * 48.5, color, stacks);
  });

  return board;
}
