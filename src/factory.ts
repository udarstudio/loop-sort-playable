import { Container, FillGradient, Graphics, GraphicsContext } from 'pixi.js';
import { roadPalette } from './truck-roads';

const chimneyX = 76;
const chimneyY = -53;
const smokeTravel = 70;
const fullTurn = 2 * Math.PI;
const driveRadius = 22.5;
const drivenRadius = 15;
const gearSpeed = 0.5;

function createBuilding(): Graphics {
  const roofPanel = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: roadPalette.trim }, { offset: 1, color: roadPalette.surface }],
  });

  const building = new Graphics()
    // The plinth meets the conveyor's inner rim. The roof stops short of its front edge.
    .roundRect(-120.5, -87.5, 241, 179, 17).fill(roadPalette.shadow)
    .roundRect(-115, 49, 230, 39, 13).fill(roadPalette.trim)
    .roundRect(-112, 84, 224, 4, 2).fill(roadPalette.surface)
    .roundRect(-87, 74, 26, 8, 2).fill(roadPalette.shadow)
    .roundRect(61, 74, 26, 8, 2).fill(roadPalette.shadow)
    .roundRect(-85, 75, 22, 4, 1).fill(roadPalette.markings)
    .roundRect(63, 75, 22, 4, 1).fill(roadPalette.markings)
    .roundRect(-23, 70, 46, 16, 4).fill(roadPalette.shadow)
    .roundRect(-19, 75, 38, 9, 2).fill(roadPalette.trim)
    .roundRect(-16, 79, 32, 2, 1).fill(roadPalette.markings)
    .roundRect(-120, -87, 240, 162, 17).fill(roadPalette.surface)
    .roundRect(-112, 43, 224, 24, 7).fill(roadPalette.trim)
    .roundRect(-53, 39, 106, 34, 10).fill(roadPalette.shadow)
    .roundRect(-48, 41, 96, 30, 9).fill(roadPalette.trim)
    .roundRect(-96, 55, 32, 3, 1.5).fill(roadPalette.markings)
    .roundRect(64, 55, 32, 3, 1.5).fill(roadPalette.markings);

  // Long raised skylights follow the ridges of the sawtooth roof.
  for (const y of [-74, -36, 2]) {
    building
      .roundRect(-106, y, 104, 33, 5).fill(roadPalette.shadow)
      .roundRect(-106, y, 104, 22, 5).fill(roofPanel)
      .roundRect(-103, y + 2, 98, 3, 1.5).fill(roadPalette.markings)
      .roundRect(-101, y + 20, 94, 9, 2).fill(roadPalette.markings);
    for (const x of [-78, -55, -31]) {
      building.rect(x, y + 20, 2, 9).fill(roadPalette.surface);
    }
  }

  return building
    // Recessed gear housing and roof vent.
    .roundRect(3, -24, 103, 64, 11).fill(roadPalette.trim)
    .roundRect(6, -21, 97, 58, 8).fill(roadPalette.shadow)
    .roundRect(11, -68, 32, 31, 5).fill(roadPalette.trim)
    .roundRect(14, -65, 26, 25, 3).fill(roadPalette.shadow)
    .rect(18, -60, 18, 2).rect(18, -54, 18, 2).rect(18, -48, 18, 2).fill(roadPalette.markings)
    .ellipse(chimneyX + 2, chimneyY + 15, 18, 14).fill({ color: roadPalette.shadow, alpha: 0.55 })
    .roundRect(chimneyX - 12, chimneyY, 24, 21, 8).fill(roadPalette.surface)
    .ellipse(chimneyX, chimneyY + 6, 16, 13).fill(roadPalette.trim)
    .ellipse(chimneyX, chimneyY, 16, 13).fill(roadPalette.markings)
    .ellipse(chimneyX, chimneyY, 11, 8.5).fill(roadPalette.shadow);
}

function createGear(teeth: number, radius: number, color: number): Graphics {
  const outline: number[] = [];
  const toothAngle = fullTurn / teeth;
  for (let tooth = 0; tooth < teeth; tooth++) {
    for (const offset of [-0.5, -0.29, -0.19, 0.19, 0.29]) {
      const angle = (tooth + offset) * toothAngle;
      const edge = radius + (Math.abs(offset) < 0.2 ? 3 : -3);
      outline.push(Math.cos(angle) * edge, Math.sin(angle) * edge);
    }
  }

  const gear = new Graphics()
    .poly(outline).fill(color)
    .circle(0, 0, radius - 5).fill(roadPalette.surface)
    .circle(0, 0, radius - 7).fill(color)
    .circle(0, 0, 4).fill(roadPalette.shadow);
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = spoke * fullTurn / 3;
    gear.circle(Math.cos(angle) * radius * 0.45, Math.sin(angle) * radius * 0.45, 2.5).fill(roadPalette.trim);
  }
  return gear;
}

export function createFactory(x: number, y: number) {
  const view = new Container();
  view.position.set(x, y);
  view.eventMode = 'none';

  const haze = new FillGradient({
    type: 'radial',
    colorStops: [
      { offset: 0, color: '#efe1fb' },
      { offset: 0.5, color: '#d3bdecad' },
      { offset: 1, color: '#c6a9e500' },
    ],
  });
  const cloud = new GraphicsContext()
    .circle(0, 1, 9).fill(haze)
    .circle(-5, -3, 7).fill(haze)
    .circle(5, -2, 6).fill(haze);
  view.addChild(createBuilding());
  const driveGear = view.addChild(createGear(12, driveRadius, roadPalette.markings));
  driveGear.position.set(34, 8);
  const drivenGear = view.addChild(createGear(8, drivenRadius, roadPalette.trim));
  drivenGear.position.set(driveGear.x + driveRadius + drivenRadius, driveGear.y);
  drivenGear.rotation = Math.PI / 8;
  const puffs = Array.from({ length: 4 }, () => view.addChild(new Graphics(cloud)));

  let smokeDistance = 0;
  function advance(distance: number): void {
    const gearTravel = distance * gearSpeed;
    driveGear.rotation = (driveGear.rotation - gearTravel / driveRadius) % fullTurn;
    drivenGear.rotation = (drivenGear.rotation + gearTravel / drivenRadius) % fullTurn;
    smokeDistance = (smokeDistance + distance) % smokeTravel;
    for (let index = 0; index < puffs.length; index++) {
      const age = (smokeDistance / smokeTravel + index / puffs.length) % 1;
      const puff = puffs[index];
      puff.position.set(chimneyX - 43 * age + 4 * Math.sin(age * 5), chimneyY - 25 * age);
      puff.scale.set(0.45 + 0.85 * age);
      puff.alpha = Math.sin(age * Math.PI) * 0.36;
    }
  }

  advance(0);
  return { view, advance };
}
