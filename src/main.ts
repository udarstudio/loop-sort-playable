import 'pixi.js/graphics';
import 'pixi.js/events';
import { Application, Container, FillGradient, Graphics, WebGLRenderer } from 'pixi.js';
import alternativeMusicUrl from './assets/casual-music-loop-01.mp3';
import classicMusicUrl from './assets/casual-music-loop-18.mp3';
import piecePopUrl from './assets/pop-2.mp3';
import truckCompleteUrl from './assets/sfx-powerup-bright-1.mp3';
import winSoundUrl from './assets/win-1.mp3';
import { boardHeight, boardWidth, conveyorCenter, conveyorTop, createBoard, truckCargoHeightAt, type PlayableVariant } from './board';
import { createConveyorFlow } from './conveyor-arrows';
import { conveyorCapacity, createConveyorCargo } from './conveyor-cargo';
import { createConveyorCubeView } from './conveyor-cube-view';
import { addMouseHand, addTutorialHand } from './hand';
import { loadTruckArt } from './truck-art';
import { createTruckConfetti } from './truck-confetti';
import { createWinScreen } from './win-screen';

const maxRenderScale = 4;
const maxRenderPixels = 3_000_000;
const backgroundEdge = '#aa9bcb';
const winHoldDuration = 1500;
const jamHoldDuration = 2000;
const jamPulseDuration = 650;
const truckPraise = ['Great!', 'Awesome!', 'Superb!'];
const musicUrl = import.meta.env.VITE_PLAYABLE_THEME === 'alternative' ? alternativeMusicUrl : classicMusicUrl;
const openingHooks = {
  standard: 'Harder than it seems',
  staged: 'Looks easy, right?',
};

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
  const playCubePop = (rate: number, y: number) =>
    playPop(rate * (0.82 + 0.36 * truckCargoHeightAt(y)), pieceVolume);
  const powerUp = loadSound(truckCompleteUrl);
  const win = loadSound(winSoundUrl);
  return {
    onUnload() {
      if (audio.state === 'running') void playPop(1, unloadVolume);
      else void audio.resume().then(() => playPop(1, unloadVolume), () => {});
    },
    onPieceDeparture(y: number) {
      void playCubePop(1.5, y);
    },
    onPieceLanded(y: number) {
      void playCubePop(2.3, y);
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
  const configuredVariant = import.meta.env.VITE_PLAYABLE_VARIANT;
  const variant: PlayableVariant = configuredVariant === 'staged' || configuredVariant === 'win'
    ? configuredVariant : 'standard';
  mount.classList.toggle('win-variant', variant === 'win');
  const board = mount.querySelector<HTMLElement>('.board')!;
  const conveyorHud = board.querySelector<HTMLElement>('.conveyor-hud')!;
  conveyorHud.style.left = `${conveyorCenter.x / boardWidth * 100}%`;
  conveyorHud.style.top = `${conveyorCenter.y / boardHeight * 100}%`;
  const download = mount.querySelector<HTMLButtonElement>('.download-cta')!;
  const playableLogo = mount.querySelector<HTMLImageElement>('.playable-logo')!;
  const winResult = mount.querySelector<HTMLElement>('.win-result')!;
  const { mraid } = window as Window & { mraid?: {
    open(): void;
    getState(): string;
    addEventListener(event: 'ready', callback: () => void): void;
  } };
  let hasPlayed = false;
  if (mraid) {
    mraid.addEventListener('ready', enableDownload);
    download.addEventListener('click', () => {
      if (mraid.getState() !== 'loading') mraid.open();
    });
  }

  function enableDownload(): void {
    if (hasPlayed && mraid && mraid.getState() !== 'loading') download.disabled = false;
  }

  mount.style.setProperty('--board-aspect', String(boardWidth / boardHeight));
  mount.style.setProperty('--conveyor-top-ratio', String(conveyorTop / boardWidth));

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
  capacity.setAttribute('aria-label', 'Conveyor capacity in blocks');
  const showCapacity = (count: number) => {
    capacity.value = `${count} / ${conveyorCapacity}`;
  };
  showCapacity(0);

  const flow = createConveyorFlow();
  const sounds = createTruckSounds();
  const cargo = createConveyorCargo(showCapacity, sounds.onPieceDeparture);
  const confetti = animate ? createTruckConfetti() : undefined;
  let praiseIndex = 0;
  let winHoldRemaining = 0;
  const scene = createBoard(truckArt, cargo, {
    ...sounds,
    onUnload() {
      sounds.onUnload();
      hasPlayed = true;
      enableDownload();
    },
    onComplete(x, y) {
      sounds.onComplete();
      confetti?.burst(x, y);
      const praise = document.createElement('span');
      praise.className = 'truck-praise';
      praise.textContent = truckPraise[praiseIndex++ % truckPraise.length];
      praise.setAttribute('aria-hidden', 'true');
      praise.style.left = `${x / boardWidth * 100}%`;
      praise.style.top = `${y / boardHeight * 100}%`;
      praise.addEventListener('animationend', () => praise.remove(), { once: true });
      board.appendChild(praise);
    },
  }, variant, animate);
  app.canvas.className = 'playable-canvas';
  mount.prepend(app.canvas);
  conveyorHud.prepend(capacity);
  const gameTitle = conveyorHud.querySelector<HTMLElement>('.game-title')!;
  if (variant !== 'win') {
    gameTitle.textContent = openingHooks[variant];
    gameTitle.classList.add('opening-hook');
  }
  gameTitle.hidden = false;
  const stopBackgroundMusic = addBackgroundMusic(app.canvas);
  const gameOver = mount.querySelector<HTMLElement>('.game-over')!;
  let jammedFor = 0;

  const handMode = import.meta.env.VITE_HAND_MODE;
  const updateHand = handMode === 'tutorial'
    ? addTutorialHand(board, scene.tutorial, boardWidth, boardHeight)
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
  const renderer = app.renderer;
  const cubeModels = renderer instanceof WebGLRenderer && renderer.context.webGLVersion === 2
    ? createConveyorCubeView(boardWidth, boardHeight, truckArt)
    : undefined;
  boardFrame.addChild(background, scene.view, flow.view, cargo.view);
  if (cubeModels) {
    boardFrame.addChild(cubeModels.view);
    cubeModels.sync(cargo.visiblePieces(), 0);
  }
  boardFrame.addChild(scene.jamGlow);
  if (confetti) boardFrame.addChild(confetti.view);

  function showWin(): void {
    winScreen.view.visible = true;
    stopBackgroundMusic();
    mount.classList.add('playable-won');
    mount.setAttribute('aria-label', 'Loop Sort complete');
    board.setAttribute('aria-hidden', 'true');
    if (variant === 'win') winResult.hidden = false;
    winScreen.advance(0, sounds.onWin);
  }

  app.ticker.add(({ deltaMS }) => {
    if (winScreen.view.visible) {
      if (!winScreen.advance(deltaMS, sounds.onWin)) {
        app.render();
        app.stop();
      }
      return;
    }
    if (winHoldRemaining > 0) {
      scene.advance(deltaMS);
      cubeModels?.sync(cargo.visiblePieces(), deltaMS);
      confetti?.advance(deltaMS);
      winHoldRemaining -= deltaMS;
      if (winHoldRemaining <= 0) showWin();
      return;
    }
    scene.advance(deltaMS);
    if (scene.hasWon()) {
      cubeModels?.sync(cargo.visiblePieces(), deltaMS);
      boardFrame.eventMode = 'none';
      winHoldRemaining = winHoldDuration;
      return;
    }
    let beltDeltaMS = deltaMS;
    if (jammedFor > 0) {
      const brakeTime = Math.min(deltaMS, jamHoldDuration - jammedFor);
      const averageSpeed = 1 - (jammedFor + brakeTime / 2) / jamHoldDuration;
      beltDeltaMS = brakeTime * averageSpeed;
    }
    const distance = cargo.advance(beltDeltaMS, scene.receivers);
    cubeModels?.sync(cargo.visiblePieces(), deltaMS);
    flow.advance(distance);
    confetti?.advance(deltaMS);
    updateHand?.(deltaMS);

    if (cargo.isJammed(scene.receivers)) {
      if (jammedFor === 0) {
        mount.classList.add('playable-jammed');
        scene.jamGlow.visible = true;
      }
      jammedFor += deltaMS;
      scene.jamGlow.alpha = animate ? 0.6 + 0.4 * Math.cos(jammedFor * 2 * Math.PI / jamPulseDuration) : 0.8;
      if (jammedFor >= jamHoldDuration) {
        boardFrame.eventMode = 'none';
        stopBackgroundMusic();
        mount.classList.add('playable-lost');
        board.setAttribute('aria-hidden', 'true');
        gameOver.querySelector('.game-over-content')!.prepend(playableLogo);
        gameOver.hidden = false;
        app.render();
        app.stop();
      }
    } else if (jammedFor > 0) {
      jammedFor = 0;
      mount.classList.remove('playable-jammed');
      scene.jamGlow.visible = false;
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
    const centerX = layout.x + conveyorCenter.x * layout.scale;
    const centerY = layout.y + conveyorCenter.y * layout.scale;
    const radius = Math.hypot(
      Math.max(centerX, layout.width - centerX),
      Math.max(centerY, layout.height - centerY),
    );
    background.scale.set(radius / layout.scale);
    const winLogoBottom = winScreen.resize(layout.width, layout.height);
    winResult.style.setProperty('--win-logo-bottom', `${winLogoBottom}px`);
    renderedLayout = layout;
    if (winScreen.view.visible || !gameOver.hidden) app.render();
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
    mount.querySelector('.board')?.replaceChildren('The playable could not start.');
  });
}
