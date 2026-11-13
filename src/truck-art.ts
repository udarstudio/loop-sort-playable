import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import atlasUrl from './assets/truck-atlas.png';

export const blockColors = ['pink', 'orange', 'white'] as const;
export type BlockColor = typeof blockColors[number];

export type TruckArt = {
  body: Texture;
  blocks: Record<BlockColor, Texture>;
  completedBodies: ReadonlyMap<Texture, Texture>;
};

export const blockHeight = 15;
const bodyWidth = 44;
const bodyHeight = 297;
const atlasResolution = 2;
const bodyPaint = {
  pink: [222, 72, 151],
  orange: [233, 129, 61],
  white: [211, 208, 219],
} as const;

function paintBody(pixels: ImageData, [red, green, blue]: readonly [number, number, number]): void {
  const { data } = pixels;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    // Recolor the violet paint, keeping the yellow headlights and alpha.
    if (b <= Math.max(r, g) || data[index + 3] === 0) continue;

    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shade = Math.min(light / 128, 1);
    const highlight = Math.max((light - 128) / 127, 0);
    data[index] = red * shade + (255 - red) * highlight;
    data[index + 1] = green * shade + (255 - green) * highlight;
    data[index + 2] = blue * shade + (255 - blue) * highlight;
  }
}

export async function loadTruckArt(): Promise<TruckArt> {
  const image = new Image();
  image.src = atlasUrl;
  await image.decode();

  // Pack the painted bodies beside the original art so all sprites share one texture source.
  const pixelWidth = bodyWidth * atlasResolution;
  const pixelHeight = bodyHeight * atlasResolution;
  const atlas = document.createElement('canvas');
  atlas.width = image.naturalWidth + blockColors.length * pixelWidth;
  atlas.height = image.naturalHeight;
  const context = atlas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create the truck texture atlas.');
  context.drawImage(image, 0, 0);
  blockColors.forEach((color, index) => {
    const pixels = context.getImageData(0, 0, pixelWidth, pixelHeight);
    paintBody(pixels, bodyPaint[color]);
    context.putImageData(pixels, image.naturalWidth + index * pixelWidth, 0);
  });

  const source = new CanvasSource({ resource: atlas, resolution: atlasResolution });
  const blockTexture = (y: number) => new Texture({
    source,
    frame: new Rectangle(46, y, 28, blockHeight),
  });
  const blocks = { pink: blockTexture(0), orange: blockTexture(17), white: blockTexture(34) };
  const bodyTexture = (x: number) => new Texture({ source, frame: new Rectangle(x, 0, bodyWidth, bodyHeight) });

  return {
    body: bodyTexture(0),
    blocks,
    completedBodies: new Map(blockColors.map((color, index) => [
      blocks[color], bodyTexture(image.naturalWidth / atlasResolution + index * bodyWidth),
    ])),
  };
}
