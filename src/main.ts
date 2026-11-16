import 'pixi.js/graphics';
import 'pixi.js/events';
import { Application, Container } from 'pixi.js';
import musicUrl from './assets/casual-music-loop-18.mp3';
import piecePopUrl from './assets/pop-2.mp3';
import truckCompleteUrl from './assets/sfx-powerup-bright-1.mp3';
import { boardHeight, boardWidth, conveyorCenter, createBoard } from './board';
import { createConveyorFlow } from './conveyor-arrows';
import { conveyorCapacity, createConveyorCargo } from './conveyor-cargo';
import { addMouseHand, addTutorialHand } from './hand';
import { startOpening } from './opening';
import { loadTruckArt } from './truck-art';
import { createTruckConfetti } from './truck-confetti';
import './style.css';

const maxRenderScale = 4;
const maxRenderPixels = 3_000_000;

function addBackgroundMusic(canvas: HTMLCanvasElement): void {
  const music = new Audio();
  music.preload = 'none';
  music.loop = true;
  music.volume = 0.35;
  music.src = musicUrl;

  function startMusic(): void {
    void music.play().then(() => canvas.removeEventListener('click', startMusic), () => {});
  }

  canvas.addEventListener('click', startMusic);
}

function createTruckSounds() {
  const audio = new AudioContext();

  const unloadVolume = audio.createGain();
  unloadVolume.gain.value = 0.35;
  unloadVolume.connect(audio.destination);

  const pieceVolume = audio.createGain();
  pieceVolume.gain.value = 0.25;
  pieceVolume.connect(audio.destination);

  function loadSound(url: string) {
    const buffer = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((bytes) => audio.decodeAudioData(bytes))
      .catch(() => null);

    return async (rate = 1, output: AudioNode = audio.destination) => {
      const decoded = await buffer;
      if (!decoded || audio.state !== 'running') return;
      const sound = audio.createBufferSource();
      sound.buffer = decoded;
      sound.playbackRate.value = rate;
      sound.connect(output);
      sound.start();
    };
  }

  const pop = loadSound(piecePopUrl);
  const powerUp = loadSound(truckCompleteUrl);
  return {
    onUnload() {
      if (audio.state === 'running') void pop(1, unloadVolume);
      else void audio.resume().then(() => pop(1, unloadVolume), () => {});
    },
    onPieceDeparture() {
      void pop(3, pieceVolume);
    },
    onPieceLanded() {
      void pop(3.5, pieceVolume);
    },
    onComplete() {
      void powerUp();
    },
  };
}

async function startPlayable(mount: HTMLElement): Promise<void> {
  const app = new Application();
  const board = document.createElement('div');
  board.className = 'board';
  mount.style.setProperty('--board-aspect', String(boardWidth / boardHeight));
  mount.appendChild(board);

  function getLayout() {
    const viewport = mount.getBoundingClientRect();
    const bounds = board.getBoundingClientRect();
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const scale = bounds.width / boardWidth || 1;
    const x = bounds.left - viewport.left;
    const y = bounds.top - viewport.top;
    const viewportBottom = Math.max(boardHeight, Math.ceil((height - y) / scale));
    const resolution = Math.min(window.devicePixelRatio, 3, maxRenderScale / scale, Math.sqrt(maxRenderPixels / (width * height)));
    return { width, height, resolution, scale, x, y, viewportBottom };
  }

  const initialLayout = getLayout();
  const [truckArt] = await Promise.all([
    loadTruckArt(),
    app.init({
      width: initialLayout.width,
      height: initialLayout.height,
      resolution: initialLayout.resolution,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      preference: ['webgl', 'canvas'],
      skipExtensionImports: true,
    }),
  ]);

  const capacity = document.createElement('output');
  capacity.className = 'conveyor-capacity';
  capacity.style.left = `${conveyorCenter.x / boardWidth * 100}%`;
  capacity.style.top = `${conveyorCenter.y / boardHeight * 100}%`;
  capacity.setAttribute('aria-label', 'Conveyor capacity in blocks');
  const showCapacity = (count: number) => {
    capacity.value = `${count} / ${conveyorCapacity}`;
  };
  showCapacity(0);

  const flow = createConveyorFlow();
  const sounds = createTruckSounds();
  const cargo = createConveyorCargo(showCapacity, sounds.onPieceDeparture);
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const confetti = animate ? createTruckConfetti() : undefined;
  const easyStart = import.meta.env.VITE_EASY_START === 'true';
  const scene = createBoard(truckArt, cargo, {
    ...sounds,
    onComplete(x, y) {
      sounds.onComplete();
      confetti?.burst(x, y);
    },
  }, { entranceY: getLayout().viewportBottom, opening: animate, easyStart });
  app.canvas.className = 'playable-canvas';
  mount.prepend(app.canvas);
  board.appendChild(capacity);
  addBackgroundMusic(app.canvas);

  const handMode = import.meta.env.VITE_HAND_MODE;
  const showTutorialHand = () => handMode === 'tutorial'
    ? addTutorialHand(board, scene.receivers, boardWidth, boardHeight)
    : undefined;
  if (handMode === 'mouse') addMouseHand(mount);

  const boardFrame = app.stage.addChild(new Container());
  const world = boardFrame.addChild(new Container());
  world.addChild(scene.view, flow.view, cargo.view);
  if (confetti) world.addChild(confetti.view);
  let advanceOpening = animate ? startOpening(world, capacity, boardWidth, scene.receivers.length) : undefined;
  let updateHand = animate ? undefined : showTutorialHand();

  app.ticker.add(({ deltaMS }) => {
    scene.advance(deltaMS);
    const distance = cargo.advance(deltaMS, scene.receivers);
    flow.advance(distance);
    confetti?.advance(deltaMS);
    if (advanceOpening) {
      if (!advanceOpening(deltaMS)) {
        advanceOpening = undefined;
        updateHand = showTutorialHand();
      }
    } else {
      updateHand?.();
    }
  });

  let renderedLayout = initialLayout;
  function resizeCanvas(): void {
    const layout = getLayout();
    if (layout.width !== renderedLayout.width || layout.height !== renderedLayout.height
        || layout.resolution !== renderedLayout.resolution) {
      app.renderer.resize(layout.width, layout.height, layout.resolution);
    }
    boardFrame.position.set(layout.x, layout.y);
    boardFrame.scale.set(layout.scale);
    renderedLayout = layout;
  }

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(mount);
  resizeObserver.observe(board);
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
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
