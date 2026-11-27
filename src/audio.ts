import alternativeMusicUrl from './assets/casual-music-loop-01.m4a?url';
import classicMusicUrl from './assets/casual-music-loop-18.m4a?url';
import piecePopUrl from './assets/pop-2.mp3';
import truckCompleteUrl from './assets/sfx-powerup-bright-1.mp3';
import winSoundUrl from './assets/win-1.mp3';
import { truckCargoHeightAt } from './board';

const musicUrl = import.meta.env.VITE_PLAYABLE_THEME === 'alternative' ? alternativeMusicUrl : classicMusicUrl;

export function createPlayableAudio() {
  const audio = new AudioContext();
  const activeEffects = new Set<AudioBufferSourceNode>();
  const unloadVolume = createVolume(0.35);
  const pieceVolume = createVolume(0.25);
  const musicVolume = createVolume(0.35);
  let musicBuffer: Promise<AudioBuffer | null> | undefined;
  let pendingMusic: Promise<[AudioBuffer | null, void]> | undefined;
  let musicSource: AudioBufferSourceNode | undefined;
  let pageIsOpen = true;
  let viewable = true;
  let playbackVersion = 0;

  function createVolume(volume: number): GainNode {
    const gain = audio.createGain();
    gain.gain.value = volume;
    gain.connect(audio.destination);
    return gain;
  }

  function canPlay(): boolean {
    return pageIsOpen && viewable && !document.hidden;
  }

  function unlock(): Promise<void> {
    if (audio.state === 'running') return Promise.resolve();

    const resumed = audio.resume();
    // Start a silent sample synchronously inside the gesture for iOS.
    const silent = audio.createBufferSource();
    silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    silent.connect(audio.destination);
    silent.onended = () => silent.disconnect();
    silent.start();
    return resumed;
  }

  function decode(url: string): Promise<AudioBuffer | null> {
    return fetch(url)
      .then((response) => response.arrayBuffer())
      .then((bytes) => audio.decodeAudioData(bytes))
      .catch(() => null);
  }

  function createSource(buffer: AudioBuffer, output: AudioNode): AudioBufferSourceNode {
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    return source;
  }

  function stopSource(source: AudioBufferSourceNode): void {
    source.onended = null;
    source.stop();
    source.disconnect();
  }

  function loadEffect(url: string) {
    const buffer = decode(url);
    return async (rate = 1, output: AudioNode = audio.destination) => {
      if (!canPlay() || audio.state !== 'running') return;

      const version = playbackVersion;
      const decoded = await buffer;
      if (!decoded || version !== playbackVersion || !canPlay() || audio.state !== 'running') return;

      const sound = createSource(decoded, output);
      sound.playbackRate.value = rate;
      activeEffects.add(sound);
      sound.onended = () => {
        activeEffects.delete(sound);
        sound.disconnect();
      };
      sound.start();
    };
  }

  async function startMusic(): Promise<void> {
    if (!canPlay() || musicSource || pendingMusic) return;

    const resumed = unlock();
    const loading = musicBuffer ??= decode(musicUrl);
    const attempt = Promise.all([loading, resumed]);
    pendingMusic = attempt;
    try {
      const [decoded] = await attempt;
      if (!decoded && musicBuffer === loading) musicBuffer = undefined;
      if (!decoded || pendingMusic !== attempt || !canPlay() || audio.state !== 'running') return;

      const source = createSource(decoded, musicVolume);
      source.loop = true;
      source.start();
      musicSource = source;
    } catch {
      // A later tap can retry if the browser refused audio activation.
    } finally {
      if (pendingMusic === attempt) pendingMusic = undefined;
    }
  }

  function stopMusic(): void {
    pendingMusic = undefined;
    if (musicSource) stopSource(musicSource);
    musicSource = undefined;
  }

  function stopAll(): void {
    playbackVersion++;
    stopMusic();
    for (const source of activeEffects) stopSource(source);
    activeEffects.clear();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAll();
  });
  window.addEventListener('pagehide', () => {
    pageIsOpen = false;
    stopAll();
  });
  window.addEventListener('pageshow', () => {
    pageIsOpen = true;
  });

  const pop = loadEffect(piecePopUrl);
  const playPop = (rate: number, output: AudioNode) =>
    pop(rate * (0.92 + Math.random() * 0.16), output);
  const playCubePop = (rate: number, y: number) =>
    playPop(rate * (0.82 + 0.36 * truckCargoHeightAt(y)), pieceVolume);
  const powerUp = loadEffect(truckCompleteUrl);
  const win = loadEffect(winSoundUrl);
  return {
    startMusic,
    stopMusic,
    setViewable(visible: boolean) {
      viewable = visible;
      if (!visible) stopAll();
    },
    onUnload() {
      if (!canPlay()) return;
      if (audio.state === 'running') {
        void playPop(1, unloadVolume);
        return;
      }
      const version = playbackVersion;
      void unlock().then(() => {
        if (version === playbackVersion) return playPop(1, unloadVolume);
      }, () => {});
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
