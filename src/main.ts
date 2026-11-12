import 'pixi.js/graphics';
import { Application } from 'pixi.js';
import { boardHeight, boardWidth, createBoard } from './board';
import { createConveyorFlow } from './conveyor-arrows';
import './style.css';

async function startPlayable(mount: HTMLElement): Promise<void> {
  const app = new Application();

  await app.init({
    width: boardWidth,
    height: boardHeight,
    background: 0x1c173c,
    resolution: Math.min(window.devicePixelRatio, 1.5),
    autoStart: false,
    preference: ['webgl', 'canvas'],
    skipExtensionImports: true,
  });

  const flow = createConveyorFlow();
  app.stage.addChild(createBoard(), flow.view);
  app.ticker.maxFPS = 30;
  app.ticker.add(({ deltaMS }) => flow.advance(deltaMS));
  mount.appendChild(app.canvas);
  app.render();
  app.start();
}

const mount = document.querySelector<HTMLElement>('#playable');

if (mount) {
  void startPlayable(mount).catch((error: unknown) => {
    console.error('Could not start Loop Sort.', error);
    mount.textContent = 'The playable could not start.';
  });
}
