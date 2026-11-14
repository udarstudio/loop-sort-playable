import { FillGradient, Graphics } from 'pixi.js';

let glow: FillGradient | undefined;

export function createTruckHeadlights(): Graphics {
  glow ??= new FillGradient({
    type: 'radial',
    colorStops: [
      { offset: 0, color: '#ffdf82c0' },
      { offset: 0.35, color: '#ffc85466' },
      { offset: 1, color: '#ffb04f00' },
    ],
  });

  const lights = new Graphics();
  lights.eventMode = 'none';
  for (const x of [11.5, 32]) {
    lights
      .ellipse(x, 293, 10, 14).fill(glow)
      .roundRect(x - 2.5, 288.5, 5, 1.5, 0.75).fill(0xffdc7e)
      .roundRect(x - 1.75, 288.75, 3.5, 0.75, 0.375).fill(0xfff4ca);
  }
  return lights;
}
