import { Container, Sprite, Texture, type PointData } from 'pixi.js';
import { loopLength, positionOnConveyor } from './conveyor-path';
import { createStretchableBlock, getBaseBlockTexture, getLoosePieceTexture, getPieceShineTexture } from './truck-art';

const columns = 4;
const stackRows = 2;
const depthLayers = 2;
const piecesPerRow = columns * depthLayers;
const stackDepthOffset = 2.2;
export const piecesPerBlock = piecesPerRow * stackRows;
export const pieceFlightDuration = 300;
export const pieceLandingTime = 235;
const beltLanes = 3;
const pieceSize = 11;
const pieceWidth = 12;
const collisionDiameter = pieceSize;
const laneLimit = 10;

export type Piece = {
  sprite: Sprite;
  shine: Sprite;
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

function stackCell(block: Sprite, index: number) {
  const rear = Math.floor(index / columns) % depthLayers === 0;
  const row = stackRows - 1 - Math.floor(index / piecesPerRow);
  const rowHeight = block.height / stackRows;
  const columnWidth = block.width / columns;
  return {
    x: block.x + (index % columns + 0.5) * columnWidth,
    y: block.y + (row + 0.5) * rowHeight + (rear ? stackDepthOffset / 2 : 0),
    width: columnWidth * 0.94,
    height: rowHeight * 0.94,
  };
}

export function stackSide(index: number): number {
  const column = index % columns;
  return column === 0 ? -1 : column === columns - 1 ? 1 : 0;
}

export function createPieces(block: Sprite): Sprite[] {
  const texture = getLoosePieceTexture(block.texture);
  // Unload from top right to bottom left, the reverse of stacking order.
  return Array.from({ length: piecesPerBlock }, (_, departureIndex) => {
    const index = piecesPerBlock - 1 - departureIndex;
    const { x, y, width, height } = stackCell(block, index);
    const sprite = new Sprite(texture);
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

export function launchPiece(sprite: Sprite, entry: number, index: number, count: number, span?: number): Piece {
  const laneIndex = (index + 1) % beltLanes;
  const piecesInLane = Math.ceil((count - index % beltLanes) / beltLanes);
  const spacing = span === undefined ? pieceSize : span / Math.ceil(count / beltLanes);
  const offset = (Math.floor(index / beltLanes) - (piecesInLane - 1) / 2) * spacing
    + (Math.random() - 0.5) * 3;
  sprite.alpha = 1;
  return {
    sprite, shine: new Sprite({ texture: getPieceShineTexture(sprite.texture), anchor: 0.5, eventMode: 'none' }),
    blockTexture: getBaseBlockTexture(sprite.texture), from: readPose(sprite),
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
    animatePieceFlight(piece, x, y, pieceWidth + piece.sizeOffset, pieceSize + piece.sizeOffset, rotation, progress);
  } else {
    sprite.position.set(x, y);
    sprite.rotation = rotation;
  }
  updatePieceShine(piece);
}

function updatePieceShine({ sprite, shine }: Piece): void {
  const size = Math.min(sprite.width, sprite.height);
  const turn = Math.sin(sprite.rotation * 2);
  const facing = (Math.cos(sprite.rotation * 2) + 1) / 2;
  // Both reflections are positioned within the same texture over the cube's face.
  shine.position.set(sprite.x - size * turn * 0.025, sprite.y + size * (facing - 1) * 0.015);
  shine.setSize(size);
  shine.alpha = sprite.alpha * (0.45 + facing * 0.08);
  shine.visible = sprite.visible;
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

  function addFace() {
    const image = createStretchableBlock(new Texture({ source: texture.source, frame: texture.frame, dynamic: true }));
    image.anchor.y = 1;
    image.scale.y = blockHeight / texture.height;
    return view.addChild(image);
  }

  const rear = addFace();
  rear.tint = 0xe3dbee;
  const frontRight = addFace();
  const frontLeft = addFace();

  function showFace(
    image: ReturnType<typeof addFace>, texture: Texture, height: number, left: number, right: number,
  ): void {
    image.visible = height > 0 && left < right;
    if (!image.visible) return;

    // Clip the atlas frame instead of masking the moving stack in the renderer.
    const { frame } = image.texture;
    const width = right - left;
    const atlasX = texture.frame.x + left;
    if (frame.x !== atlasX || frame.y !== texture.frame.y || frame.width !== width) {
      frame.x = atlasX;
      frame.y = texture.frame.y;
      frame.width = width;
      image.texture.update();
    }
    image.x = left;
    const unscaledHeight = height / image.scale.y;
    if (image.width !== width || image.height !== unscaledHeight) image.setSize(width, unscaledHeight);
  }

  function update(texture: Texture, pieces: number): void {
    const completeRows = Math.floor(pieces / piecesPerRow);
    const rowProgress = pieces % piecesPerRow;
    const height = completeRows * rowHeight;
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

export function stackPiece(piece: Piece, index: number, block: Sprite, elapsed: number, truckOffset: PointData): void {
  const { x, y, width, height } = stackCell(block, index);
  const travel = Math.min(1, elapsed / pieceLandingTime);
  animatePieceFlight(piece, x + truckOffset.x, y + truckOffset.y, width, height, 0, travel * travel * (3 - 2 * travel));
  const contact = landingProgress(elapsed);
  if (contact > 0) {
    const squash = Math.sin(Math.PI * contact);
    piece.sprite.setSize(width * (1 + 0.18 * squash), height * (1 - 0.28 * squash));
    piece.sprite.y += height * 0.14 * squash;
    piece.sprite.alpha = 1 - contact;
  }
  updatePieceShine(piece);
}

function animatePieceFlight(
  piece: Piece, x: number, y: number, width: number, height: number, rotation: number, progress: number,
): void {
  const { sprite, from } = piece;
  sprite.position.set(from.x + (x - from.x) * progress, from.y + (y - from.y) * progress);
  sprite.setSize(from.width + (width - from.width) * progress, from.height + (height - from.height) * progress);
  sprite.rotation = from.rotation + (rotation - from.rotation) * progress;
}
