import type { Container } from 'pixi.js';

export const openingDriveDuration = 610;
export const openingStagger = 54;
export const openingSettleDuration = 145;

export function startOpening(world: Container, capacity: HTMLOutputElement, width: number, truckCount: number) {
  const lastImpact = openingDriveDuration + (truckCount - 1) * openingStagger;
  const duration = lastImpact + openingSettleDuration;
  const focusX = width / 2;
  const focusY = 270;
  let elapsed = 0;

  world.eventMode = 'none';
  world.pivot.set(focusX, focusY);

  function updateCamera(): void {
    const progress = Math.min(1, elapsed / lastImpact);
    const pullback = progress * progress * (3 - 2 * progress);
    let shakeY = 0;
    for (let index = 0; index < truckCount; index++) {
      const impactTime = elapsed - (openingDriveDuration + index * openingStagger);
      if (impactTime <= 0 || impactTime >= openingSettleDuration) continue;
      const settle = impactTime / openingSettleDuration;
      const strength = index === truckCount - 1 ? 9 : 5;
      shakeY += strength * Math.sin(2 * Math.PI * settle) * (1 - settle) ** 2;
    }

    world.scale.set(1 + 0.6 * (1 - pullback));
    world.position.set(focusX, focusY - 50 * (1 - pullback) + shakeY);
    capacity.style.opacity = String(Math.min(1, Math.max(0, (elapsed - lastImpact) / openingSettleDuration)));
  }

  updateCamera();
  return (deltaMS: number): boolean => {
    elapsed += deltaMS;
    if (elapsed < duration) {
      updateCamera();
      return true;
    }

    world.scale.set(1);
    world.position.set(0);
    world.pivot.set(0);
    world.eventMode = 'passive';
    capacity.style.removeProperty('opacity');
    return false;
  };
}
