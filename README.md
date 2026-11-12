# Loop Sort Playable

PixiJS and TypeScript prototype for the Voodoo playable ad task. Translucent arrows move counterclockwise around the conveyor above six carriers.

The truck and cargo sprites in `src/assets/truck-atlas.png` are rendered from the supplied `1.8kV2.fbx` truck and `Cube Beveled.fbx` models.

## Local development

Use Node.js 20.19+ on the Node 20 line, or Node.js 22.12+.

```sh
npm ci
npm run dev
```

Run `npm run typecheck` to check TypeScript. Run `npm run build` to produce the web build in `dist/`, then `npm run preview` to serve it locally.
