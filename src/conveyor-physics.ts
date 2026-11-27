import Matter from 'matter-js';
import { conveyorRail, distanceOnConveyor, positionOnConveyor } from './conveyor-path';

const { Bodies, Body, Composite, Engine, Events } = Matter;
const stepsPerSecond = 60;
const maxStepMS = 1000 / stepsPerSecond;
const railOffset = 16;
const railThickness = 8;
const traction = 20;
const centering = 2.2;
const lateralDrag = 1.35;
const spinDrag = 2.7;
const outerRestitution = 0.9;
const minWallImpact = 16 / stepsPerSecond;

export function createCubeBody(width: number, height: number, angle: number): Matter.Body {
  // The hitbox follows the cube's footprint inside its illustrated outline.
  return Bodies.rectangle(0, 0, width * 0.84, height * 0.84, {
    angle, chamfer: { radius: 1.3 }, friction: 0.1, frictionAir: 0, restitution: 0.25,
  });
}

export function readCubeVelocity(body: Matter.Body) {
  const velocity = Body.getVelocity(body);
  return { x: velocity.x * stepsPerSecond, y: velocity.y * stepsPerSecond };
}

function createRail(lane: number): Matter.Body[] {
  const points = conveyorRail(lane);
  return points.map((start, index) => {
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const rail = Bodies.rectangle((start.x + end.x) / 2, (start.y + end.y) / 2,
      Math.hypot(dx, dy) + 3, railThickness, {
        angle: Math.atan2(dy, dx), isStatic: true,
      });
    rail.friction = 0.02;
    return rail;
  });
}

export function createConveyorPhysics() {
  const engine = Engine.create({ gravity: { x: 0, y: 0 } });
  const cubes = new Map<Matter.Body, number>();
  const center = { x: 0, y: 0 };
  const force = { x: 0, y: 0 };
  const railCenter = railOffset + railThickness / 2;
  const outerRail = new Set(createRail(railCenter));
  const wallImpacts = new Map<Matter.Body, { nx: number; ny: number; speed: number }>();
  Composite.add(engine.world, [...createRail(-railCenter), ...outerRail]);

  Events.on(engine, 'collisionStart', ({ pairs }) => {
    for (const { collision } of pairs) {
      const { bodyA, bodyB, normal } = collision;
      const outerIsA = outerRail.has(bodyA);
      const cube = outerIsA ? bodyB : bodyA;
      if (!cubes.has(cube) || (!outerIsA && !outerRail.has(bodyB))) continue;

      const nx = outerIsA ? -normal.x : normal.x;
      const ny = outerIsA ? -normal.y : normal.y;
      const velocity = Body.getVelocity(cube);
      const speed = -(velocity.x * nx + velocity.y * ny);
      if (speed <= (wallImpacts.get(cube)?.speed ?? minWallImpact)) continue;
      wallImpacts.set(cube, { nx, ny, speed });
    }
  });

  function reboundFromWall(): void {
    // Matter damps low-speed contacts. Preserve restitution on new outer-wall impacts at the belt's scale.
    for (const [cube, { nx, ny, speed }] of wallImpacts) {
      const velocity = Body.getVelocity(cube);
      const rebound = speed * outerRestitution - (velocity.x * nx + velocity.y * ny);
      if (rebound > 0) Body.setVelocity(cube, { x: velocity.x + nx * rebound, y: velocity.y + ny * rebound });
    }
    wallImpacts.clear();
  }

  function add(body: Matter.Body, distance: number, lane: number, speed: number, speedFactor: number): void {
    const heading = positionOnConveyor(center, distance, lane);
    const velocity = speed * speedFactor / stepsPerSecond;
    Body.setPosition(body, center);
    Body.setVelocity(body, { x: Math.cos(heading) * velocity, y: Math.sin(heading) * velocity });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.035);
    Composite.add(engine.world, body);
    cubes.set(body, speedFactor);
  }

  function remove(body: Matter.Body): void {
    Composite.remove(engine.world, body);
    cubes.delete(body);
  }

  function advance(deltaMS: number, speed: number): void {
    if (cubes.size === 0) return;
    const steps = Math.ceil(deltaMS / maxStepMS);
    const stepMS = deltaMS / steps;
    for (let step = 0; step < steps; step++) {
      for (const [body, speedFactor] of cubes) {
        const distance = distanceOnConveyor(body.position);
        const heading = positionOnConveyor(center, distance);
        const tx = Math.cos(heading);
        const ty = Math.sin(heading);
        const nx = -ty;
        const ny = tx;
        const lane = (body.position.x - center.x) * nx + (body.position.y - center.y) * ny;
        const forwardSpeed = (body.velocity.x * tx + body.velocity.y * ty) * stepsPerSecond;
        const lateralSpeed = (body.velocity.x * nx + body.velocity.y * ny) * stepsPerSecond;
        const forwardAcceleration = (speed * speedFactor - forwardSpeed) * traction;
        const lateralAcceleration = -lane * centering - lateralSpeed * lateralDrag;

        // Traction acts along the belt so cubes keep their sideways momentum into the rails.
        const forceScale = body.mass / 1_000_000;
        force.x = (tx * forwardAcceleration + nx * lateralAcceleration) * forceScale;
        force.y = (ty * forwardAcceleration + ny * lateralAcceleration) * forceScale;
        Body.applyForce(body, body.position, force);
        body.torque -= body.inertia * body.angularVelocity * stepsPerSecond * spinDrag / 1_000_000;
      }
      Engine.update(engine, stepMS);
      reboundFromWall();
    }
  }

  return { add, remove, advance };
}
