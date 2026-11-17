import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { loopLength, positionOnConveyor } from './conveyor-path';
import { createStretchableBlock, getBaseBlockTexture, getLoosePieceTexture } from './truck-art';

const columns = 4;
const stackRows = 2;
const depthLayers = 2;
const rows = stackRows * depthLayers;
const stackDepthOffset = 2.2;
export const piecesPerBlock = columns * rows;
export const pieceFlightDuration = 300;
export const pieceLandingTime = 235;
const beltLanes = 3;
const pieceSize = 11;
const pieceWidth = 12;
const collisionDiameter = pieceSize;
const laneLimit = 10;
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
  sizeOffset: number;
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
    const block = getBaseBlockTexture(texture);
    for (const tile of tiles) tileBlocks.set(tile, block);
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
  sprite.alpha = 1;
  return {
    sprite, blockTexture: tileBlocks.get(sprite.texture) ?? getBaseBlockTexture(sprite.texture), from: readPose(sprite),
    distance: wrapDistance(entry + offset),
    lane: (laneIndex - 1) * laneLimit,
    speedFactor: 0.84 + Math.random() * 0.32,
    driftPhase: Math.random() * 2 * Math.PI,
    forwardVelocity: (Math.random() - 0.5) * 18,
    laneVelocity: (Math.random() - 0.5) * 18,
    sizeOffset: Math.floor(Math.random() * 3) - 1,
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
    animatePieceFlight(piece, x, y, pieceWidth + piece.sizeOffset, pieceSize + piece.sizeOffset, rotation, progress);
  } else {
    sprite.position.set(x, y);
    sprite.rotation = rotation;
  }
}

export function preparePieceToStack(piece: Piece): void {
  const { sprite } = piece;
  piece.from = readPose(sprite);
  sprite.texture = getLoosePieceTexture(piece.blockTexture);
  sprite.setSize(piece.from.width, piece.from.height);
}

export function landingProgress(elapsed: number): number {
  return Math.max(0, Math.min(1, (elapsed - pieceLandingTime) / (pieceFlightDuration - pieceLandingTime)));
}

export function createStackFill(texture: Texture, blockHeight: number) {
  const view = new Container({ eventMode: 'none' });
  const rowHeight = blockHeight / stackRows;
  const piecesPerRow = columns * depthLayers;

  function addFace() {
    const image = createStretchableBlock(texture);
    image.anchor.y = 1;
    image.scale.y = blockHeight / texture.height;
    const mask = new Graphics({ visible: false }).rect(0, -1, 1, 1).fill(0xffffff);
    view.addChild(image, mask);
    return { image, mask };
  }

  const rear = addFace();
  rear.image.tint = 0xe3dbee;
  const frontRight = addFace();
  const frontLeft = addFace();

  function showFace(
    { image, mask }: ReturnType<typeof addFace>, texture: Texture, height: number, left: number, right: number,
  ): void {
    image.visible = height > 0 && left < right;
    if (!image.visible) return;

    if (image.texture !== texture) image.texture = texture;
    const unscaledHeight = height / image.scale.y;
    if (image.height !== unscaledHeight) image.height = unscaledHeight;

    const cropped = left > 0 || right < texture.width;
    image.mask = cropped ? mask : null;
    mask.visible = cropped;
    if (cropped) {
      mask.x = left;
      mask.scale.set(right - left, height);
    }
  }

  function update(texture: Texture, settledBlocks: number, arrivingPieces: number): void {
    const completeRows = Math.floor(arrivingPieces / piecesPerRow);
    const rowProgress = arrivingPieces % piecesPerRow;
    const height = settledBlocks * blockHeight + completeRows * rowHeight;
    const grownHeight = height + rowHeight;
    const width = texture.width;
    const rearWidth = Math.min(1, rowProgress / columns) * width;
    const split = Math.max(0, rowProgress / columns - 1) * width;

    // The rear fills from left to right. Then the front's taller half grows across it.
    showFace(rear, texture, grownHeight - stackDepthOffset, 0, rearWidth);
    showFace(frontRight, texture, height, split > 0 ? split : width, width);
    showFace(frontLeft, texture, split > 0 ? grownHeight : height, 0, split > 0 ? split : width);
  }

  return { view, update };
}

export function stackPiece(piece: Piece, index: number, block: Sprite, elapsed: number): void {
  const rowIndex = Math.floor(index / columns);
  const lowerLayer = rowIndex % depthLayers === 0;
  const row = stackRows - 1 - Math.floor(rowIndex / depthLayers);
  const rowHeight = block.height / stackRows;
  const columnWidth = block.width / columns;
  const x = block.x + (index % columns + 0.5) * columnWidth;
  const y = block.y + (row + 0.5) * rowHeight + (lowerLayer ? stackDepthOffset / 2 : 0);
  const width = columnWidth * 0.94;
  const height = rowHeight * 0.94;
  const travel = Math.min(1, elapsed / pieceLandingTime);
  animatePieceFlight(piece, x, y, width, height, 0, travel * travel * (3 - 2 * travel));
  const contact = landingProgress(elapsed);
  if (contact > 0) {
    const squash = Math.sin(Math.PI * contact);
    piece.sprite.setSize(width * (1 + 0.18 * squash), height * (1 - 0.28 * squash));
    piece.sprite.y += height * 0.14 * squash;
    piece.sprite.alpha = 1 - contact;
  }
}

function animatePieceFlight(
  piece: Piece, x: number, y: number, width: number, height: number, rotation: number, progress: number,
): void {
  const { sprite, from } = piece;
  sprite.position.set(from.x + (x - from.x) * progress, from.y + (y - from.y) * progress);
  sprite.setSize(from.width + (width - from.width) * progress, from.height + (height - from.height) * progress);
  sprite.rotation = from.rotation + (rotation - from.rotation) * progress;
}
