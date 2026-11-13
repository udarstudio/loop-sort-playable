import { Container, Graphics, GraphicsContext } from 'pixi.js';

import { loopLength, positionOnConveyor } from './conveyor-path';

const arrowCount = 20;
const arrowSide = 7;
const arrowAltitude = arrowSide * Math.sqrt(3) / 2;

export function createConveyorFlow() {
  const view = new Container();
  const triangle = new GraphicsContext()
    .poly([
      -arrowAltitude / 3, -arrowSide / 2,
      2 * arrowAltitude / 3, 0,
      -arrowAltitude / 3, arrowSide / 2,
    ])
    .fill({ color: 0xe1d4ff, alpha: 0.2 });
  const arrows = Array.from({ length: arrowCount }, () => view.addChild(new Graphics(triangle)));
  const spacing = loopLength / arrowCount;
  let offset = 0;

  function advance(distance: number): void {
    offset = (offset + distance) % loopLength;

    arrows.forEach((arrow, index) => {
      arrow.rotation = positionOnConveyor(arrow, (offset + index * spacing) % loopLength);
    });
  }

  advance(0);
  return { view, advance };
}
