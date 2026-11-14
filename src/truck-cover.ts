import { Container, Graphics } from 'pixi.js';
import type { BlockColor } from './truck-art';

const coverColors = {
  pink: { face: 0xf655b1, edge: 0xc73584, highlight: 0xff93cf, check: 0x7b1f53 },
  orange: { face: 0xfba45e, edge: 0xcb6d35, highlight: 0xffcc96, check: 0x834018 },
  white: { face: 0xece9f1, edge: 0xbab4c7, highlight: 0xffffff, check: 0x635773 },
} as const;
const foldDuration = 600;
const lidOpacity = 0.8;

export function createTruckCover(color: BlockColor, width: number, height: number, animate: boolean) {
  const { face, edge, highlight, check } = coverColors[color];
  const x = width / 2;
  const y = height / 2;
  const view = new Container();
  view.eventMode = 'none';
  view.addChild(new Graphics()
    .rect(0, 0, width, height).fill({ color: edge, alpha: lidOpacity })
    .roundRect(1, 0, width - 2, height - 3, 3).cut()
    .roundRect(1, 0, width - 2, height - 3, 3).fill({ color: face, alpha: lidOpacity })
    .roundRect(3, 3, width - 6, 1.5, 0.75).fill({ color: highlight, alpha: 0.6 })
    .roundRect(3, 8, 1, height - 19, 0.5).fill({ color: highlight, alpha: 0.35 }));
  const checkmark = view.addChild(new Graphics()
    .moveTo(x - 6, y).lineTo(x - 2, y + 4).lineTo(x + 6, y - 5)
    .stroke({ color: check, width: 3, cap: 'round', join: 'round' }));

  let elapsed = animate ? 0 : foldDuration;
  if (animate) {
    view.scale.x = 0;
    checkmark.alpha = 0;
  }

  function advance(deltaMS: number): void {
    if (elapsed >= foldDuration) return;
    elapsed = Math.min(foldDuration, elapsed + deltaMS);
    const progress = elapsed / foldDuration;
    // Project the lid from edge-on to flat, with the left edge fixed at the hinge.
    view.scale.x = Math.sin(progress ** 1.4 * Math.PI / 2);
    view.skew.y = progress === 1 ? 0 : -0.18 * Math.sin(Math.PI * progress);
    checkmark.alpha = Math.max(0, (progress - 0.65) / 0.35);
  }

  return { view, advance };
}
