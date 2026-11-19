import { Container, type Sprite } from 'pixi.js';
import { baseConveyorSpeed, loopLength } from './conveyor-path';
import {
  createPieces,
  launchPiece,
  movePiece,
  pieceFlightDuration,
  piecesPerBlock,
  renderPiece,
  resolvePieceCollisions,
  wrapDistance,
  type Piece,
} from './conveyor-pieces';

export const conveyorCapacity = 16;

const pieceCapacity = conveyorCapacity * piecesPerBlock;
const pieceDepartureInterval = 36;
const launchSpacing = 13;
const loadingReach = 6;

export type ConveyorReceiver = {
  distance: number;
  receive(piece: Piece): boolean;
};

type BeltPiece = Piece & {
  elapsed: number;
  previousDistance: number;
  sourceDistance: number;
  canReturnToSource: boolean;
  sourceOffsetY?: () => number;
};

type Departure = {
  count: number;
  inFlight: number;
  remaining: number;
  onProgress?: (departed: number, finished: boolean) => void;
};

export function createConveyorCargo(onCountChange: (count: number) => void, onPieceDeparture: () => void) {
  const view = new Container();
  const belt: BeltPiece[] = [];
  const moving: BeltPiece[] = [];
  const departures = new Map<number, Departure>();

  function blockCount(): number {
    return Math.ceil(belt.length / piecesPerBlock);
  }

  function availablePieces(): number {
    return pieceCapacity - belt.length;
  }

  function launch(
    sprites: readonly Sprite[], count: number, sourceDistance: number, entry: number,
    firstIndex: number, sourceOffsetY: () => number,
  ): void {
    for (let index = 0; index < count; index++) {
      const piece = launchPiece(sprites[index], entry, index, count);
      piece.sprite.visible = false;
      piece.shine.visible = false;
      view.addChild(piece.sprite, piece.shine);
      belt.push({
        ...piece, elapsed: -(firstIndex + index) * pieceDepartureInterval,
        previousDistance: piece.distance, sourceDistance, canReturnToSource: false, sourceOffsetY,
      });
    }
  }

  function unload(
    pieces: readonly Sprite[], blocks: readonly Sprite[], sourceDistance: number,
    sourceOffsetY: () => number, onProgress: NonNullable<Departure['onProgress']>,
  ): { pieces: number; blocks: number } {
    const before = blockCount();
    const space = availablePieces();
    const addedPieces = Math.min(pieces.length, space);
    const addedBlocks = Math.min(blocks.length, Math.floor((space - addedPieces) / piecesPerBlock));
    const count = addedPieces + addedBlocks * piecesPerBlock;
    if (count === 0) return { pieces: 0, blocks: 0 };

    departures.set(sourceDistance, { count, inFlight: count, remaining: count, onProgress });
    launch(pieces, addedPieces, sourceDistance, sourceDistance, 0, sourceOffsetY);
    for (let index = 0; index < addedBlocks; index++) {
      const block = blocks[index];
      const entry = wrapDistance(sourceDistance - index * launchSpacing);
      const sprites = createPieces(block);
      launch(sprites, sprites.length, sourceDistance, entry, addedPieces + index * piecesPerBlock, sourceOffsetY);
      block.destroy();
    }
    if (blockCount() !== before) onCountChange(blockCount());
    return { pieces: addedPieces, blocks: addedBlocks };
  }

  function advance(deltaMS: number, receivers: readonly ConveyorReceiver[]): number {
    if (deltaMS <= 0) return 0;
    const before = blockCount();
    const speed = baseConveyorSpeed * (before === 0 ? 1 : before <= 14 ? 3.5 : 2.5);

    if (belt.length === 0) return speed * deltaMS / 1000;

    moving.length = 0;
    for (const piece of belt) {
      piece.previousDistance = piece.distance;
      if (piece.elapsed === pieceFlightDuration) moving.push(piece);
    }
    const steps = Math.ceil(deltaMS / 16.67);
    const seconds = deltaMS / steps / 1000;
    for (let step = 0; step < steps; step++) {
      for (const piece of moving) movePiece(piece, seconds, speed);
      resolvePieceCollisions(moving);
    }

    let pieceDeparted = false;
    for (const departure of departures.values()) departure.remaining = 0;
    for (const piece of belt) {
      const launching = piece.elapsed < pieceFlightDuration;
      const waiting = piece.elapsed <= 0;
      piece.elapsed = Math.min(pieceFlightDuration, piece.elapsed + deltaMS);
      if (launching) {
        const departure = departures.get(piece.sourceDistance)!;
        const progress = Math.max(0, Math.min(1, piece.elapsed / pieceDepartureInterval));
        departure.remaining += 1 - progress;
        if (piece.elapsed <= 0) continue;

        piece.sprite.alpha = progress;
        if (waiting) {
          piece.sprite.visible = true;
          piece.from.y += piece.sourceOffsetY!();
          piece.sourceOffsetY = undefined;
          pieceDeparted = true;
        }
        if (piece.elapsed === pieceFlightDuration) departure.inFlight--;
      }
      renderPiece(piece, piece.elapsed / pieceFlightDuration, launching);
      if (piece.distance < piece.previousDistance) piece.canReturnToSource = true;
    }
    for (const [source, departure] of departures) {
      const finished = departure.remaining === 0;
      departure.onProgress?.(departure.count - departure.remaining, finished);
      if (finished) departure.onProgress = undefined;
      if (departure.inFlight === 0) departures.delete(source);
    }
    if (pieceDeparted) onPieceDeparture();

    // Process leading pieces first when several reach the same truck in one frame.
    belt.sort((a, b) => a.distance - b.distance);
    for (let index = belt.length - 1; index >= 0; index--) {
      const piece = belt[index];
      if (piece.elapsed < pieceFlightDuration) continue;
      const travel = wrapDistance(piece.distance - piece.previousDistance);
      for (const receiver of receivers) {
        if (receiver.distance === piece.sourceDistance && !piece.canReturnToSource) continue;
        const distanceAhead = wrapDistance(receiver.distance - piece.previousDistance + loadingReach);
        if (distanceAhead > travel + 2 * loadingReach) continue;

        if (!receiver.receive(piece)) continue;
        belt.splice(index, 1);
        break;
      }
    }

    if (blockCount() !== before) onCountChange(blockCount());
    return speed * deltaMS / 1000;
  }

  return {
    view, unload, advance, availablePieces,
    isUnloading: (sourceDistance: number) => departures.has(sourceDistance),
  };
}
