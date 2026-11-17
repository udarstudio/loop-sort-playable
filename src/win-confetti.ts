import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';

const colors = [0xff3076, 0xf343fa, 0xff9829, 0xffe531, 0x65f34e, 0x26e9ef, 0x3b8eff, 0x8b45ff];
const tileSize = 32;
const ribbons = [
  'M7 19 Q14 8 26 13',
  'M6 13 C12 5 18 25 26 17',
  'M8 8 Q7 20 24 21',
  'M7 16 L25 16',
];

type Flight = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  gravity: number;
  delay: number;
};

type Ribbon = Flight & {
  sprite: Sprite;
  size: number;
  angle: number;
  spin: number;
  phase: number;
  lifetime: number;
};

export function createWinConfetti() {
  const view = new Container({ eventMode: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = tileSize * ribbons.length;
  canvas.height = tileSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the win confetti textures.');
  const highlight = context.createLinearGradient(0, 7, 0, 25);
  highlight.addColorStop(0, '#ffffff');
  highlight.addColorStop(0.6, '#eeeeee');
  highlight.addColorStop(1, '#aaaaaa');
  context.strokeStyle = highlight;
  context.lineWidth = 5.5;
  context.lineCap = 'round';
  for (const [index, path] of ribbons.entries()) {
    context.setTransform(1, 0, 0, 1, index * tileSize, 0);
    context.stroke(new Path2D(path));
  }
  const source = new CanvasSource({ resource: canvas });
  const textures = ribbons.map((_, index) => new Texture({
    source,
    frame: new Rectangle(index * tileSize, 0, tileSize, tileSize),
  }));
  const particles: Ribbon[] = [];
  let width = 1;
  let height = 1;
  let sizeScale = 1;
  let elapsed = 0;

  function resize(viewWidth: number, viewHeight: number): void {
    width = viewWidth;
    height = viewHeight;
    sizeScale = Math.max(0.72, Math.min(1.55, Math.min(width, height) / 390));
  }

  function addRibbon(flight: Flight): void {
    const texture = textures[Math.floor(Math.random() * textures.length)];
    const sprite = view.addChild(new Sprite({ texture, anchor: 0.5, visible: false }));
    sprite.tint = colors[particles.length % colors.length];
    particles.push({
      ...flight,
      sprite,
      size: (17 + Math.random() * 14) / tileSize,
      angle: Math.random() * 2 * Math.PI,
      spin: (Math.random() - 0.5) * 9,
      phase: Math.random() * 2 * Math.PI,
      lifetime: 2.6 + Math.random() * 1.1,
    });
  }

  function burst(): void {
    for (let index = 0; index < 112; index++) {
      addRibbon({
        x: Math.random(),
        y: Math.random() * 1.2 - 0.35,
        velocityX: (Math.random() - 0.5) * 0.11,
        velocityY: 0.08 + Math.random() * 0.15,
        gravity: 0.07,
        delay: Math.random() * 0.7,
      });
    }
    for (const direction of [-1, 1]) {
      for (let index = 0; index < 48; index++) {
        addRibbon({
          x: 0.5 - direction * (0.4 + Math.random() * 0.06),
          y: 0.96 + Math.random() * 0.08,
          velocityX: direction * (Math.random() * 0.48 - 0.08),
          velocityY: -(0.46 + Math.random() * 0.67),
          gravity: 0.58,
          delay: Math.random() * 0.38,
        });
      }
    }
  }

  function advance(deltaMS: number): void {
    elapsed += deltaMS / 1000;
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      const { sprite, lifetime, phase } = particle;
      const age = elapsed - particle.delay;
      if (age < 0) continue;
      if (age >= lifetime) {
        sprite.destroy();
        particles.splice(index, 1);
        continue;
      }
      const sway = Math.sin(age * 4 + phase) - Math.sin(phase);
      sprite.position.set(
        (particle.x + particle.velocityX * age + sway * 0.025) * width,
        (particle.y + particle.velocityY * age + particle.gravity * age ** 2 / 2) * height,
      );
      const size = particle.size * sizeScale;
      sprite.scale.set(size * (0.47 + 0.53 * Math.abs(Math.cos(age * 7 + phase))), size);
      sprite.rotation = particle.angle + particle.spin * age;
      sprite.alpha = Math.min(1, age / 0.12, (lifetime - age) / 0.5);
      sprite.visible = true;
    }
  }

  return { view, resize, burst, advance };
}
