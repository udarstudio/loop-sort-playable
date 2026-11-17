import { CanvasSource, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js';
import orangeBlockUrl from './assets/blocks/orange.png';
import pinkBlockUrl from './assets/blocks/pink.png';
import whiteBlockUrl from './assets/blocks/white.png';
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
const blockUrls = { pink: pinkBlockUrl, orange: orangeBlockUrl, white: whiteBlockUrl };
const blockX = 46;
const blockY = { pink: 0, orange: 17, white: 34 } as const;
const blockTopHeight = 5;
const blockBottomHeight = 6;
const loosePieceY = { pink: 52, orange: 69, white: 86 } as const;
const bottomBlockOffset = 104;
const topBlockOffset = 155;
const blockStyles = new WeakMap<Texture, {
  block: Texture;
  top: Texture;
  middle: Texture;
  bottom: Texture;
  loose: Texture;
}>();
const bodyWidth = 44;
const bodyHeight = 297;
const atlasResolution = 2;

export function getLoosePieceTexture(block: Texture): Texture {
  return blockStyles.get(block)?.loose ?? block;
}

export function getBaseBlockTexture(texture: Texture): Texture {
  return blockStyles.get(texture)?.block ?? texture;
}

export function getStackedBlockTexture(texture: Texture, sameAbove: boolean, sameBelow: boolean): Texture {
  const style = blockStyles.get(texture);
  if (!style) return texture;
  if (sameAbove) return sameBelow ? style.middle : style.bottom;
  return sameBelow ? style.top : style.block;
}

export function createCargoRun(first: Sprite, length: number): Sprite | NineSliceSprite {
  const texture = getBaseBlockTexture(first.texture);
  const view = length === 1 ? new Sprite(texture) : new NineSliceSprite({
    texture,
    leftWidth: 0,
    rightWidth: 0,
    topHeight: blockTopHeight,
    bottomHeight: blockBottomHeight,
    height: texture.height * length,
  });
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

    // The pieces waiting to depart use the same caps and center as the solid run.
    const bottomY = (blockY[color] + bottomBlockOffset) * atlasResolution;
    const topY = (blockY[color] + topBlockOffset) * atlasResolution;
    const topCap = blockTopHeight * atlasResolution;
    const bottomCap = blockBottomHeight * atlasResolution;
    const middleHeight = height - topCap - bottomCap;
    context.drawImage(atlas, x, y, width, topCap, x, topY, width, topCap);
    context.drawImage(atlas, x, y + topCap, width, middleHeight, x, topY + topCap, width, height - topCap);
    context.drawImage(atlas, x, y + topCap, width, middleHeight, x, bottomY, width, height - bottomCap);
    context.drawImage(atlas, x, y + height - bottomCap, width, bottomCap, x, bottomY + height - bottomCap, width, bottomCap);
  }

  const source = new CanvasSource({ resource: atlas, resolution: atlasResolution });
  const blockTexture = (y: number, height = blockHeight) => new Texture({
    source,
    frame: new Rectangle(blockX, y, blockWidth, height),
  });
  const blocks = { pink: blockTexture(blockY.pink), orange: blockTexture(blockY.orange), white: blockTexture(blockY.white) };
  for (const color of blockColors) {
    const style = {
      block: blocks[color],
      top: blockTexture(blockY[color] + topBlockOffset),
      middle: blockTexture(blockY[color] + blockTopHeight, blockHeight - blockTopHeight - blockBottomHeight),
      bottom: blockTexture(blockY[color] + bottomBlockOffset),
      loose: blockTexture(loosePieceY[color]),
    };
    for (const texture of Object.values(style)) blockStyles.set(texture, style);
  }
  const body = new Texture({ source, frame: new Rectangle(0, 0, bodyWidth, bodyHeight) });

  return { body, blocks };
}
