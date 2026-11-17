import { Container, Graphics, Sprite } from 'pixi.js';
import type { createConveyorCargo } from './conveyor-cargo';
import { conveyorEntryDistance } from './conveyor-path';
import { pieceFlightDuration, piecesPerBlock, preparePieceToStack, stackPiece, type Piece } from './conveyor-pieces';
import { openingDriveDuration, openingSettleDuration, openingStagger } from './opening';
import {
  blockColors, createCargoRun, getBaseBlockTexture, getStackedBlockTexture, type BlockColor, type TruckArt,
} from './truck-art';
import { createTruckHeadlights } from './truck-headlights';

export const boardWidth = 360;
export const boardHeight = 656;
export const conveyorTop = 38;
const conveyorOpening = { x: 60, y: 74, width: 240, height: 178, radius: 17 };
export const conveyorCenter = {
  x: conveyorOpening.x + conveyorOpening.width / 2,
  y: conveyorOpening.y + conveyorOpening.height / 2,
};

const truckCapacity = 16;
const truckTop = 302;
const openingArrivalDuration = openingDriveDuration + openingSettleDuration;
const unloadHopDuration = 180;
const completionCheckColors = { pink: 0x7b1f53, orange: 0x834018, white: 0x635773 };
type OpeningArrival = { distance: number; delay: number };

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function createTruckLoads(easyStart: boolean): BlockColor[][] {
  if (easyStart) {
    const blocker = blockColors[Math.floor(Math.random() * blockColors.length)];
    const matches = blockColors.filter((color) => color !== blocker);
    if (Math.random() < 0.5) matches.reverse();

    const [firstMatch, secondMatch] = matches;
    return shuffle([
      [
        ...Array<BlockColor>(4).fill(blocker),
        firstMatch, firstMatch,
        secondMatch, secondMatch,
        ...Array<BlockColor>(3).fill(firstMatch),
        ...Array<BlockColor>(5).fill(secondMatch),
      ],
      [blocker, ...Array<BlockColor>(truckCapacity - 1).fill(firstMatch)],
      [
        firstMatch,
        blocker, blocker,
        ...Array<BlockColor>(3).fill(secondMatch),
        ...Array<BlockColor>(7).fill(firstMatch),
        ...Array<BlockColor>(3).fill(secondMatch),
      ],
      [
        secondMatch, secondMatch,
        ...Array<BlockColor>(3).fill(blocker),
        ...Array<BlockColor>(4).fill(firstMatch),
        ...Array<BlockColor>(7).fill(blocker),
      ],
      [
        ...Array<BlockColor>(3).fill(secondMatch),
        ...Array<BlockColor>(3).fill(blocker),
        ...Array<BlockColor>(10).fill(secondMatch),
      ],
      [
        secondMatch,
        blocker, blocker,
        ...Array<BlockColor>(3).fill(secondMatch),
        ...Array<BlockColor>(10).fill(blocker),
      ],
    ]);
  }

  const blocks = shuffle(blockColors.flatMap((color) => Array<BlockColor>(2 * truckCapacity).fill(color)));
  return Array.from({ length: blocks.length / truckCapacity }, (_, index) => {
    const start = index * truckCapacity;
    return blocks.slice(start, start + truckCapacity);
  });
}

function createConveyor(): Graphics {
  const conveyor = new Graphics();
  const opening = conveyorOpening;
  for (const [x, y, width, height, radius, color] of [
    [24, conveyorTop, 312, 250, 53, 0x64509b],
    [27, 40, 306, 245, 50, 0x382b58],
    [57, 71, 246, 184, 20, 0x7561af],
  ]) {
    conveyor.roundRect(x, y, width, height, radius).fill(color)
      .roundRect(opening.x, opening.y, opening.width, opening.height, opening.radius).cut();
  }
  return conveyor;
}

type ConveyorInput = Pick<ReturnType<typeof createConveyorCargo>, 'addBlocks' | 'addPieces' | 'availablePieces' | 'isUnloading'>;

type TruckEvents = {
  onUnload(): void;
  onPieceLanded(): void;
  onComplete(x: number, y: number): void;
};

type PartialBlock = {
  sprite: Sprite;
  pieces: { piece: Piece; elapsed: number }[];
  landed: number;
};

function addTruck(
  board: Container, left: number, blocks: readonly BlockColor[], art: TruckArt,
  conveyor: ConveyorInput, events: TruckEvents, arrival?: OpeningArrival,
) {
  const truck = board.addChild(new Container());
  truck.visible = !arrival;
  let parkingElapsed = -(arrival?.delay ?? 0);
  let unloadHopElapsed = unloadHopDuration;

  const body = new Sprite(art.body);
  body.position.set(left, truckTop);
  truck.addChild(body);
  truck.addChild(createTruckHeadlights()).position.copyFrom(body.position);
  const centerX = body.x + body.width / 2;
  const centerY = truckTop + body.height / 2;
  truck.pivot.set(centerX, centerY);
  truck.position.set(centerX, centerY + (arrival?.distance ?? 0));

  const cargoX = left + 8;
  const cargoHeight = 271;
  const blockHeight = cargoHeight / truckCapacity;
  const cargoBottom = truckTop + 2 + cargoHeight;
  const firstBlockY = cargoBottom - blocks.length * blockHeight;
  const distance = conveyorEntryDistance(centerX);
  const cargoView = truck.addChild(new Container());
  const loading: PartialBlock[] = [];
  const cargo = blocks.map((color, index) => {
    const block = new Sprite(art.blocks[color]);
    block.height = blockHeight;
    block.position.set(cargoX, firstBlockY + index * blockHeight);
    return block;
  });

  function updateCargoAppearance(): void {
    for (const run of cargoView.removeChildren()) run.destroy();
    const textures = cargo.map((block) => getBaseBlockTexture(block.texture));
    for (let start = 0; start < cargo.length;) {
      const texture = textures[start];
      let end = start + 1;
      while (end < cargo.length && textures[end] === texture) end++;
      for (let index = start; index < end; index++) {
        cargo[index].texture = getStackedBlockTexture(texture, index > start, index + 1 < end);
      }
      cargoView.addChild(createCargoRun(cargo[start], end - start));
      start = end;
    }
  }
  updateCargoAppearance();

  function isComplete(): boolean {
    if (cargo.length !== truckCapacity) return false;
    const first = getBaseBlockTexture(cargo[0].texture);
    return cargo.every((block) => getBaseBlockTexture(block.texture) === first);
  }

  function markComplete(): void {
    body.eventMode = 'none';
    body.cursor = 'default';
    const texture = getBaseBlockTexture(cargo[0].texture);
    const color = blockColors.find((color) => art.blocks[color] === texture) ?? 'white';
    const checkmark = truck.addChild(new Graphics()
      .moveTo(-6, 0).lineTo(-2, 4).lineTo(6, -5)
      .stroke({ color: completionCheckColors[color], width: 3, cap: 'round', join: 'round' }));
    checkmark.position.set(centerX, cargoBottom - cargoHeight / 2);
    checkmark.eventMode = 'none';
  }

  function canUnload(): boolean {
    return body.eventMode === 'static' && !conveyor.isUnloading(distance)
      && !loading.some((block) => block.landed < block.pieces.length);
  }

  const startsComplete = isComplete();
  body.eventMode = arrival ? 'none' : 'static';
  body.cursor = 'pointer';
  if (startsComplete) markComplete();
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
    const texture = getBaseBlockTexture(first.texture);
    while (runLength < cargo.length && getBaseBlockTexture(cargo[runLength].texture) === texture) runLength++;

    const moved = conveyor.addBlocks(cargo.slice(0, runLength), distance, sourceOffsetY);
    cargo.splice(0, moved);
    if (moved > 0) updateCargoAppearance();
    return movedPieces > 0 || moved > 0;
  }

  function receive(piece: Piece): boolean {
    if (body.eventMode !== 'static' || conveyor.isUnloading(distance)) return false;
    const texture = piece.blockTexture;
    let block = loading.at(-1);
    const top = block?.sprite ?? cargo[0];
    if (top && getBaseBlockTexture(top.texture) !== texture) return false;

    if (!block || block.pieces.length === piecesPerBlock) {
      if (cargo.length + loading.length >= truckCapacity) return false;
      const sprite = new Sprite(getStackedBlockTexture(texture, false, Boolean(top)));
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
    if (arrival && parkingElapsed < openingArrivalDuration) {
      parkingElapsed = Math.min(openingArrivalDuration, parkingElapsed + deltaMS);
      if (parkingElapsed <= 0) return false;
      truck.visible = true;
      const drive = Math.min(1, parkingElapsed / openingDriveDuration);
      const settle = Math.max(0, (parkingElapsed - openingDriveDuration) / openingSettleDuration);
      const travel = drive * (0.85 + 0.15 * drive);
      const rebound = -16 * Math.sin(2 * Math.PI * settle) * (1 - settle) ** 2;
      truck.y = centerY + arrival.distance * (1 - travel) + rebound;
      if (!startsComplete && parkingElapsed === openingArrivalDuration) body.eventMode = 'static';
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
      cargo.unshift(block.sprite);
      updateCargoAppearance();
      if (isComplete()) {
        markComplete();
        events.onComplete(truck.x, truck.y);
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
      return { x: centerX, y: Math.max(truckTop + 44, top.y + 12) };
    },
  };
}

export function createBoard(
  art: TruckArt, conveyor: ConveyorInput, events: TruckEvents,
  { entranceY, opening, easyStart }: { entranceY: number; opening: boolean; easyStart: boolean },
) {
  const board = new Container();
  const loads = createTruckLoads(easyStart);
  const belt = board.addChild(createConveyor());
  const { minX: firstTruckLeft, width: beltWidth } = belt.getLocalBounds();
  const truckSpacing = (beltWidth - art.body.width) / (loads.length - 1);

  const middleLane = (loads.length - 1) / 2;
  const openingOrder = loads.map((_, lane) => lane)
    .sort((left, right) => Math.abs(left - middleLane) - Math.abs(right - middleLane));
  const trucks = loads.map((blocks, lane) => {
    const arrival = opening
      ? { distance: entranceY - truckTop, delay: openingOrder.indexOf(lane) * openingStagger }
      : undefined;
    return addTruck(board, firstTruckLeft + lane * truckSpacing, blocks, art, conveyor, events, arrival);
  });

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
