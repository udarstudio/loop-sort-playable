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

export function createConveyorCargo(onCountChange: (count: number) => void, onPieceDeparture: () => void) {
  const view = new Container();
  const belt: BeltPiece[] = [];
  const moving: BeltPiece[] = [];
  const departures = new Map<number, number>();

  function blockCount(): number {
    return Math.ceil(belt.length / piecesPerBlock);
  }

  function availablePieces(): number {
    return pieceCapacity - belt.length;
  }

  function launch(
    sprites: readonly Sprite[], count: number, sourceDistance: number, entry: number,
    delay: number, sourceOffsetY?: () => number,
  ): void {
    if (count === 0) return;
    departures.set(sourceDistance, (departures.get(sourceDistance) ?? 0) + count);
    for (let index = 0; index < count; index++) {
      const piece = launchPiece(sprites[index], entry, index, count);
      piece.sprite.y = piece.from.y + (sourceOffsetY?.() ?? 0);
      view.addChild(piece.sprite);
      belt.push({
        ...piece, elapsed: -delay - index * pieceDepartureInterval,
        previousDistance: piece.distance, sourceDistance, canReturnToSource: false, sourceOffsetY,
      });
    }
  }

  function addPieces(sprites: readonly Sprite[], sourceDistance: number, sourceOffsetY?: () => number): number {
    const before = blockCount();
    const added = Math.min(sprites.length, availablePieces());
    launch(sprites, added, sourceDistance, sourceDistance, 0, sourceOffsetY);
    if (blockCount() !== before) onCountChange(blockCount());
    return added;
  }

  function addBlocks(blocks: readonly Sprite[], sourceDistance: number, sourceOffsetY?: () => number): number {
    const before = blockCount();
    const added = Math.min(blocks.length, Math.floor(availablePieces() / piecesPerBlock));
    for (let index = 0; index < added; index++) {
      const block = blocks[index];
      const entry = wrapDistance(sourceDistance - index * launchSpacing);
      const sprites = createPieces(block);
      launch(sprites, sprites.length, sourceDistance, entry, index * piecesPerBlock * pieceDepartureInterval, sourceOffsetY);
      block.destroy();
    }
    if (blockCount() !== before) onCountChange(blockCount());
    return added;
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
    for (const piece of belt) {
      const launching = piece.elapsed < pieceFlightDuration;
      const waiting = piece.elapsed <= 0;
      piece.elapsed = Math.min(pieceFlightDuration, piece.elapsed + deltaMS);
      if (waiting && piece.sourceOffsetY) {
        piece.sprite.y = piece.from.y + piece.sourceOffsetY();
        if (piece.elapsed > 0) piece.from.y = piece.sprite.y;
      }
      if (piece.elapsed <= 0) continue;
      if (waiting) pieceDeparted = true;
      renderPiece(piece, piece.elapsed / pieceFlightDuration, launching);
      if (piece.distance < piece.previousDistance) piece.canReturnToSource = true;
      if (launching && piece.elapsed === pieceFlightDuration) {
        const remaining = departures.get(piece.sourceDistance)! - 1;
        if (remaining === 0) departures.delete(piece.sourceDistance);
        else departures.set(piece.sourceDistance, remaining);
      }
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
    view, addBlocks, addPieces, advance, availablePieces,
    isUnloading: (sourceDistance: number) => departures.has(sourceDistance),
  };
}
