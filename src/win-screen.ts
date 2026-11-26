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
  const confetti = animate ? createWinConfetti() : undefined;
  if (confetti) view.addChild(confetti.view);
  const logo = view.addChild(new Container({ visible: false }));
  const source = new ImageSource({ resource: image });
  const parts = logoData.regions.map(([x, y, width, height]) => {
    const texture = new Texture({ source, frame: new Rectangle(x, y, width, height) });
    return logo.addChild(new Sprite({ texture, anchor: 0.5 }));
  });
  // Use the settled artwork so the title stays centered while the logo animates in.
  const finalPose = logoData.frames.at(-1)!;
  const logoBottom = Math.max(...logoData.regions.map(([, , width, height], index) => {
    const [, b, , d, , y, alpha] = finalPose[index];
    if (alpha === 0) return -Infinity;
    return y + (Math.abs(b) * width + Math.abs(d) * height) / 2;
  }));
  const matrix = new Matrix();
  let elapsed = 0;

  function resize(width: number, height: number): number {
    backdrop.setSize(width, height);
    confetti?.resize(width, height);
    logo.position.set(width / 2, height * 0.39);
    const logoWidth = Math.min(width * 0.78, height * 0.77, 520) * 0.9;
    logo.scale.set(logoWidth / logoData.width);
    return logo.y + logoBottom * logo.scale.y;
  }

  function advance(deltaMS: number, playSound: () => void): boolean {
    const previousTime = elapsed;
    elapsed += deltaMS;
    if (!logo.visible) {
      logo.visible = true;
      playSound();
    }
    const frames = logoData.frames;
    const frame = (animate ? Math.min(1, elapsed / logoData.duration) : 1) * (frames.length - 1);
    const index = Math.floor(frame);
    const progress = frame - index;
    const next = frames[Math.min(index + 1, frames.length - 1)];
    for (const [part, sprite] of parts.entries()) {
      const [a, b, c, d, x, y, alpha] = frames[index][part]
        .map((value, field) => value + (next[part][field] - value) * progress);
      sprite.setFromMatrix(matrix.set(a, b, c, d, x, y));
      sprite.alpha = alpha;
    }
    if (confetti && previousTime < logoData.firework && elapsed >= logoData.firework) {
      confetti.burst();
    }
    confetti?.advance(Math.min(deltaMS, Math.max(0, elapsed - logoData.firework)));
    return animate && (elapsed < logoData.duration || Boolean(confetti?.view.children.length));
  }

  return { view, resize, advance };
}
