import { Container, Sprite, Texture, type PointData } from 'pixi.js';
import { positionOnConveyor, wrapDistance } from './conveyor-path';
import { createCubeBody, readCubeVelocity } from './conveyor-physics';
import { createStretchableBlock, getBaseBlockTexture, getLoosePieceTexture, getPieceShineTexture } from './truck-art';

const columns = 4;
const stackRows = 2;
const depthLayers = 2;
const piecesPerRow = columns * depthLayers;
const stackDepthOffset = 2.2;
export const piecesPerBlock = piecesPerRow * stackRows;
export const pieceFlightDuration = 370;
export const pieceStackDuration = pieceFlightDuration + 65;
const beltLanes = 3;
const pieceHeight = 10;
const pieceWidth = 11;
const launchLaneSpacing = 10;

export type Piece = {
  sprite: Sprite;
  shine: Sprite;
  body: ReturnType<typeof createCubeBody>;
  blockTexture: Texture;
  distance: number;
  lane: number;
  speedFactor: number;
  sizeOffset: number;
  from: ReturnType<typeof readPose>;
};

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

function readPose(sprite: Sprite, velocity: PointData = { x: 0, y: 0 }) {
  const { x, y, width, height, rotation } = sprite;
  return { x, y, width, height, rotation, velocity };
}

export function launchPiece(sprite: Sprite, entry: number, index: number): Piece {
  const laneIndex = (index + 1) % beltLanes;
  const offset = (Math.random() - 0.5) * 4;
  const sizeOffset = Math.floor(Math.random() * 3) - 1;
  const body = createCubeBody(pieceWidth + sizeOffset, pieceHeight + sizeOffset, (Math.random() - 0.5) * 0.4);
  sprite.alpha = 1;
  return {
    sprite, shine: new Sprite({ texture: getPieceShineTexture(sprite.texture), anchor: 0.5, eventMode: 'none' }),
    body,
    blockTexture: getBaseBlockTexture(sprite.texture), from: readPose(sprite),
    distance: wrapDistance(entry + offset),
    lane: (laneIndex - 1) * launchLaneSpacing,
    speedFactor: 0.96 + Math.random() * 0.08,
    sizeOffset,
  };
}

export function renderPieceOnBelt(piece: Piece): void {
  const { sprite, body, sizeOffset } = piece;
  sprite.position.copyFrom(body.position);
  sprite.rotation = body.angle;
  sprite.setSize(pieceWidth + sizeOffset, pieceHeight + sizeOffset);
  updatePieceShine(piece);
}

export function renderPieceLaunch(piece: Piece, elapsed: number, speed: number): void {
  const { sprite, sizeOffset } = piece;
  const approach = (elapsed - pieceFlightDuration) / 1000 * speed * piece.speedFactor;
  positionOnConveyor(sprite.position, wrapDistance(piece.distance + approach), piece.lane);
  const progress = elapsed / pieceFlightDuration;
  const blend = progress * progress * (3 - 2 * progress);
  animatePieceFlight(piece, sprite.x, sprite.y, pieceWidth + sizeOffset, pieceHeight + sizeOffset, piece.body.angle, blend);
  sprite.y -= 10 * (4 * progress * (1 - progress)) ** 2;
  updatePieceShine(piece);
}

function updatePieceShine({ sprite, shine }: Pick<Piece, 'sprite' | 'shine'>): void {
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
  piece.from = readPose(sprite, readCubeVelocity(piece.body));
  piece.from.rotation = Math.atan2(Math.sin(piece.from.rotation), Math.cos(piece.from.rotation));
  sprite.texture = getLoosePieceTexture(piece.blockTexture);
  sprite.setSize(piece.from.width, piece.from.height);
}

export function landingProgress(elapsed: number): number {
  return Math.max(0, Math.min(1, (elapsed - pieceFlightDuration) / (pieceStackDuration - pieceFlightDuration)));
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

export function stackPiece(piece: Piece, index: number, block: Sprite, elapsed: number, truckOffset: PointData): number {
  const { x, y, width, height } = stackCell(block, index);
  const travel = Math.min(1, elapsed / pieceFlightDuration);
  animatePieceFlight(piece, x + truckOffset.x, y + truckOffset.y, width, height, 0, travel * travel * (3 - 2 * travel));
  const momentum = elapsed / 1000 * (1 - travel) ** 2;
  piece.sprite.x += piece.from.velocity.x * momentum;
  piece.sprite.y += piece.from.velocity.y * momentum;
  const contact = landingProgress(elapsed);
  if (contact > 0) {
    const squash = Math.sin(Math.PI * contact);
    piece.sprite.setSize(width * (1 + 0.18 * squash), height * (1 - 0.28 * squash));
    piece.sprite.y += height * 0.14 * squash;
    piece.sprite.alpha = 1 - contact;
  }
  updatePieceShine(piece);
  return y;
}

function animatePieceFlight(
  piece: Piece, x: number, y: number, width: number, height: number, rotation: number, progress: number,
): void {
  const { sprite, from } = piece;
  sprite.position.set(from.x + (x - from.x) * progress, from.y + (y - from.y) * progress);
  sprite.setSize(from.width + (width - from.width) * progress, from.height + (height - from.height) * progress);
  sprite.rotation = from.rotation + (rotation - from.rotation) * progress;
}
