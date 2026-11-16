import { Container, Sprite, Texture } from 'pixi.js';

const colors = [0xffd842, 0xff69bc, 0x65e2ff, 0xb7ef57, 0xfff4dc];
const particleCount = 24;
const lifetime = 0.85;
const gravity = 440;

type Particle = {
  sprite: Sprite;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  spin: number;
  age: number;
};

export function createTruckConfetti() {
  const view = new Container();
  view.eventMode = 'none';
  const particles: Particle[] = [];

  function burst(x: number, y: number): void {
    for (let index = 0; index < particleCount; index++) {
      const spread = index / (particleCount - 1) * 2 - 1;
      const sprite = view.addChild(new Sprite(Texture.WHITE));
      const startX = x + spread * 8;
      sprite.anchor.set(0.5);
      sprite.position.set(startX, y);
      sprite.setSize(3 + Math.random() * 2, 4 + Math.random() * 4);
      sprite.tint = colors[index % colors.length];
      sprite.rotation = Math.random() * Math.PI;
      particles.push({
        sprite, x: startX, y, age: 0,
        velocityX: spread * (55 + Math.random() * 65),
        velocityY: -(145 + Math.random() * 105) + 35 * Math.abs(spread),
        spin: (Math.random() - 0.5) * 16,
      });
    }
  }

  function advance(deltaMS: number): void {
    const seconds = deltaMS / 1000;
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.age += seconds;
      const { age, sprite } = particle;
      if (age >= lifetime) {
        sprite.destroy();
        particles.splice(index, 1);
        continue;
      }

      sprite.position.set(
        particle.x + particle.velocityX * age,
        particle.y + particle.velocityY * age + gravity * age ** 2 / 2,
      );
      sprite.rotation += particle.spin * seconds;
      sprite.alpha = Math.min(1, (lifetime - age) / 0.25);
    }
  }

  return { view, burst, advance };
}
