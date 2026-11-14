import { Rectangle, Sprite, Texture } from 'pixi.js';
import { loopLength, positionOnConveyor } from './conveyor-path';
import { getLoosePieceTexture } from './truck-art';

const columns = 4;
const rows = 4;
export const piecesPerBlock = columns * rows;
export const pieceFlightDuration = 300;
const beltLanes = 3;
const pieceSize = 11;
const pieceWidth = 12;
const collisionDiameter = pieceSize;
const laneLimit = 8;
const blockTiles = new WeakMap<Texture, Texture[]>();
const tileBlocks = new WeakMap<Texture, Texture>();

export type Piece = {
  sprite: Sprite;
  blockTexture: Texture;
  distance: number;
  lane: number;
  forwardVelocity: number;
  laneVelocity: number;
  speedFactor: number;
  driftPhase: number;
  from: ReturnType<typeof readPose>;
};

export function wrapDistance(distance: number): number {
  return ((distance % loopLength) + loopLength) % loopLength;
}

function getBlockTiles(texture: Texture): Texture[] {
  let tiles = blockTiles.get(texture);
  if (!tiles) {
    const { frame, source } = texture;
    const tileWidth = frame.width / columns;
    const tileHeight = frame.height / rows;
    tiles = Array.from({ length: piecesPerBlock }, (_, index) => new Texture({
      source,
      frame: new Rectangle(
        frame.x + (index % columns) * tileWidth,
        frame.y + cellRow(index) * tileHeight,
        tileWidth,
        tileHeight,
      ),
    }));
    for (const tile of tiles) tileBlocks.set(tile, texture);
    blockTiles.set(texture, tiles);
  }
  return tiles;
}

function cellRow(index: number): number {
  return rows - 1 - Math.floor(index / columns);
}

function blockCell(block: Sprite, index: number) {
  const width = block.width / columns;
  const height = block.height / rows;
  return {
    x: block.x + (index % columns + 0.5) * width,
    y: block.y + (cellRow(index) + 0.5) * height,
    width, height,
  };
}

export function createPieces(block: Sprite): Sprite[] {
  const tiles = getBlockTiles(block.texture);
  // Unload from top right to bottom left, the reverse of stacking order.
  return tiles.map((_, departureIndex) => {
    const index = piecesPerBlock - 1 - departureIndex;
    const { x, y, width, height } = blockCell(block, index);
    const sprite = new Sprite(tiles[index]);
    sprite.anchor.set(0.5);
    sprite.setSize(width, height);
    sprite.position.set(x, y);
    return sprite;
  });
}

function readPose(sprite: Sprite) {
  const { x, y, width, height, rotation } = sprite;
  return { x, y, width, height, rotation };
}

export function launchPiece(sprite: Sprite, entry: number, index: number, count: number): Piece {
  const laneIndex = (index + 1) % beltLanes;
  const piecesInLane = Math.ceil((count - index % beltLanes) / beltLanes);
  const offset = (Math.floor(index / beltLanes) - (piecesInLane - 1) / 2) * pieceSize
    + (Math.random() - 0.5) * 3;
  return {
    sprite, blockTexture: tileBlocks.get(sprite.texture) ?? sprite.texture, from: readPose(sprite),
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

export function renderPiece(piece: Piece, progress: number, launching: boolean): void {
  const { sprite, lane } = piece;
  const heading = positionOnConveyor(sprite, piece.distance);
  const x = sprite.x - Math.sin(heading) * lane;
  const y = sprite.y + Math.cos(heading) * lane;
  const rotation = Math.sin(piece.distance * 0.08 + piece.driftPhase) * 0.45 + piece.laneVelocity * 0.025;
  if (launching) {
    if (progress === 1) sprite.texture = getLoosePieceTexture(piece.blockTexture);
    animatePieceFlight(piece, x, y, pieceWidth, pieceSize, rotation, progress);
  } else {
    sprite.position.set(x, y);
    sprite.rotation = rotation;
  }
}

export function preparePieceToStack(piece: Piece, index: number, block: Sprite): void {
  const { sprite } = piece;
  piece.from = readPose(sprite);
  sprite.texture = getBlockTiles(block.texture)[index];
  sprite.setSize(piece.from.width, piece.from.height);
}

export function stackPiece(piece: Piece, index: number, block: Sprite, progress: number): void {
  const { x, y, width, height } = blockCell(block, index);
  animatePieceFlight(piece, x, y, width, height, 0, progress);
}

function animatePieceFlight(
  piece: Piece, x: number, y: number, width: number, height: number, rotation: number, progress: number,
): void {
  const { sprite, from } = piece;
  sprite.position.set(from.x + (x - from.x) * progress, from.y + (y - from.y) * progress);
  sprite.setSize(from.width + (width - from.width) * progress, from.height + (height - from.height) * progress);
  sprite.rotation = from.rotation + (rotation - from.rotation) * progress;
}
