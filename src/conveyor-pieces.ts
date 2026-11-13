import { Sprite, type Texture } from 'pixi.js';
import { loopLength, positionOnConveyor } from './conveyor-path';

const columns = 4;
const rows = 4;
export const piecesPerBlock = columns * rows;
const beltLanes = 3;
const pieceSize = 8.5;
const collisionDiameter = pieceSize;
const beltHalfWidth = 15;
const laneLimit = beltHalfWidth - Math.SQRT2 * pieceSize / 2;

export type Piece = {
  sprite: Sprite;
  distance: number;
  lane: number;
  forwardVelocity: number;
  laneVelocity: number;
  speedFactor: number;
  driftPhase: number;
  fromX: number;
  fromY: number;
  fromRotation: number;
};

export function wrapDistance(distance: number): number {
  return ((distance % loopLength) + loopLength) % loopLength;
}

export function createPieces(texture: Texture, x: number, y: number, width: number, height: number): Sprite[] {
  return Array.from({ length: piecesPerBlock }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const fromX = x + (column + 0.5) * width / columns;
    const fromY = y + (row + 0.5) * height / rows;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(fromX, fromY);
    return sprite;
  });
}

export function launchPiece(sprite: Sprite, entry: number, index: number, count: number): Piece {
  sprite.setSize(pieceSize, pieceSize);
  const laneIndex = (index + 1) % beltLanes;
  const piecesInLane = Math.ceil((count - index % beltLanes) / beltLanes);
  const offset = (Math.floor(index / beltLanes) - (piecesInLane - 1) / 2) * pieceSize
    + (Math.random() - 0.5) * 3;
  return {
    sprite, fromX: sprite.x, fromY: sprite.y, fromRotation: sprite.rotation,
    distance: wrapDistance(entry + offset),
    lane: (laneIndex - 1) * laneLimit,
    speedFactor: 0.84 + Math.random() * 0.32,
    driftPhase: Math.random() * 2 * Math.PI,
    forwardVelocity: (Math.random() - 0.5) * 18,
    laneVelocity: (Math.random() - 0.5) * 18,
  };
}

export function movePiece(piece: Piece, seconds: number, beltSpeed: number): void {
  const damping = Math.exp(-4 * seconds);
  const drift = Math.sin(piece.distance / loopLength * 8 * Math.PI + piece.driftPhase) * 20;
  piece.forwardVelocity *= damping;
  piece.laneVelocity = (piece.laneVelocity + drift * seconds) * damping;
  const forwardSpeed = Math.max(beltSpeed * 0.2, beltSpeed * piece.speedFactor + piece.forwardVelocity);
  piece.distance = wrapDistance(piece.distance + forwardSpeed * seconds);
  piece.lane += piece.laneVelocity * seconds;
  if (Math.abs(piece.lane) > laneLimit) {
    piece.lane = Math.sign(piece.lane) * laneLimit;
    piece.laneVelocity *= -0.4;
  }
}

export function resolvePieceCollisions(pieces: Piece[]): void {
  pieces.sort((a, b) => a.distance - b.distance);
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    for (let step = 1; step < pieces.length; step++) {
      const nextIndex = (index + step) % pieces.length;
      const next = pieces[nextIndex];
      const dx = next.distance - piece.distance + (nextIndex < index ? loopLength : 0);
      if (dx >= collisionDiameter) break;
      const dy = next.lane - piece.lane;
      const separation = Math.hypot(dx, dy);
      if (separation >= collisionDiameter) continue;

      const normalX = separation > 0 ? dx / separation : 1;
      const normalY = separation > 0 ? dy / separation : 0;
      const closingSpeed = (piece.forwardVelocity - next.forwardVelocity) * normalX
        + (piece.laneVelocity - next.laneVelocity) * normalY;
      const impulse = (collisionDiameter - separation) * 12 + Math.max(0, closingSpeed) * 0.6;
      piece.forwardVelocity -= impulse * normalX;
      next.forwardVelocity += impulse * normalX;
      piece.laneVelocity -= impulse * normalY;
      next.laneVelocity += impulse * normalY;
    }
  }
}

export function renderPiece(piece: Piece, progress: number): void {
  const { sprite, lane, fromX, fromY } = piece;
  const heading = positionOnConveyor(sprite, piece.distance);
  const x = sprite.x - Math.sin(heading) * lane;
  const y = sprite.y + Math.cos(heading) * lane;
  sprite.position.set(fromX + (x - fromX) * progress, fromY + (y - fromY) * progress);
  const rotation = Math.sin(piece.distance * 0.08 + piece.driftPhase) * 0.45 + piece.laneVelocity * 0.025;
  sprite.rotation = piece.fromRotation + (rotation - piece.fromRotation) * progress;
}

export function stackPiece(piece: Piece, index: number, block: Sprite, progress: number): void {
  const x = block.x + (index % columns + 0.5) * block.width / columns;
  const y = block.y + (rows - Math.floor(index / columns) - 0.5) * block.height / rows;
  piece.sprite.position.set(piece.fromX + (x - piece.fromX) * progress, piece.fromY + (y - piece.fromY) * progress);
  piece.sprite.setSize(pieceSize + (block.width / columns - pieceSize) * progress,
    pieceSize + (block.height / rows - pieceSize) * progress);
  piece.sprite.rotation = piece.fromRotation * (1 - progress);
}
