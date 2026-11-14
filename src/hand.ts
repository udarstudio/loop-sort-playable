import handUrl from './assets/tutorial-hand.png';

const idleDelay = 3000;

type TruckHint = {
  hint(): { x: number; y: number } | undefined;
  isComplete(): boolean;
  isEmpty(): boolean;
};

function createHand(className: string): HTMLImageElement {
  const hand = document.createElement('img');
  hand.src = handUrl;
  hand.alt = '';
  hand.className = `playable-hand ${className}`;
  hand.hidden = true;
  return hand;
}

export function addTutorialHand(board: HTMLElement, trucks: readonly TruckHint[], width: number, height: number) {
  const hand = createHand('tutorial-hand');
  board.appendChild(hand);
  const input = new AbortController();
  const listenerOptions = { signal: input.signal };
  let activeTruck: TruckHint | undefined;
  let showAfter = 0;
  const pressedPointers = new Set<number>();

  function reset(): void {
    hand.hidden = true;
    showAfter = performance.now() + idleDelay;
  }

  window.addEventListener('pointerdown', (event) => {
    pressedPointers.add(event.pointerId);
    reset();
  }, listenerOptions);
  function release(event: PointerEvent): void {
    if (pressedPointers.delete(event.pointerId)) reset();
  }
  window.addEventListener('pointerup', release, listenerOptions);
  window.addEventListener('pointercancel', release, listenerOptions);
  window.addEventListener('keydown', reset, listenerOptions);
  window.addEventListener('blur', () => {
    pressedPointers.clear();
    reset();
  }, listenerOptions);

  function update(): void {
    if (input.signal.aborted) return;
    if (activeTruck && (activeTruck.isComplete() || activeTruck.isEmpty())) {
      hand.remove();
      input.abort();
      return;
    }
    if (pressedPointers.size || performance.now() < showAfter) return;
    if (!activeTruck) {
      const candidates = trucks.filter((truck) => truck.hint());
      activeTruck = candidates[Math.floor(Math.random() * candidates.length)];
    }
    const point = activeTruck?.hint();
    hand.hidden = !point;
    if (point) {
      hand.style.left = `${100 * point.x / width}%`;
      hand.style.top = `${100 * point.y / height}%`;
    }
  }

  update();
  return update;
}

export function addMouseHand(mount: HTMLElement): void {
  const hand = createHand('mouse-hand');
  mount.appendChild(hand);

  function hide(): void {
    hand.hidden = true;
    hand.classList.remove('is-pressed');
    mount.classList.remove('show-mouse-hand');
  }

  function followMouse(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    hand.style.left = `${event.clientX}px`;
    hand.style.top = `${event.clientY}px`;
    hand.hidden = false;
    hand.classList.toggle('is-pressed', (event.buttons & 1) !== 0);
    mount.classList.add('show-mouse-hand');
  }

  mount.addEventListener('pointermove', followMouse);
  mount.addEventListener('pointerdown', (event) => {
    if (event.button === 0) followMouse(event);
  });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse' && event.button === 0) hand.classList.remove('is-pressed');
  });
  window.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'mouse') hide();
  });
  mount.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
}
