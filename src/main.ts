import { Application, Graphics } from 'pixi.js';
import './style.css';

async function startPlayable(mount: HTMLElement): Promise<void> {
  const app = new Application();

  await app.init({
    resizeTo: window,
    background: 0x101827,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    preference: 'webgl',
  });

  const loop = new Graphics()
    .circle(0, 0, 56)
    .stroke({ width: 12, color: 0x56dfbc });

  function centerLoop(): void {
    loop.position.set(app.screen.width / 2, app.screen.height / 2);
  }

  app.stage.addChild(loop);
  app.renderer.on('resize', centerLoop);
  centerLoop();
  mount.appendChild(app.canvas);
}

const mount = document.querySelector<HTMLElement>('#playable');

if (mount) {
  void startPlayable(mount).catch((error: unknown) => {
    console.error('Could not start Loop Sort.', error);
    mount.textContent = 'The playable could not start.';
  });
}
