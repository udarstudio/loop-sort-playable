import { Container, Graphics, Sprite } from 'pixi.js';
import type { createConveyorCargo } from './conveyor-cargo';
import { conveyorEntryDistance } from './conveyor-path';
import { pieceFlightDuration, piecesPerBlock, preparePieceToStack, stackPiece, type Piece } from './conveyor-pieces';
import { createFactory } from './factory';
import { blockColors, type BlockColor, type TruckArt } from './truck-art';
import { createTruckCover } from './truck-cover';
import { createTruckHeadlights } from './truck-headlights';
import { createTruckRoad } from './truck-roads';

export const boardWidth = 360;
export const boardHeight = 656;

const truckCapacity = 16;
const truckTop = 302;
const parkingDuration = 3500;
const parkingTurn = Math.PI / 180;
const unloadHopDuration = 180;
const completionRollDuration = 1200;
const completionRollDistance = 22;
type ParkingArrival = { distance: number; delay: number };

function createTruckLoads(blocksPerColor: number): BlockColor[][] {
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

type ConveyorInput = Pick<ReturnType<typeof createConveyorCargo>, 'addBlocks' | 'addPieces' | 'availablePieces' | 'isUnloading'>;

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
  conveyor: ConveyorInput, events: TruckEvents, arrival?: ParkingArrival,
) {
  const truck = board.addChild(new Container());
  truck.visible = !arrival;
  let parkingElapsed = -(arrival?.delay ?? 0);
  let unloadHopElapsed = unloadHopDuration;

  const body = new Sprite(art.body);
  body.position.set(x - 2, truckTop);
  truck.addChild(body);
  const centerX = body.x + body.width / 2;
  const centerY = truckTop + body.height / 2;
  truck.pivot.set(centerX, centerY);
  truck.position.set(centerX, centerY + (arrival?.distance ?? 0));

  const cargoX = x + 6;
  const cargoHeight = 271;
  const blockHeight = cargoHeight / truckCapacity;
  const cargoBottom = truckTop + 2 + cargoHeight;
  const firstBlockY = cargoBottom - blocks.length * blockHeight;
  const distance = conveyorEntryDistance(centerX);
  const loading: PartialBlock[] = [];
  const cargo = blocks.map((color, index) => {
    const block = new Sprite(art.blocks[color]);
    block.height = blockHeight;
    block.position.set(cargoX, firstBlockY + index * blockHeight);
    return truck.addChild(block);
  });

  function isComplete(): boolean {
    return cargo.length === truckCapacity && cargo.every((block) => block.texture === cargo[0].texture);
  }

  let cover: ReturnType<typeof createTruckCover> | undefined;
  let headlights: Graphics | undefined;
  let completionElapsed = 0;
  function completeTruck(animate: boolean): void {
    body.eventMode = 'none';
    body.cursor = 'default';
    const texture = cargo[0].texture;
    body.texture = art.completedBodies.get(texture) ?? art.body;
    const color = blockColors.find((color) => art.blocks[color] === texture);
    if (!color) return;
    cover = createTruckCover(color, cargo[0].width, cargoHeight, animate);
    cover.view.position.set(cargoX, cargoBottom - cargoHeight);
    truck.addChild(cover.view);
    headlights = createTruckHeadlights();
    headlights.position.copyFrom(body.position);
    headlights.alpha = animate ? 0 : 1;
    truck.addChildAt(headlights, 1);
    completionElapsed = animate ? 0 : completionRollDuration;
    if (!animate && !arrival) truck.y = centerY + completionRollDistance;
  }

  function canUnload(): boolean {
    return body.eventMode === 'static' && !conveyor.isUnloading(distance)
      && !loading.some((block) => block.landed < block.pieces.length);
  }

  body.eventMode = arrival ? 'none' : 'static';
  body.cursor = 'pointer';
  if (isComplete()) completeTruck(false);
  body.on('pointertap', ({ button }) => {
    if (button !== 0 || !canUnload() || !unload()) return;
    unloadHopElapsed = 0;
    events.onUnload();
  });

  const sourceOffsetY = () => truck.y - centerY;

  function unload(): boolean {
    let movedPieces = 0;
    if (loading.length > 0) {
      const sprites = loading.flatMap((block) => block.pieces.map(({ piece }) => piece.sprite)).reverse();
      movedPieces = conveyor.addPieces(sprites, distance, sourceOffsetY);
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

    const moved = conveyor.addBlocks(cargo.slice(0, runLength), distance, sourceOffsetY);
    cargo.splice(0, moved);
    return movedPieces > 0 || moved > 0;
  }

  function receive(piece: Piece): boolean {
    if (body.eventMode !== 'static' || conveyor.isUnloading(distance)) return false;
    const texture = piece.blockTexture;
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

  function advance(deltaMS: number, parkingStarted: boolean): boolean {
    if (arrival && parkingElapsed < parkingDuration) {
      if (!parkingStarted) return false;
      parkingElapsed += deltaMS;
      if (parkingElapsed <= 0) return false;
      truck.visible = true;
      const progress = Math.min(1, parkingElapsed / parkingDuration);
      const parkedY = centerY + (cover ? completionRollDistance : 0);
      truck.y = parkedY + (centerY + arrival.distance - parkedY) * (1 - progress) ** 2;
      if (progress === 1) {
        truck.rotation = 0;
        if (!isComplete()) body.eventMode = 'static';
      } else {
        truck.rotation = parkingTurn * Math.sin(Math.PI * progress) ** 2;
      }
      return false;
    }

    if (headlights) {
      cover?.advance(deltaMS);
      if (completionElapsed < completionRollDuration) {
        completionElapsed = Math.min(completionRollDuration, completionElapsed + deltaMS);
        const progress = completionElapsed / completionRollDuration;
        truck.y = centerY + completionRollDistance * (1 - (1 - progress) ** 3);
        headlights.alpha = Math.min(1, completionElapsed / 150);
      }
      return false;
    }

    if (unloadHopElapsed < unloadHopDuration) {
      unloadHopElapsed = Math.min(unloadHopDuration, unloadHopElapsed + deltaMS);
      const progress = unloadHopElapsed / unloadHopDuration;
      truck.y = centerY - 5 * Math.sin(Math.PI * progress) ** 2;
    }

    let pieceLanded = false;
    for (const block of loading) {
      for (let index = block.landed; index < block.pieces.length; index++) {
        const flight = block.pieces[index];
        flight.elapsed += deltaMS;
        const progress = Math.min(1, flight.elapsed / pieceFlightDuration);
        stackPiece(flight.piece, index, block.sprite, progress);
        if (progress === 1) {
          truck.addChild(flight.piece.sprite);
          block.landed++;
          pieceLanded = true;
        }
      }
    }

    while (loading[0]?.landed === piecesPerBlock) {
      const block = loading.shift()!;
      for (const { piece } of block.pieces) piece.sprite.destroy();
      cargo.unshift(truck.addChild(block.sprite));
      if (isComplete()) {
        completeTruck(true);
        events.onComplete();
      }
    }
    return pieceLanded;
  }

  return {
    distance, receive, advance, isComplete,
    isEmpty: () => cargo.length === 0 && loading.length === 0,
    hint() {
      const top = loading.at(-1)?.sprite ?? cargo[0];
      if (!top || !canUnload() || conveyor.availablePieces() < (loading.length ? 1 : piecesPerBlock)) return;
      if (isComplete()) return;
      return { x: centerX, y: Math.max(truckTop + 44, top.y + 12) };
    },
  };
}

export function createBoard(
  art: TruckArt, conveyor: ConveyorInput, events: TruckEvents, entranceY = boardHeight, staged = false,
) {
  const board = new Container();
  const factory = createFactory(boardWidth / 2, 161);
  const firstGroup = createTruckLoads(staged ? truckCapacity : 2 * truckCapacity);
  const secondGroup = staged ? createTruckLoads(truckCapacity) : [];
  const loads = [...firstGroup, ...secondGroup];
  const truckSpacing = 48;
  const firstTruckX = 40;
  const firstTruckCenter = firstTruckX - 2 + art.body.width / 2;
  const laneDividers = loads.slice(1).map((_, index) => firstTruckCenter + (index + 0.5) * truckSpacing);
  const roadMargin = 28;
  board.addChild(
    createTruckRoad(roadMargin, boardWidth - roadMargin, truckTop - 38, boardHeight, laneDividers),
    createConveyor(),
    factory.view,
  );

  const lanes = loads.map((_, index) => index);
  if (staged) {
    for (let index = lanes.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [lanes[index], lanes[swapIndex]] = [lanes[swapIndex], lanes[index]];
    }
  }
  let parkingStarted = false;
  const truckEvents = {
    ...events,
    onComplete() {
      parkingStarted = true;
      events.onComplete();
    },
  };
  const trucks = loads.map((blocks, index) => {
    const arrival = index >= firstGroup.length
      ? { distance: entranceY - truckTop, delay: (index - firstGroup.length) * parkingDuration }
      : undefined;
    return addTruck(board, firstTruckX + lanes[index] * truckSpacing, blocks, art, conveyor, truckEvents, arrival);
  });
  parkingStarted = staged && trucks.slice(0, firstGroup.length).some((truck) => truck.isComplete());

  return {
    view: board,
    receivers: trucks,
    advanceFactory: factory.advance,
    advance(deltaMS: number) {
      const canArrive = parkingStarted;
      let pieceLanded = false;
      for (const truck of trucks) {
        if (truck.advance(deltaMS, canArrive)) pieceLanded = true;
      }
      if (pieceLanded) events.onPieceLanded();
    },
  };
}
