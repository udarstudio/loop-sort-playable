import { Container, Sprite, type PointData, type Texture } from 'pixi.js';
import { baseConveyorSpeed, distanceOnConveyor, loopLength, wrapDistance } from './conveyor-path';
import { createConveyorPhysics } from './conveyor-physics';
import {
  createPieces,
  launchPiece,
  pieceFlightDuration,
  piecesPerBlock,
  renderPieceLaunch,
  renderPieceOnBelt,
  type Piece,
} from './conveyor-pieces';

export const conveyorCapacity = 16;

export const conveyorPieceCapacity = conveyorCapacity * piecesPerBlock;
const pieceDepartureInterval = 36;
const loadingReach = 6;
const speedResponseMS = 180;
const loadedSpeedBoost = 1.25;

function targetSpeed(blocks: number): number {
  if (blocks === 0) return baseConveyorSpeed;
  return baseConveyorSpeed * loadedSpeedBoost * (blocks <= 14 ? 3.5 : 2.5);
}

export type ConveyorReceiver = {
  distance: number;
  receive(piece: Piece): boolean;
  canReceiveColor(texture: Texture): boolean;
  hasPartialCargo(): boolean;
};

type BeltPiece = Piece & {
  elapsed: number;
  previousDistance: number;
  sourceDistance: number;
  canReturnToSource: boolean;
  sourceOffset?: PointData;
};

type Departure = {
  count: number;
  inFlight: number;
  remaining: number;
  started: number;
  onProgress?: (departed: number, finished: boolean, started: number) => void;
};

export function createConveyorCargo(onCountChange: (count: number) => void, onPieceDeparture: (y: number) => void) {
  const view = new Container();
  const belt: BeltPiece[] = [];
  const piecesBySprite = new WeakMap<Container, Piece>();
  const departures = new Map<number, Departure>();
  const physics = createConveyorPhysics();
  let speed = baseConveyorSpeed;

  function blockCount(): number {
    return Math.ceil(belt.length / piecesPerBlock);
  }

  function availablePieces(): number {
    return conveyorPieceCapacity - belt.length;
  }

  function attachPiece(piece: BeltPiece): void {
    view.addChild(piece.sprite, piece.shine);
    piecesBySprite.set(piece.sprite, piece);
    belt.push(piece);
  }

  function* visiblePieces(): IterableIterator<Piece> {
    for (const child of view.children) {
      const piece = piecesBySprite.get(child);
      if (piece?.sprite.visible) yield piece;
    }
  }

  function isJammed(receivers: readonly ConveyorReceiver[]): boolean {
    const space = availablePieces();
    if (space >= piecesPerBlock || departures.size > 0) return false;
    if (space > 0 && receivers.some((truck) => truck.hasPartialCargo())) return false;
    // A matching cube can still reach its truck later, even if it just passed it.
    return !belt.some((piece) => receivers.some((truck) => truck.canReceiveColor(piece.blockTexture)));
  }

  function preload(blocks: readonly Texture[]): void {
    const sprites = blocks.flatMap(texture => {
      const block = new Sprite(texture);
      const pieces = createPieces(block);
      block.destroy();
      return pieces;
    });
    speed = targetSpeed(blockCount() + blocks.length);
    for (const [index, sprite] of sprites.entries()) {
      const entry = loopLength * (index + 0.5) / sprites.length;
      const piece = launchPiece(sprite, entry, index);
      physics.add(piece.body, piece.distance, piece.lane, speed, piece.speedFactor);
      renderPieceOnBelt(piece);
      attachPiece({
        ...piece, elapsed: pieceFlightDuration, previousDistance: piece.distance,
        sourceDistance: -1, canReturnToSource: true,
      });
    }
    onCountChange(blockCount());
  }

  function launch(
    sprites: readonly Sprite[], count: number, sourceDistance: number,
    firstIndex: number, sourceOffset: PointData,
  ): void {
    for (let index = 0; index < count; index++) {
      const piece = launchPiece(sprites[index], sourceDistance, firstIndex + index);
      piece.sprite.visible = false;
      piece.shine.visible = false;
      attachPiece({
        ...piece, elapsed: -(firstIndex + index) * pieceDepartureInterval,
        previousDistance: piece.distance, sourceDistance, canReturnToSource: false, sourceOffset,
      });
    }
  }

  function unload(
    pieces: readonly Sprite[], blocks: readonly Sprite[], sourceDistance: number,
    sourceOffset: PointData, onProgress: NonNullable<Departure['onProgress']>,
  ): { pieces: number; blocks: number } {
    const before = blockCount();
    const space = availablePieces();
    const addedPieces = Math.min(pieces.length, space);
    const addedBlocks = Math.min(blocks.length, Math.floor((space - addedPieces) / piecesPerBlock));
    const count = addedPieces + addedBlocks * piecesPerBlock;
    if (count === 0) return { pieces: 0, blocks: 0 };

    departures.set(sourceDistance, { count, inFlight: count, remaining: count, started: 0, onProgress });
    launch(pieces, addedPieces, sourceDistance, 0, sourceOffset);
    for (let index = 0; index < addedBlocks; index++) {
      const block = blocks[index];
      const sprites = createPieces(block);
      launch(sprites, sprites.length, sourceDistance, addedPieces + index * piecesPerBlock, sourceOffset);
      block.destroy();
    }
    if (blockCount() !== before) onCountChange(blockCount());
    return { pieces: addedPieces, blocks: addedBlocks };
  }

  function advance(deltaMS: number, receivers: readonly ConveyorReceiver[]): number {
    if (deltaMS <= 0) return 0;
    const before = blockCount();
    const target = targetSpeed(before);
    const nextSpeed = target + (speed - target) * Math.exp(-deltaMS / speedResponseMS);
    const beltTravel = (target * deltaMS + (speed - nextSpeed) * speedResponseMS) / 1000;
    speed = nextSpeed;
    if (belt.length === 0) return beltTravel;

    physics.advance(deltaMS, beltTravel * 1000 / deltaMS);

    let departedY: number | undefined;
    for (const departure of departures.values()) departure.remaining = 0;
    for (const piece of belt) {
      piece.previousDistance = piece.distance;
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
          departure.started++;
          piece.sprite.visible = true;
          departedY ??= piece.from.y;
          const offset = piece.sourceOffset!;
          piece.from.x += offset.x;
          piece.from.y += offset.y;
          piece.sourceOffset = undefined;
        }
        if (piece.elapsed < pieceFlightDuration) {
          renderPieceLaunch(piece, piece.elapsed, speed);
          continue;
        }
        departure.inFlight--;
        physics.add(piece.body, piece.distance, piece.lane, speed, piece.speedFactor);
      }
      piece.distance = distanceOnConveyor(piece.body.position);
      renderPieceOnBelt(piece);
      if (piece.previousDistance - piece.distance > loopLength / 2) piece.canReturnToSource = true;
    }
    for (const [source, departure] of departures) {
      const finished = departure.remaining === 0;
      departure.onProgress?.(departure.count - departure.remaining, finished, departure.started);
      if (finished) departure.onProgress = undefined;
      if (departure.inFlight === 0) departures.delete(source);
    }
    if (departedY !== undefined) onPieceDeparture(departedY);

    // Process leading pieces first when several reach the same truck in one frame.
    belt.sort((a, b) => a.distance - b.distance);
    for (let index = belt.length - 1; index >= 0; index--) {
      const piece = belt[index];
      if (piece.elapsed < pieceFlightDuration) continue;
      // Impacts can push cubes backward. Test the swept interval in either direction.
      const travel = wrapDistance(piece.distance - piece.previousDistance + loopLength / 2) - loopLength / 2;
      const start = travel < 0 ? piece.distance : piece.previousDistance;
      for (const receiver of receivers) {
        if (receiver.distance === piece.sourceDistance && !piece.canReturnToSource) continue;
        const distanceAhead = wrapDistance(receiver.distance - start + loadingReach);
        if (distanceAhead > Math.abs(travel) + 2 * loadingReach) continue;

        if (!receiver.receive(piece)) continue;
        physics.remove(piece.body);
        belt.splice(index, 1);
        break;
      }
    }

    if (blockCount() !== before) onCountChange(blockCount());
    return beltTravel;
  }

  return {
    view, preload, unload, advance, availablePieces, isJammed, visiblePieces,
    isUnloading: (sourceDistance: number) => departures.has(sourceDistance),
  };
}
