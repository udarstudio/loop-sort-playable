import 'pixi.js/graphics';
import 'pixi.js/events';
import { Application } from 'pixi.js';
import musicUrl from './assets/casual-music-loop-18.mp3';
import piecePopUrl from './assets/pop-2.mp3';
import truckCompleteUrl from './assets/sfx-powerup-bright-1.mp3';
import { boardHeight, boardWidth, createBoard } from './board';
import { createConveyorFlow } from './conveyor-arrows';
import { conveyorCapacity, createConveyorCargo } from './conveyor-cargo';
import { loadTruckArt } from './truck-art';
import './style.css';

const maxRenderScale = 4;

function addBackgroundMusic(board: HTMLElement): void {
  const music = new Audio();
  music.preload = 'none';
  music.loop = true;
  music.volume = 0.35;
  music.src = musicUrl;

  function startMusic(): void {
    void music.play().then(() => board.removeEventListener('click', startMusic), () => {});
  }

  board.addEventListener('click', startMusic);
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
  const sounds = createTruckSounds();
  const cargo = createConveyorCargo(showCapacity, sounds.onPieceDeparture);
  const scene = createBoard(truckArt, cargo, sounds);
  app.stage.addChild(scene.view, flow.view, cargo.view);
  app.ticker.maxFPS = 30;
  app.ticker.add(({ deltaMS }) => {
    scene.advance(deltaMS);
    flow.advance(cargo.advance(deltaMS, scene.receivers));
  });

  board.append(app.canvas, capacity);
  addBackgroundMusic(board);

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
