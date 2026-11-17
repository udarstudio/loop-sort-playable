import 'pixi.js/graphics';
import 'pixi.js/events';
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import musicUrl from './assets/casual-music-loop-18.mp3';
import piecePopUrl from './assets/pop-2.mp3';
import truckCompleteUrl from './assets/sfx-powerup-bright-1.mp3';
import winSoundUrl from './assets/win-1.mp3';
import { boardHeight, boardWidth, conveyorCenter, conveyorTop, createBoard } from './board';
import { createConveyorFlow } from './conveyor-arrows';
import { conveyorCapacity, createConveyorCargo } from './conveyor-cargo';
import { addMouseHand, addTutorialHand } from './hand';
import { loadTruckArt } from './truck-art';
import { createTruckConfetti } from './truck-confetti';
import { createWinScreen } from './win-screen';
import './style.css';

const maxRenderScale = 4;
const maxRenderPixels = 3_000_000;
const backgroundEdge = '#aa9bcb';
const winHoldDuration = 1000;

function addBackgroundMusic(canvas: HTMLCanvasElement): () => void {
  const music = new Audio();
  music.preload = 'none';
  music.loop = true;
  music.volume = 0.35;
  music.src = musicUrl;

  function startMusic(): void {
    void music.play().then(() => canvas.removeEventListener('click', startMusic), () => {});
  }

  canvas.addEventListener('click', startMusic);
  return () => {
    canvas.removeEventListener('click', startMusic);
    music.pause();
  };
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
  const playPop = (rate: number, output: AudioNode) =>
    pop(rate * (0.92 + Math.random() * 0.16), output);
  const powerUp = loadSound(truckCompleteUrl);
  const win = loadSound(winSoundUrl);
  return {
    onUnload() {
      if (audio.state === 'running') void playPop(1, unloadVolume);
      else void audio.resume().then(() => playPop(1, unloadVolume), () => {});
    },
    onPieceDeparture() {
      void playPop(3, pieceVolume);
    },
    onPieceLanded() {
      void playPop(3.5, pieceVolume);
    },
    onComplete() {
      void powerUp();
    },
    onWin() {
      void win();
    },
  };
}

async function startPlayable(mount: HTMLElement): Promise<void> {
  const app = new Application();
  const board = document.createElement('div');
  board.className = 'board';
  mount.style.setProperty('--board-aspect', String(boardWidth / boardHeight));
  mount.style.setProperty('--conveyor-top-ratio', String(conveyorTop / boardWidth));
  mount.appendChild(board);

  function getLayout() {
    const viewport = mount.getBoundingClientRect();
    const bounds = board.getBoundingClientRect();
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const scale = bounds.width / boardWidth || 1;
    const x = bounds.left - viewport.left;
    const y = bounds.top - viewport.top;
    const resolution = Math.min(window.devicePixelRatio, 3, maxRenderScale / scale, Math.sqrt(maxRenderPixels / (width * height)));
    return { width, height, resolution, scale, x, y };
  }

  const initialLayout = getLayout();
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [truckArt, winScreen] = await Promise.all([
    loadTruckArt(),
    createWinScreen(animate),
    app.init({
      width: initialLayout.width,
      height: initialLayout.height,
      resolution: initialLayout.resolution,
      background: backgroundEdge,
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
  const confetti = animate ? createTruckConfetti() : undefined;
  const easyStart = import.meta.env.VITE_EASY_START === 'true';
  const winAfterFirstTruck = import.meta.env.VITE_WIN_AFTER_FIRST_TRUCK === 'true';
  let winHoldRemaining = 0;
  const scene = createBoard(truckArt, cargo, {
    ...sounds,
    onComplete(x, y) {
      sounds.onComplete();
      confetti?.burst(x, y);
      if (winAfterFirstTruck || scene.receivers.every((truck) => truck.isComplete())) {
        if (winHoldRemaining > 0) return;
        winHoldRemaining = winHoldDuration;
        boardFrame.eventMode = 'none';
      }
    },
  }, { easyStart });
  app.canvas.className = 'playable-canvas';
  mount.prepend(app.canvas);
  board.appendChild(capacity);
  const stopBackgroundMusic = addBackgroundMusic(app.canvas);

  const handMode = import.meta.env.VITE_HAND_MODE;
  const updateHand = handMode === 'tutorial'
    ? addTutorialHand(board, scene.receivers, boardWidth, boardHeight)
    : undefined;
  if (handMode === 'mouse') addMouseHand(mount);

  const boardFrame = app.stage.addChild(new Container());
  app.stage.addChild(winScreen.view);
  const background = new Graphics().rect(-1, -1, 2, 2).fill(new FillGradient({
    type: 'radial',
    colorStops: [
      { offset: 0, color: '#e1d8f4' },
      { offset: 0.52, color: '#c7bee4' },
      { offset: 1, color: backgroundEdge },
    ],
  }));
  background.position.copyFrom(conveyorCenter);
  background.eventMode = 'none';
  boardFrame.addChild(background, scene.view, flow.view, cargo.view);
  if (confetti) boardFrame.addChild(confetti.view);

  function showWin(): void {
    winScreen.view.visible = true;
    stopBackgroundMusic();
    mount.classList.add('playable-won');
    mount.setAttribute('aria-label', 'Loop Sort complete');
  }

  app.ticker.add(({ deltaMS }) => {
    if (winHoldRemaining > 0) {
      const holdTime = Math.min(deltaMS, winHoldRemaining);
      confetti?.advance(holdTime);
      winHoldRemaining -= holdTime;
      if (winHoldRemaining > 0) return;
      showWin();
      deltaMS -= holdTime;
    }
    if (winScreen.view.visible) {
      confetti?.advance(deltaMS);
      if (!winScreen.advance(deltaMS, sounds.onWin)) {
        app.render();
        app.stop();
      }
      return;
    }
    scene.advance(deltaMS);
    if (winHoldRemaining > 0) return;
    const distance = cargo.advance(deltaMS, scene.receivers);
    flow.advance(distance);
    confetti?.advance(deltaMS);
    updateHand?.();
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
    const centerX = layout.x + conveyorCenter.x * layout.scale;
    const centerY = layout.y + conveyorCenter.y * layout.scale;
    const radius = Math.hypot(
      Math.max(centerX, layout.width - centerX),
      Math.max(centerY, layout.height - centerY),
    );
    background.scale.set(radius / layout.scale);
    winScreen.resize(layout.width, layout.height);
    renderedLayout = layout;
    if (winScreen.view.visible) app.render();
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
