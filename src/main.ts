import 'pixi.js/graphics';
import 'pixi.js/events';
import { Application } from 'pixi.js';
import { boardHeight, boardWidth, createBoard } from './board';
import { createConveyorFlow } from './conveyor-arrows';
import { conveyorCapacity, createConveyorCargo } from './conveyor-cargo';
import { loadTruckArt } from './truck-art';
import './style.css';

const maxRenderScale = 4;

async function startPlayable(mount: HTMLElement): Promise<void> {
  const app = new Application();
  const board = document.createElement('div');
  board.className = 'board';
  board.style.setProperty('--board-aspect', String(boardWidth / boardHeight));
  mount.appendChild(board);

  function getRenderScale(): number {
    const displayWidth = board.getBoundingClientRect().width;
    const pixelRatio = Math.min(window.devicePixelRatio, 3);
    return Math.min(maxRenderScale, Math.max(1, displayWidth * pixelRatio / boardWidth));
  }

  const [truckArt] = await Promise.all([
    loadTruckArt(),
    app.init({
      width: boardWidth,
      height: boardHeight,
      background: 0x1c173c,
      resolution: getRenderScale(),
      antialias: true,
      autoStart: false,
      preference: ['webgl', 'canvas'],
      skipExtensionImports: true,
    }),
  ]);

  const capacity = document.createElement('output');
  capacity.className = 'conveyor-capacity';
  capacity.setAttribute('aria-label', 'Conveyor capacity in blocks');
  const showCapacity = (count: number) => {
    capacity.value = `${count} / ${conveyorCapacity}`;
  };
  showCapacity(0);

  const flow = createConveyorFlow();
  const cargo = createConveyorCargo(showCapacity);
  const scene = createBoard(truckArt, cargo);
  app.stage.addChild(scene.view, flow.view, cargo.view);
  app.ticker.maxFPS = 30;
  app.ticker.add(({ deltaMS }) => {
    scene.advance(deltaMS);
    flow.advance(cargo.advance(deltaMS, scene.receivers));
  });

  board.append(app.canvas, capacity);

  function resizeCanvas(): void {
    const scale = getRenderScale();
    if (scale !== app.renderer.resolution) {
      app.renderer.resize(boardWidth, boardHeight, scale);
    }
  }

  new ResizeObserver(resizeCanvas).observe(board);
  window.addEventListener('resize', resizeCanvas);
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
