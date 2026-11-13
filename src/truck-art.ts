import { ImageSource, Rectangle, Texture } from 'pixi.js';
import atlasUrl from './assets/truck-atlas.png';

export type BlockColor = 'pink' | 'orange' | 'white';

export type TruckArt = {
  body: Texture;
  blocks: Record<BlockColor, Texture>;
};

export const blockHeight = 15;

export async function loadTruckArt(): Promise<TruckArt> {
  const image = new Image();
  image.src = atlasUrl;
  await image.decode();

  const source = new ImageSource({ resource: image, resolution: 2 });
  const blockTexture = (y: number) => new Texture({
    source,
    frame: new Rectangle(46, y, 28, blockHeight),
  });

  return {
    body: new Texture({ source, frame: new Rectangle(0, 0, 44, 297) }),
    blocks: {
      pink: blockTexture(0),
      orange: blockTexture(17),
      white: blockTexture(34),
    },
  };
}
