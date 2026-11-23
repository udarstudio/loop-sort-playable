import { Container, Graphics, Sprite } from 'pixi.js';
import type { createConveyorCargo } from './conveyor-cargo';
import { conveyorEntryDistance } from './conveyor-path';
import {
  createStackFill, landingProgress, pieceFlightDuration, pieceLandingTime, piecesPerBlock, preparePieceToStack,
  stackPiece, type Piece,
} from './conveyor-pieces';
import { blockColors, createCargoRun, type BlockColor, type TruckArt } from './truck-art';
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
const unloadHopDuration = 180;
const completionCheckColors = { pink: 0x7b1f53, orange: 0x834018, white: 0x635773 };

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
    return [
      [
        ...Array<BlockColor>(4).fill(blocker),
        firstMatch, firstMatch,
        secondMatch, secondMatch,
        ...Array<BlockColor>(3).fill(firstMatch),
        ...Array<BlockColor>(5).fill(secondMatch),
      ],
      [blocker, firstMatch],
      [
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
    ];
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

type ConveyorInput = Pick<ReturnType<typeof createConveyorCargo>, 'unload' | 'availablePieces' | 'isUnloading'>;

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
  conveyor: ConveyorInput, events: TruckEvents, canTap: () => boolean,
) {
  const truck = board.addChild(new Container());
  let unloadHopElapsed = unloadHopDuration;

  const body = new Sprite(art.body);
  body.position.set(left, truckTop);
  truck.addChild(body);
  truck.addChild(createTruckHeadlights()).position.copyFrom(body.position);
  const centerX = body.x + body.width / 2;
  const centerY = truckTop + body.height / 2;
  truck.pivot.set(centerX, centerY);
  truck.position.set(centerX, centerY);

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
  const fill = createStackFill(art.blocks[blocks[0]], blockHeight);
  cargoView.addChild(fill.view);
  let topRunLength = 0;

  function updateStackFill(): void {
    const top = cargo[0] ?? loading[0]?.sprite;
    fill.view.visible = Boolean(top);
    if (!top) return;

    let pieces = topRunLength * piecesPerBlock;
    for (const block of loading) {
      for (const { elapsed } of block.pieces) pieces += landingProgress(elapsed);
    }
    fill.view.position.set(cargoX, cargoBottom - (cargo.length - topRunLength) * blockHeight);
    fill.update(top.texture, pieces);
  }

  function updateCargoAppearance(): void {
    while (cargoView.children.length > 1) cargoView.removeChildAt(1).destroy();
    topRunLength = 0;
    for (let start = 0; start < cargo.length;) {
      const { texture } = cargo[start];
      let end = start + 1;
      while (end < cargo.length && cargo[end].texture === texture) end++;
      if (start === 0) topRunLength = end;
      else cargoView.addChild(createCargoRun(cargo[start], end - start));
      start = end;
    }
    updateStackFill();
  }
  updateCargoAppearance();

  function hasMixedCargo(): boolean {
    // Incoming pieces always match the exposed cargo color.
    const texture = cargo[0]?.texture;
    return cargo.some((block) => block.texture !== texture);
  }

  function isComplete(): boolean {
    return cargo.length === truckCapacity && !hasMixedCargo();
  }

  function markComplete(): void {
    body.eventMode = 'none';
    body.cursor = 'default';
    const { texture } = cargo[0];
    const color = blockColors.find((color) => art.blocks[color] === texture) ?? 'white';
    const checkmark = truck.addChild(new Graphics()
      .moveTo(-6, 0).lineTo(-2, 4).lineTo(6, -5)
      .stroke({ color: completionCheckColors[color], width: 3, cap: 'round', join: 'round' }));
    checkmark.position.set(centerX, cargoBottom - cargoHeight / 2);
    checkmark.eventMode = 'none';
  }

  function canUnload(): boolean {
    return canTap() && body.eventMode === 'static' && !conveyor.isUnloading(distance)
      && !loading.some((block) => block.landed < block.pieces.length);
  }

  body.eventMode = 'static';
  body.cursor = 'pointer';
  if (isComplete()) markComplete();
  body.on('pointertap', ({ button }) => {
    if (button !== 0 || !canUnload() || !unload()) return;
    unloadHopElapsed = 0;
    events.onUnload();
  });

  const sourceOffsetY = () => truck.y - centerY;

  function unload(): boolean {
    const top = loading.at(-1)?.sprite ?? cargo[0];
    if (!top) return false;

    const { texture } = top;
    const partial = loading.flatMap((block) => block.pieces.map(({ piece }) => piece.sprite)).reverse();
    const initialPieces = topRunLength * piecesPerBlock + partial.length;
    const moved = conveyor.unload(partial, cargo.slice(0, topRunLength), distance, sourceOffsetY, (departed, finished) => {
      if (finished) updateCargoAppearance();
      else fill.update(texture, initialPieces - departed);
    });

    let remaining = moved.pieces;
    while (remaining > 0) {
      const block = loading[loading.length - 1];
      const removed = Math.min(remaining, block.pieces.length);
      block.pieces.length -= removed;
      block.landed = block.pieces.length;
      remaining -= removed;
      if (block.pieces.length === 0) {
        loading.pop();
        block.sprite.destroy();
      }
    }
    cargo.splice(0, moved.blocks);
    return moved.pieces > 0 || moved.blocks > 0;
  }

  function receive(piece: Piece): boolean {
    if (body.eventMode !== 'static' || conveyor.isUnloading(distance)) return false;
    const texture = piece.blockTexture;
    let block = loading.at(-1);
    const top = block?.sprite ?? cargo[0];
    if (top && top.texture !== texture) return false;

    if (!block || block.pieces.length === piecesPerBlock) {
      if (cargo.length + loading.length >= truckCapacity) return false;
      const sprite = new Sprite(texture);
      sprite.height = blockHeight;
      sprite.position.set(cargoX, cargoBottom - (cargo.length + loading.length + 1) * blockHeight);
      block = { sprite, pieces: [], landed: 0 };
      loading.push(block);
    }

    preparePieceToStack(piece);
    block.pieces.push({ piece, elapsed: 0 });
    return true;
  }

  function advance(deltaMS: number): boolean {
    if (unloadHopElapsed < unloadHopDuration) {
      unloadHopElapsed = Math.min(unloadHopDuration, unloadHopElapsed + deltaMS);
      const progress = unloadHopElapsed / unloadHopDuration;
      truck.y = centerY - 5 * Math.sin(Math.PI * progress) ** 2;
    }

    let pieceLanded = false;
    for (const block of loading) {
      for (let index = block.landed; index < block.pieces.length; index++) {
        const flight = block.pieces[index];
        const previousElapsed = flight.elapsed;
        flight.elapsed = Math.min(pieceFlightDuration, flight.elapsed + deltaMS);
        stackPiece(flight.piece, index, block.sprite, flight.elapsed);
        if (previousElapsed < pieceLandingTime && flight.elapsed >= pieceLandingTime) pieceLanded = true;
        if (flight.elapsed === pieceFlightDuration) {
          flight.piece.sprite.removeFromParent();
          flight.piece.shine.destroy();
          block.landed++;
        }
      }
    }

    const previousCargoLength = cargo.length;
    while (loading[0]?.landed === piecesPerBlock) {
      const block = loading.shift()!;
      for (const { piece } of block.pieces) piece.sprite.destroy();
      cargo.unshift(block.sprite);
    }
    if (cargo.length !== previousCargoLength) {
      updateCargoAppearance();
      if (isComplete()) {
        markComplete();
        events.onComplete(truck.x, truck.y);
      }
    } else if (loading.length > 0 && !conveyor.isUnloading(distance)) {
      updateStackFill();
    }
    return pieceLanded;
  }

  return {
    distance, receive, advance, isComplete, hasMixedCargo,
    isEmpty: () => cargo.length === 0 && loading.length === 0,
    hint() {
      const top = loading.at(-1)?.sprite ?? cargo[0];
      if (!top || !canUnload() || conveyor.availablePieces() < (loading.length ? 1 : piecesPerBlock)) return;
      return { x: centerX, y: Math.max(truckTop + 44, top.y + 12) };
    },
  };
}

export function createBoard(
  art: TruckArt, conveyor: ReturnType<typeof createConveyorCargo>, events: TruckEvents,
  { easyStart }: { easyStart: boolean },
) {
  const board = new Container();
  const loads = createTruckLoads(easyStart);
  let openingLoad = easyStart ? loads[1] : undefined;
  const laneLoads = easyStart ? shuffle([...loads]) : loads;
  if (openingLoad) {
    const match = art.blocks[openingLoad[1]];
    conveyor.preload(Array.from({ length: truckCapacity - 1 }, () => match));
  }

  const belt = board.addChild(createConveyor());
  const { minX: firstTruckLeft, width: beltWidth } = belt.getLocalBounds();
  const truckSpacing = (beltWidth - art.body.width) / (loads.length - 1);

  const truckEvents = {
    ...events,
    onUnload() {
      openingLoad = undefined;
      events.onUnload();
    },
  };
  // Reserve the last slot for the blocker so the first move always opens the belt.
  const trucks = laneLoads.map((blocks, lane) => addTruck(
    board, firstTruckLeft + lane * truckSpacing, blocks, art, conveyor, truckEvents,
    () => !openingLoad || openingLoad === blocks,
  ));

  return {
    view: board,
    receivers: trucks,
    tutorial: {
      // Start with the opening truck, then the three-layer truck. Follow the loads through the shuffle.
      trucks: easyStart ? [1, 4, 5, 3, 0, 2].map(index => trucks[laneLoads.indexOf(loads[index])]) : trucks,
      openingTapped: easyStart ? () => openingLoad === undefined : undefined,
    },
    advance(deltaMS: number) {
      let pieceLanded = false;
      for (const truck of trucks) {
        if (truck.advance(deltaMS)) pieceLanded = true;
      }
      if (pieceLanded) events.onPieceLanded();
    },
  };
}
