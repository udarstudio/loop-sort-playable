import { Container, Graphics, Sprite } from 'pixi.js';
import { blockHeight, type BlockColor, type TruckArt } from './truck-art';

export const boardWidth = 360;
export const boardHeight = 628;

type Slot = BlockColor | null;
type Wagon = readonly [Slot, Slot, Slot, Slot];
type Bus = readonly [Wagon, Wagon, Wagon, Wagon];

const emptyWagon: Wagon = [null, null, null, null];
const buses: readonly Bus[] = [
  [
    ['pink', 'orange', 'white', 'pink'],
    ['pink', 'white', 'orange', 'white'],
    ['orange', 'pink', 'white', 'orange'],
    ['pink', 'orange', 'white', 'pink'],
  ],
  [emptyWagon, emptyWagon, emptyWagon, emptyWagon],
  [
    ['pink', 'pink', 'pink', 'pink'],
    ['pink', 'pink', 'white', 'orange'],
    ['pink', 'white', 'white', 'orange'],
    ['pink', 'pink', 'white', 'orange'],
  ],
  [
    ['pink', 'pink', 'pink', 'pink'],
    ['pink', 'orange', 'white', 'white'],
    ['orange', 'pink', 'orange', 'white'],
    ['pink', 'white', 'orange', 'pink'],
  ],
  [
    emptyWagon,
    [null, null, 'white', 'white'],
    ['white', 'white', 'pink', 'pink'],
    ['white', 'orange', 'white', 'pink'],
  ],
  [
    emptyWagon,
    ['orange', 'pink', 'pink', 'orange'],
    ['white', 'white', 'orange', 'pink'],
    ['orange', 'white', 'pink', 'pink'],
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

function addBus(board: Container, x: number, wagons: Bus, art: TruckArt): void {
  const top = 304;
  const body = new Sprite(art.body);
  body.position.set(x - 2, top - 2);
  board.addChild(body);

  const cargoX = x + 6;
  const cargoY = top + 7;
  wagons.flat().forEach((color, index) => {
    if (color === null) return;

    const block = new Sprite(art.blocks[color]);
    block.position.set(cargoX, cargoY + index * blockHeight);
    board.addChild(block);
  });
}

export function createBoard(art: TruckArt): Container {
  const board = new Container();
  board.addChild(createConveyor());

  buses.forEach((bus, index) => {
    addBus(board, 40 + index * 48, bus, art);
  });

  return board;
}
