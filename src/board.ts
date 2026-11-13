import { Container, Graphics, Sprite } from 'pixi.js';
import type { createConveyorCargo } from './conveyor-cargo';
import { conveyorEntryDistance } from './conveyor-path';
import { pieceFlightDuration, piecesPerBlock, preparePieceToStack, stackPiece, type Piece } from './conveyor-pieces';
import { blockColors, type BlockColor, type TruckArt } from './truck-art';
import { createTruckRoad } from './truck-roads';

export const boardWidth = 360;
export const boardHeight = 656;

const truckCapacity = 16;
const blocksPerColor = 32;
const truckTop = 302;

function createTruckLoads(): BlockColor[][] {
  const blocks = blockColors.flatMap((color) => Array<BlockColor>(blocksPerColor).fill(color));

  for (let index = blocks.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [blocks[index], blocks[swapIndex]] = [blocks[swapIndex], blocks[index]];
  }

  return Array.from({ length: blocks.length / truckCapacity }, (_, index) => {
    const start = index * truckCapacity;
    return blocks.slice(start, start + truckCapacity);
  });
}

function createConveyor(): Graphics {
  return new Graphics()
    .roundRect(22, 43, 316, 248, 54).fill(0x14112f)
    .roundRect(24, 38, 312, 250, 53).fill(0x64509b)
    .roundRect(27, 40, 306, 245, 50).fill(0x382b58)
    .roundRect(57, 71, 246, 184, 20).fill(0x7561af)
    .roundRect(60, 74, 240, 178, 17).fill(0x181436);
}

type ConveyorInput = Pick<ReturnType<typeof createConveyorCargo>, 'addBlocks' | 'addPieces' | 'isUnloading'>;

type TruckEvents = {
  onUnload(): void;
  onPieceLanded(): void;
  onComplete(): void;
};

type PartialBlock = {
  sprite: Sprite;
  pieces: { piece: Piece; elapsed: number }[];
  landed: number;
};

function addTruck(
  board: Container, x: number, blocks: readonly BlockColor[], art: TruckArt,
  conveyor: ConveyorInput, events: TruckEvents,
) {
  const body = new Sprite(art.body);
  body.position.set(x - 2, truckTop);
  board.addChild(body);

  const cargoX = x + 6;
  const cargoHeight = 271;
  const blockHeight = cargoHeight / truckCapacity;
  const cargoBottom = truckTop + 2 + cargoHeight;
  const firstBlockY = cargoBottom - blocks.length * blockHeight;
  const distance = conveyorEntryDistance(body.x + body.width / 2);
  const loading: PartialBlock[] = [];
  const cargo = blocks.map((color, index) => {
    const block = new Sprite(art.blocks[color]);
    block.height = blockHeight;
    block.position.set(cargoX, firstBlockY + index * blockHeight);
    return board.addChild(block);
  });

  function updateBody(): boolean {
    const color = cargo[0]?.texture;
    const complete = color && cargo.length === truckCapacity && cargo.every((block) => block.texture === color);
    body.texture = complete ? art.completedBodies.get(color) ?? art.body : art.body;
    return Boolean(complete);
  }
  updateBody();

  body.eventMode = 'static';
  body.cursor = 'pointer';
  body.on('pointertap', ({ button }) => {
    if (button !== 0 || conveyor.isUnloading(distance)) return;
    if (loading.some((block) => block.landed < block.pieces.length)) return;
    if (unload()) events.onUnload();
  });

  function unload(): boolean {
    let movedPieces = 0;
    if (loading.length > 0) {
      const sprites = loading.flatMap((block) => block.pieces.map(({ piece }) => piece.sprite)).reverse();
      movedPieces = conveyor.addPieces(sprites, distance);
      let remaining = movedPieces;
      while (loading.length > 0) {
        const block = loading[loading.length - 1];
        const removed = Math.min(remaining, block.pieces.length);
        block.pieces.length -= removed;
        remaining -= removed;
        if (block.pieces.length > 0) {
          block.landed = Math.min(block.landed, block.pieces.length);
          return movedPieces > 0;
        }
        loading.pop();
        block.sprite.destroy();
      }
    }

    const first = cargo[0];
    if (!first) return movedPieces > 0;

    let runLength = 1;
    while (runLength < cargo.length && cargo[runLength].texture === first.texture) runLength++;

    const moved = conveyor.addBlocks(cargo.slice(0, runLength), distance);
    cargo.splice(0, moved);
    if (moved > 0) updateBody();
    return movedPieces > 0 || moved > 0;
  }

  function receive(piece: Piece): boolean {
    if (conveyor.isUnloading(distance)) return false;
    const texture = piece.sprite.texture;
    let block = loading.at(-1);
    const topColor = (block?.sprite ?? cargo[0])?.texture;
    if (topColor && topColor !== texture) return false;

    if (!block || block.pieces.length === piecesPerBlock) {
      if (cargo.length + loading.length >= truckCapacity) return false;
      const sprite = new Sprite(texture);
      sprite.height = blockHeight;
      sprite.position.set(cargoX, cargoBottom - (cargo.length + loading.length + 1) * blockHeight);
      block = { sprite, pieces: [], landed: 0 };
      loading.push(block);
    }

    preparePieceToStack(piece, block.pieces.length, block.sprite);
    block.pieces.push({ piece, elapsed: 0 });
    return true;
  }

  function advance(deltaMS: number): boolean {
    let pieceLanded = false;
    for (const block of loading) {
      for (let index = block.landed; index < block.pieces.length; index++) {
        const flight = block.pieces[index];
        flight.elapsed += deltaMS;
        const progress = Math.min(1, flight.elapsed / pieceFlightDuration);
        stackPiece(flight.piece, index, block.sprite, progress);
        if (progress === 1) {
          block.landed++;
          pieceLanded = true;
        }
      }
    }

    while (loading[0]?.landed === piecesPerBlock) {
      const block = loading.shift()!;
      for (const { piece } of block.pieces) piece.sprite.destroy();
      cargo.unshift(board.addChild(block.sprite));
      if (cargo.length === truckCapacity && updateBody()) events.onComplete();
    }
    return pieceLanded;
  }

  return { distance, receive, advance };
}

export function createBoard(art: TruckArt, conveyor: ConveyorInput, events: TruckEvents) {
  const board = new Container();
  const loads = createTruckLoads();
  const truckSpacing = 48;
  const firstTruckX = 40;
  const firstTruckCenter = firstTruckX - 2 + art.body.width / 2;
  const laneDividers = loads.slice(1).map((_, index) => firstTruckCenter + (index + 0.5) * truckSpacing);
  const roadMargin = 28;
  board.addChild(
    createTruckRoad(roadMargin, boardWidth - roadMargin, truckTop - 38, boardHeight, laneDividers),
    createConveyor(),
  );

  const trucks = loads.map((blocks, index) =>
    addTruck(board, firstTruckX + index * truckSpacing, blocks, art, conveyor, events));

  return {
    view: board,
    receivers: trucks,
    advance(deltaMS: number) {
      let pieceLanded = false;
      for (const truck of trucks) {
        if (truck.advance(deltaMS)) pieceLanded = true;
      }
      if (pieceLanded) events.onPieceLanded();
    },
  };
}
