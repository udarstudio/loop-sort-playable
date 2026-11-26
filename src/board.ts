import { Container, Graphics, Sprite } from 'pixi.js';
import { conveyorCapacity, type createConveyorCargo } from './conveyor-cargo';
import { conveyorEntryDistance } from './conveyor-path';
import {
  createStackFill, landingProgress, pieceFlightDuration, pieceLandingTime, piecesPerBlock, preparePieceToStack,
  stackPiece, stackSide, type Piece,
} from './conveyor-pieces';
import { blockColors, createCargoRun, type BlockColor, type TruckArt } from './truck-art';
import { createTruckHeadlights } from './truck-headlights';

export const boardWidth = 360;
export const boardHeight = 656;
export const conveyorTop = 38;
const conveyorOuter = { x: 24, y: conveyorTop, width: 312, height: 250, radius: 53 };
const conveyorOpening = { x: 60, y: 74, width: 240, height: 178, radius: 17 };
export const conveyorCenter = {
  x: conveyorOpening.x + conveyorOpening.width / 2,
  y: conveyorOpening.y + conveyorOpening.height / 2,
};

const truckCapacity = 16;
const truckTop = 302;
const unloadHopDuration = 180;
const bounceDuration = 500;
const bouncePerPiece = 1;
const bounceMaxDistance = 10;
const sideNudgeDuration = 50;
const restingOffset = { x: 0, y: 0 };
const completionCheckColors = { pink: 0x7b1f53, orange: 0x834018, white: 0x635773 };

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function createTruckLoads(staged: boolean): BlockColor[][] {
  if (staged) {
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

export type PlayableVariant = 'standard' | 'staged' | 'win';
const pinkLanes = [2, 4];
const winOpeningPinkBlocks = 5;
const blockRun = (count: number, color: BlockColor) => Array<BlockColor>(count).fill(color);

function createWinLoads(): BlockColor[][] {
  const firstPinkLoad = 4;
  const secondPinkLoad = conveyorCapacity - 1 - firstPinkLoad - winOpeningPinkBlocks;
  return [
    ['orange', ...blockRun(8, 'white')],
    blockRun(truckCapacity - 1, 'orange'), // Collects the opening blocker.
    [...blockRun(firstPinkLoad, 'pink'), ...blockRun(truckCapacity - firstPinkLoad, 'white')],
    ['orange', 'pink'],
    [...blockRun(secondPinkLoad, 'pink'), ...blockRun(truckCapacity - secondPinkLoad, 'orange')],
    [...blockRun(11, 'orange'), ...blockRun(3, 'white'), ...blockRun(2, 'pink')],
  ];
}

function createConveyor(): Graphics {
  const conveyor = new Graphics();
  const opening = conveyorOpening;
  const outer = conveyorOuter;
  for (const [x, y, width, height, radius, color] of [
    [outer.x, outer.y, outer.width, outer.height, outer.radius, 0x64509b],
    [27, 40, 306, 245, 50, 0x382b58],
    [57, 71, 246, 184, 20, 0x7561af],
  ]) {
    conveyor.roundRect(x, y, width, height, radius).fill(color)
      .roundRect(opening.x, opening.y, opening.width, opening.height, opening.radius).cut();
  }
  return conveyor;
}

function createJamGlow(): Graphics {
  const glow = new Graphics({ visible: false, eventMode: 'none' });
  for (const { x, y, width, height, radius } of [conveyorOuter, conveyorOpening]) {
    for (const [strokeWidth, alpha] of [[20, 0.04], [14, 0.07], [9, 0.13], [5, 0.25], [2, 0.95]]) {
      glow.roundRect(x, y, width, height, radius).stroke({ color: 0xff2440, width: strokeWidth, alpha });
    }
  }
  return glow;
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
  conveyor: ConveyorInput, events: TruckEvents, canTap: () => boolean, animate: boolean,
) {
  const truck = board.addChild(new Container());
  let unloadHopElapsed = unloadHopDuration;
  let bounceRemaining = 0;
  let bouncePeak = 0;
  let recoil = 0;
  let sideNudgeTimeout = 0;

  const body = new Sprite(art.body);
  body.position.set(left, truckTop);
  truck.addChild(body);
  truck.addChild(createTruckHeadlights()).position.copyFrom(body.position);
  const centerX = body.x + body.width / 2;
  const centerY = truckTop + body.height / 2;

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

  function hasCargoInFlight(): boolean {
    return loading.some(block => block.landed < block.pieces.length);
  }

  function canUnload(): boolean {
    return canTap() && body.eventMode === 'static' && !conveyor.isUnloading(distance) && !hasCargoInFlight();
  }

  body.eventMode = 'static';
  body.cursor = 'pointer';
  if (isComplete()) markComplete();
  body.on('pointertap', ({ button }) => {
    if (button !== 0 || !canUnload() || !unload()) return;
    unloadHopElapsed = 0;
    events.onUnload();
  });

  function unload(): boolean {
    const top = loading.at(-1)?.sprite ?? cargo[0];
    if (!top) return false;

    const { texture } = top;
    const partial = loading.flatMap((block) => block.pieces.map(({ piece }) => piece.sprite)).reverse();
    const initialPieces = topRunLength * piecesPerBlock + partial.length;
    let started = 0;
    const moved = conveyor.unload(
      partial, cargo.slice(0, topRunLength), distance, truck.position,
      (departed, finished, piecesStarted) => {
        if (animate && piecesStarted > started) {
          let sideHits = 0;
          // Unloading reverses the stack order, including any partial top block.
          for (let index = started; index < piecesStarted; index++) {
            sideHits += stackSide(initialPieces - 1 - index);
          }
          wobble(started - piecesStarted, -sideHits);
          started = piecesStarted;
        }
        if (finished) updateCargoAppearance();
        else fill.update(texture, initialPieces - departed);
      },
    );

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

  function hasPartialCargo(): boolean {
    const block = loading.at(-1);
    return block !== undefined && block.pieces.length < piecesPerBlock;
  }

  function canReceiveColor(texture: Sprite['texture']): boolean {
    if (body.eventMode !== 'static') return false;
    const block = loading.at(-1);
    const top = block?.sprite ?? cargo[0];
    if (top && top.texture !== texture) return false;
    return cargo.length + loading.length < truckCapacity || hasPartialCargo();
  }

  function receive(piece: Piece): boolean {
    const texture = piece.blockTexture;
    if (conveyor.isUnloading(distance) || !canReceiveColor(texture)) return false;
    let block = loading.at(-1);

    if (!block || block.pieces.length === piecesPerBlock) {
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

  function wobble(pieces: number, sideHits: number): void {
    const nextRecoil = recoil + pieces * bouncePerPiece;
    bouncePeak = Math.max(-bounceMaxDistance, Math.min(bounceMaxDistance, nextRecoil));
    bounceRemaining = bounceDuration;
    if (sideHits === 0) return;

    truck.x = 0.5 * Math.sign(sideHits);
    window.clearTimeout(sideNudgeTimeout);
    sideNudgeTimeout = window.setTimeout(() => {
      truck.x = 0;
    }, sideNudgeDuration);
  }

  function advance(deltaMS: number): boolean {
    const hopping = unloadHopElapsed < unloadHopDuration;
    if (hopping) unloadHopElapsed = Math.min(unloadHopDuration, unloadHopElapsed + deltaMS);
    if (hopping || bounceRemaining > 0 || recoil !== 0) {
      const hop = hopping ? 5 * Math.sin(Math.PI * unloadHopElapsed / unloadHopDuration) ** 2 : 0;
      recoil = bouncePeak * (bounceRemaining / bounceDuration) ** 2;
      truck.y = recoil - hop;
      bounceRemaining = Math.max(0, bounceRemaining - deltaMS);
    }

    let piecesLanded = 0;
    let sideHits = 0;
    for (const block of loading) {
      for (let index = block.landed; index < block.pieces.length; index++) {
        const flight = block.pieces[index];
        const previousElapsed = flight.elapsed;
        flight.elapsed = Math.min(pieceFlightDuration, flight.elapsed + deltaMS);
        const finished = flight.elapsed === pieceFlightDuration;
        stackPiece(flight.piece, index, block.sprite, flight.elapsed, finished ? restingOffset : truck.position);
        if (previousElapsed < pieceLandingTime && flight.elapsed >= pieceLandingTime) {
          piecesLanded++;
          if (animate) sideHits += stackSide(index);
        }
        if (finished) {
          flight.piece.sprite.removeFromParent();
          flight.piece.shine.destroy();
          block.landed++;
        }
      }
    }
    if (animate && piecesLanded > 0) wobble(piecesLanded, sideHits);

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
        events.onComplete(centerX + truck.x, centerY + truck.y);
      }
    } else if (loading.length > 0 && !conveyor.isUnloading(distance)) {
      updateStackFill();
    }
    return piecesLanded > 0;
  }

  return {
    distance, receive, canReceiveColor, hasPartialCargo, advance, isComplete, hasMixedCargo,
    hasCargoInFlight,
    isEmpty: () => cargo.length === 0 && loading.length === 0,
    hint() {
      const top = loading.at(-1)?.sprite ?? cargo[0];
      if (!top || !canUnload() || conveyor.availablePieces() < (loading.length ? 1 : piecesPerBlock)) return;
      return { x: centerX, y: Math.max(truckTop + 44, top.y + 12) };
    },
  };
}

export function createBoard(
  art: TruckArt, conveyor: ReturnType<typeof createConveyorCargo>, events: TruckEvents, variant: PlayableVariant, animate: boolean,
) {
  const board = new Container();
  const fourTapWin = variant === 'win';
  const staged = variant === 'staged';
  const openingLane = fourTapWin ? 0 : 1;
  const loads = fourTapWin ? createWinLoads() : createTruckLoads(staged);
  const hasOpening = staged || fourTapWin;
  let openingLoad = hasOpening ? loads[openingLane] : undefined;
  const laneLoads = staged ? shuffle([...loads]) : loads;
  if (openingLoad) {
    const match = art.blocks[openingLoad[1]];
    const needed = truckCapacity - (openingLoad.length - 1);
    const openingBelt = Array.from({ length: needed }, () => match);
    if (fourTapWin) {
      openingBelt.push(...Array.from({ length: winOpeningPinkBlocks }, () => art.blocks.pink));
    }
    conveyor.preload(openingBelt);
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
  const trucks: ReturnType<typeof addTruck>[] = laneLoads.map((blocks, lane) => addTruck(
    board, firstTruckLeft + lane * truckSpacing, blocks, art, conveyor, truckEvents,
    () => fourTapWin || !openingLoad || openingLoad === blocks, animate,
  ));
  const hintOrder = fourTapWin ? [openingLane, ...pinkLanes] : [1, 4, 5, 3, 0, 2];

  return {
    view: board,
    jamGlow: createJamGlow(),
    receivers: trucks,
    hasWon() {
      if (fourTapWin) {
        return conveyor.availablePieces() === conveyorCapacity * piecesPerBlock
          && trucks.every(truck => !truck.hasCargoInFlight());
      }
      return trucks.every(truck => truck.isComplete());
    },
    tutorial: {
      // Start with the opening truck, then the three-layer truck. Follow the loads through the shuffle.
      trucks: hasOpening ? hintOrder.map(index => trucks[laneLoads.indexOf(loads[index])]) : trucks,
      openingTapped: hasOpening ? () => fourTapWin
        ? !trucks[openingLane].hasMixedCargo()
        : openingLoad === undefined : undefined,
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
