import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import atlasUrl from './assets/truck-atlas.png';

export const blockColors = ['pink', 'orange', 'white'] as const;
export type BlockColor = typeof blockColors[number];

export type TruckArt = {
  body: Texture;
  blocks: Record<BlockColor, Texture>;
};

export const blockHeight = 15;
const loosePieceCornerRatio = 0.28;
const blockWidth = 28;
const blockX = 46;
const blockY = { pink: 0, orange: 17, white: 34 } as const;
const blockCornerRadius = 2;
const loosePieceY = { pink: 52, orange: 69, white: 86 } as const;
const loosePieceTextures = new WeakMap<Texture, Texture>();
const bodyWidth = 44;
const bodyHeight = 297;
const atlasResolution = 2;

export function getLoosePieceTexture(block: Texture): Texture {
  return loosePieceTextures.get(block) ?? block;
}

export async function loadTruckArt(): Promise<TruckArt> {
  const image = new Image();
  image.src = atlasUrl;
  await image.decode();

  const atlas = document.createElement('canvas');
  atlas.width = image.naturalWidth;
  atlas.height = image.naturalHeight;
  const context = atlas.getContext('2d');
  if (!context) throw new Error('Could not create the truck texture atlas.');
  context.drawImage(image, 0, 0);
  for (const color of blockColors) {
    const x = blockX * atlasResolution;
    const y = blockY[color] * atlasResolution;
    const width = blockWidth * atlasResolution;
    const height = blockHeight * atlasResolution;
    context.clearRect(x, y, width, height);
    context.save();
    context.beginPath();
    const radius = blockCornerRadius * atlasResolution;
    context.roundRect(x, y, width, height, [radius, radius, 0, 0]);
    context.clip();
    context.drawImage(image, x, y, width, height, x, y, width, height);
    context.restore();

    // Bake rounded belt sprites into free space in the same atlas.
    const pieceY = loosePieceY[color] * atlasResolution;
    context.save();
    context.beginPath();
    context.roundRect(x, pieceY, width, height, { x: width * loosePieceCornerRatio, y: height * loosePieceCornerRatio });
    context.clip();
    context.drawImage(image, x, y, width, height, x, pieceY, width, height);
    context.restore();
  }

  const source = new CanvasSource({ resource: atlas, resolution: atlasResolution });
  const blockTexture = (y: number) => new Texture({
    source,
    frame: new Rectangle(blockX, y, blockWidth, blockHeight),
  });
  const blocks = { pink: blockTexture(blockY.pink), orange: blockTexture(blockY.orange), white: blockTexture(blockY.white) };
  for (const color of blockColors) loosePieceTextures.set(blocks[color], blockTexture(loosePieceY[color]));
  const body = new Texture({ source, frame: new Rectangle(0, 0, bodyWidth, bodyHeight) });

  return { body, blocks };
}
