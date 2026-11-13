import { Container, Graphics, Sprite } from 'pixi.js';
import type { BlockColor, TruckArt } from './truck-art';

export const boardWidth = 360;
export const boardHeight = 656;

const truckCapacity = 16;
const truckLoads: readonly (readonly BlockColor[])[] = [
  [
    'pink', 'orange', 'white', 'pink', 'pink', 'white', 'orange', 'white',
    'orange', 'pink', 'white', 'orange', 'pink', 'orange', 'white', 'pink',
  ],
  [],
  [
    'pink', 'pink', 'pink', 'pink', 'pink', 'pink', 'white', 'orange',
    'pink', 'white', 'white', 'orange', 'pink', 'pink', 'white', 'orange',
  ],
  [
    'pink', 'pink', 'pink', 'pink', 'pink', 'orange', 'white', 'white',
    'orange', 'pink', 'orange', 'white', 'pink', 'white', 'orange', 'pink',
  ],
  [
    'white', 'white', 'white', 'white', 'pink', 'pink',
    'white', 'orange', 'white', 'pink',
  ],
  [
    'orange', 'pink', 'pink', 'orange', 'white', 'white',
    'orange', 'pink', 'orange', 'white', 'pink', 'pink',
  ],
];

function createConveyor(): Graphics {
  return new Graphics()
    .roundRect(22, 43, 316, 248, 54).fill(0x14112f)
    .roundRect(24, 38, 312, 250, 53).fill(0x64509b)
    .roundRect(27, 40, 306, 245, 50).fill(0x382b58)
    .roundRect(57, 71, 246, 184, 20).fill(0x7561af)
    .roundRect(60, 74, 240, 178, 17).fill(0x181436);
}

function addTruck(board: Container, x: number, blocks: readonly BlockColor[], art: TruckArt): void {
  const top = 304;
  const body = new Sprite(art.body);
  body.position.set(x - 2, top - 2);
  board.addChild(body);

  const cargoX = x + 6;
  const cargoHeight = 271;
  const blockHeight = cargoHeight / truckCapacity;
  const firstBlockY = top + (truckCapacity - blocks.length) * blockHeight;
  blocks.forEach((color, index) => {
    const block = new Sprite(art.blocks[color]);
    block.height = blockHeight;
    block.position.set(cargoX, firstBlockY + index * blockHeight);
    board.addChild(block);
  });
}

export function createBoard(art: TruckArt): Container {
  const board = new Container();
  board.addChild(createConveyor());

  truckLoads.forEach((blocks, index) => {
    addTruck(board, 40 + index * 48, blocks, art);
  });

  return board;
}
