import '@pixi/3d/webgl';
import {
  BatchedMesh3D, DirectionalLight, Geometry3D, Matrix4, PhongMaterial,
  Quaternion, RenderPassBit, Vector3, View3D,
} from '@pixi/3d';
import type { Texture } from 'pixi.js';
import palette from '../docs/palette.json';
import { conveyorPieceCapacity } from './conveyor-cargo';
import { piecesPerBlock, type Piece } from './conveyor-pieces';
import type { TruckArt } from './truck-art';

// Reserve slots for cubes still landing while another truck fills the belt.
const cubeSlots = conveyorPieceCapacity + 6 * piecesPerBlock;
const spinAxis = { x: 0, y: 0, z: 1 };
const gravity = 250;

function createRoundedCube(): Geometry3D {
  const shapeExponent = 3.05;
  const samples = [-0.5, -0.4, -0.25, 0, 0.25, 0.4, 0.5];
  const row = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const point = [0, 0, 0];

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const side of [-1, 1]) {
      const faceStart = positions.length / 3;
      point[axis] = side * 0.5;
      for (const y of samples) {
        point[v] = y;
        for (const x of samples) {
          point[u] = x;
          // Project the face grid onto a superellipsoid so faces and edges curve together.
          const surface = point.reduce((sum, coordinate) => sum + Math.abs(coordinate) ** shapeExponent, 0);
          const radius = 0.5 / surface ** (1 / shapeExponent);
          const normal = point.map(coordinate => Math.sign(coordinate) * Math.abs(coordinate) ** (shapeExponent - 1));
          const normalLength = Math.hypot(...normal);
          for (let component = 0; component < 3; component++) {
            positions.push(point[component] * radius);
            normals.push(normal[component] / normalLength);
          }
        }
      }
      for (let y = 0; y < row - 1; y++) {
        for (let x = 0; x < row - 1; x++) {
          const start = faceStart + y * row + x;
          if (side > 0) indices.push(start, start + 1, start + row + 1, start, start + row + 1, start + row);
          else indices.push(start, start + row + 1, start + 1, start, start + row, start + row + 1);
        }
      }
    }
  }
  return new Geometry3D({
    positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices),
  });
}

type CubePose = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onBelt: boolean;
  lift: number;
  liftSpeed: number;
  roll: Quaternion;
};

export function createConveyorCubeView(width: number, height: number, art: TruckArt) {
  const view = new View3D({
    width, height, composite: true, resolution: 1.5,
    environment: { skyColor: 0xffffff, groundColor: 0xc6badf, up: spinAxis, intensity: 0.74 },
  });
  view.eventMode = 'none';
  view.camera.mode = 'orthographic';
  view.camera.orthographicSize = width / 2;
  view.camera.position.set(0, 0, 400);
  view.camera.lookAt({ x: 0, y: 0, z: 0 });

  const key = view.root.addChild(new DirectionalLight({ intensity: 1.13 }));
  key.position.set(-24, 36, 58);
  key.lookAt({ x: 0, y: 0, z: 0 });
  const fill = view.root.addChild(new DirectionalLight({ color: 0xf3ebff, intensity: 0.32 }));
  fill.position.set(45, -24, 23);
  fill.lookAt({ x: 0, y: 0, z: 0 });

  const theme = import.meta.env.VITE_PLAYABLE_THEME === 'alternative'
    ? [palette.alternative.rose, palette.alternative.yellow, palette.alternative.blue]
    : [palette.classic.pink, palette.classic.orange, palette.classic.white];
  const colors = [art.blocks.pink, art.blocks.orange, art.blocks.white];
  const materials = new Map<Texture, PhongMaterial>(colors.map((texture, index) => [texture, new PhongMaterial({
    baseColor: theme[index].hex, specularColor: 0xffffff, shininess: 54, specularStrength: 0.36,
  })]));
  const firstMaterial = materials.get(art.blocks.pink)!;
  const batch = view.root.addChild(new BatchedMesh3D({ size: cubeSlots }));
  const geometry = createRoundedCube();
  const slotMaterials = Array<PhongMaterial>(cubeSlots).fill(firstMaterial);
  for (let slot = 0; slot < cubeSlots; slot++) {
    batch.setGeometryAt(slot, geometry);
    batch.setMaterialAt(slot, firstMaterial);
    batch.setPassesAt(slot, RenderPassBit.OPAQUE);
    batch.setVisibleAt(slot, false);
  }

  const poses = new WeakMap<Piece, CubePose>();
  const rollAxis = new Vector3();
  const rollStep = new Quaternion();
  const orientation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const matrix = new Matrix4();
  let previousCount = 0;

  function sync(pieces: Iterable<Piece>, deltaMS: number): void {
    let count = 0;
    const seconds = Math.min(0.05, deltaMS / 1000);

    for (const piece of pieces) {
      const { sprite, shine, body, onBelt } = piece;
      const material = materials.get(piece.blockTexture);
      const drawModel = count < cubeSlots && material !== undefined;
      sprite.renderable = shine.renderable = !drawModel;
      if (!drawModel || sprite.alpha <= 0) continue;

      const { x, y } = sprite;
      const { x: vx, y: vy } = body.velocity;
      let pose = poses.get(piece);
      if (!pose) {
        const roll = new Quaternion().setFromEuler({ x: 0.25, y: (piece.speedFactor - 1) * 18, z: 0 });
        pose = { x, y, vx, vy, onBelt, lift: 0, liftSpeed: 0, roll };
        poses.set(piece, pose);
      }

      // Convert travel in the belt plane into a roll about the cross-track axis.
      const dx = x - pose.x;
      const dy = y - pose.y;
      const travel = Math.hypot(dx, dy);
      if (travel > 0.001) {
        rollAxis.set(dy / travel, dx / travel, 0);
        rollStep.setFromAxisAngle(rollAxis, Math.min(travel, 12) * (onBelt ? 0.086 : 0.048));
        pose.roll.premultiply(rollStep).normalize();
      }

      if (onBelt && pose.onBelt && seconds > 0) {
        const impact = Math.hypot(vx - pose.vx, vy - pose.vy);
        if (impact > 0.65) pose.liftSpeed = Math.max(pose.liftSpeed, Math.min(32, 10 + impact * 11));
      }
      pose.lift = Math.max(0, pose.lift + pose.liftSpeed * seconds - 0.5 * gravity * seconds ** 2);
      pose.liftSpeed = pose.lift > 0 ? pose.liftSpeed - gravity * seconds : 0;
      pose.x = x;
      pose.y = y;
      pose.vx = vx;
      pose.vy = vy;
      pose.onBelt = onBelt;

      if (slotMaterials[count] !== material) {
        slotMaterials[count] = material;
        batch.setMaterialAt(count, material);
      }
      orientation.setFromAxisAngle(spinAxis, -sprite.rotation).multiply(pose.roll);
      position.set(x - width / 2, height / 2 - y + pose.lift * 0.5, pose.lift);
      const edge = 0.84 * Math.sqrt(sprite.width * sprite.height * sprite.alpha);
      scale.set(edge, edge, edge);
      batch.setMatrixAt(count, matrix.compose(position, orientation, scale));
      if (count >= previousCount) batch.setVisibleAt(count, true);
      count++;
    }

    for (let slot = count; slot < previousCount; slot++) batch.setVisibleAt(slot, false);
    view.visible = count > 0;
    previousCount = count;
  }

  return { view, sync };
}
