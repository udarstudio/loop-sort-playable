import { CanvasSource, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js';
import blueBlockUrl from './assets/blocks/blue.png';
import orangeBlockUrl from './assets/blocks/orange.png';
import pinkBlockUrl from './assets/blocks/pink.png';
import roseBlockUrl from './assets/blocks/rose.png';
import whiteBlockUrl from './assets/blocks/white.png';
import yellowBlockUrl from './assets/blocks/yellow.png';
import truckBodyUrl from './assets/truck-body.png';

export const blockColors = ['pink', 'orange', 'white'] as const;
export type BlockColor = typeof blockColors[number];

export type TruckArt = {
  body: Texture;
  blocks: Record<BlockColor, Texture>;
};

export const blockHeight = 15;
const loosePieceCornerRatio = 0.4;
const blockWidth = 28;
// Both variants use the same color IDs for the puzzle layout.
const blockUrls = import.meta.env.VITE_PLAYABLE_VARIANT === 'alternative'
  ? { pink: roseBlockUrl, orange: yellowBlockUrl, white: blueBlockUrl }
  : { pink: pinkBlockUrl, orange: orangeBlockUrl, white: whiteBlockUrl };
const blockX = 46;
const blockY = { pink: 0, orange: 17, white: 34 } as const;
const blockTopHeight = 5;
const blockBottomHeight = 6;
const loosePieceY = { pink: 52, orange: 69, white: 86 } as const;
const loosePieces = new WeakMap<Texture, Texture>();
const baseBlocks = new WeakMap<Texture, Texture>();
const bodyWidth = 44;
const bodyHeight = 297;
const atlasResolution = 2;

export function getLoosePieceTexture(block: Texture): Texture {
  return loosePieces.get(block) ?? block;
}

export function getBaseBlockTexture(texture: Texture): Texture {
  return baseBlocks.get(texture) ?? texture;
}

export function createStretchableBlock(texture: Texture, height = texture.height): NineSliceSprite {
  return new NineSliceSprite({
    texture,
    leftWidth: 0,
    rightWidth: 0,
    topHeight: blockTopHeight,
    bottomHeight: blockBottomHeight,
    height,
  });
}

export function createCargoRun(first: Sprite, length: number): Sprite | NineSliceSprite {
  const { texture } = first;
  const view = length === 1 ? new Sprite(texture) : createStretchableBlock(texture, texture.height * length);
  view.position.copyFrom(first.position);
  view.scale.set(first.width / texture.width, first.height / texture.height);
  return view;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function loadTruckArt(): Promise<TruckArt> {
  const [truckImage, ...blockImages] = await Promise.all([
    loadImage(truckBodyUrl),
    ...blockColors.map((color) => loadImage(blockUrls[color])),
  ]);
  const atlas = document.createElement('canvas');
  atlas.width = (blockX + blockWidth) * atlasResolution;
  atlas.height = bodyHeight * atlasResolution;
  const context = atlas.getContext('2d');
  if (!context) throw new Error('Could not create the truck texture atlas.');
  context.drawImage(truckImage, 0, 0, bodyWidth * atlasResolution, bodyHeight * atlasResolution);
  for (const [index, color] of blockColors.entries()) {
    const blockImage = blockImages[index];
    const x = blockX * atlasResolution;
    const y = blockY[color] * atlasResolution;
    const width = blockWidth * atlasResolution;
    const height = blockHeight * atlasResolution;
    context.drawImage(blockImage, x, y, width, height);

    // Bake rounded belt sprites into free space in the same atlas.
    const pieceY = loosePieceY[color] * atlasResolution;
    context.save();
    context.beginPath();
    context.roundRect(x, pieceY, width, height, { x: width * loosePieceCornerRatio, y: height * loosePieceCornerRatio });
    context.clip();
    context.drawImage(blockImage, x, pieceY, width, height);
    context.restore();
  }

  const source = new CanvasSource({ resource: atlas, resolution: atlasResolution });
  const blockTexture = (y: number) => new Texture({
    source,
    frame: new Rectangle(blockX, y, blockWidth, blockHeight),
  });
  const blocks = { pink: blockTexture(blockY.pink), orange: blockTexture(blockY.orange), white: blockTexture(blockY.white) };
  for (const color of blockColors) {
    const loose = blockTexture(loosePieceY[color]);
    loosePieces.set(blocks[color], loose);
    baseBlocks.set(loose, blocks[color]);
  }
  const body = new Texture({ source, frame: new Rectangle(0, 0, bodyWidth, bodyHeight) });

  return { body, blocks };
}
