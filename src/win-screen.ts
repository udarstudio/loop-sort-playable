import { Container, ImageSource, Matrix, Rectangle, Sprite, Texture } from 'pixi.js';
import logoData from './assets/win-logo-frames.json';
import logoUrl from './assets/win-logo.png';
import { createWinConfetti } from './win-confetti';

export async function createWinScreen(animate: boolean) {
  const image = new Image();
  image.src = logoUrl;
  await image.decode();

  const view = new Container({ visible: false, eventMode: 'none' });
  const backdrop = view.addChild(new Sprite(Texture.WHITE));
  backdrop.tint = 0x000000;
  backdrop.alpha = animate ? 0 : 1;
  const confetti = animate ? createWinConfetti() : undefined;
  if (confetti) view.addChild(confetti.view);
  const logo = view.addChild(new Container({ visible: false }));
  const source = new ImageSource({ resource: image });
  const parts = logoData.regions.map(([x, y, width, height]) => {
    const texture = new Texture({ source, frame: new Rectangle(x, y, width, height) });
    return logo.addChild(new Sprite({ texture, anchor: 0.5 }));
  });
  const matrix = new Matrix();
  const fadeDuration = animate ? 400 : 0;
  let elapsed = 0;

  function resize(width: number, height: number): void {
    backdrop.setSize(width, height);
    confetti?.resize(width, height);
    logo.position.set(width / 2, height * 0.39);
    logo.scale.set(Math.min(width * 0.78, height * 0.77, 520) / logoData.width);
  }

  function advance(deltaMS: number, playSound: () => void): boolean {
    const previousTime = elapsed - fadeDuration;
    elapsed += deltaMS;
    const time = elapsed - fadeDuration;
    if (animate) backdrop.alpha = Math.min(1, elapsed / fadeDuration);
    if (time < 0) return true;

    if (!logo.visible) {
      logo.visible = true;
      playSound();
    }
    const frames = logoData.frames;
    const frame = (animate ? Math.min(1, time / logoData.duration) : 1) * (frames.length - 1);
    const index = Math.floor(frame);
    const progress = frame - index;
    const next = frames[Math.min(index + 1, frames.length - 1)];
    for (const [part, sprite] of parts.entries()) {
      const [a, b, c, d, x, y, alpha] = frames[index][part]
        .map((value, field) => value + (next[part][field] - value) * progress);
      sprite.setFromMatrix(matrix.set(a, b, c, d, x, y));
      sprite.alpha = alpha;
    }
    if (confetti && previousTime < logoData.firework && time >= logoData.firework) {
      confetti.burst();
    }
    confetti?.advance(Math.min(deltaMS, Math.max(0, time - logoData.firework)));
    return animate && (time < logoData.duration || Boolean(confetti?.view.children.length));
  }

  return { view, resize, advance };
}
