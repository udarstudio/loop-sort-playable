# Loop Sort Playable

PixiJS and TypeScript prototype for the Voodoo playable ad task. Translucent arrows move counterclockwise around the conveyor above six carriers.

The truck sprite is in `src/assets/truck-body.png`. The original cargo art is stored as individual PNGs in `src/assets/blocks/`. The game packs these files into one texture at startup.

The [palette](docs/palette.json) is the source of truth for the base hex and RGB colors in both variants.

## Local development

Use Node.js 20.19+ on the Node 20 line, or Node.js 22.12+.

```sh
npm ci
npm run dev
```

Run `npm run typecheck` to check TypeScript. Run `npm run build` to produce the web build in `dist/`, then `npm run preview` to serve it locally.

## AppLovin HTML build

```sh
npm run build:applovin
```

Open `dist/applovin/index.html` to test the standalone playable. The build embeds the scripts, styles, images, fonts, and audio in the HTML and checks it against AppLovin’s 5 MB limit. It uses the playable options in `.env`.

## Playable options

Edit `.env` to configure the variant, starting loads, and hand. The success screen appears after all six trucks are complete.

- `VITE_PLAYABLE_VARIANT=classic` uses pink, orange, and white bricks with Casual Music Loop 18. Set this to `alternative` for rose, yellow, and blue bricks with Casual Music Loop 01.
- `VITE_EASY_START=true` places the six preset loads in random lanes. The belt starts with 15 blocks of the same color as the bottom block in the opening truck. Tap that truck to remove its blocker and let the belt finish filling it. Set this to `false` to start with an empty belt and shuffled truck loads.
- `VITE_HAND_MODE=tutorial` shows the hand at startup and brings it back after three seconds without input. On the preset board it follows a fixed truck order, moving on once the current truck is empty or down to one color. On the shuffled board it picks a random truck and ends once that truck is empty or complete.
- `VITE_HAND_MODE=mouse` replaces the mouse cursor with the hand inside the playable for recording.
- `VITE_HAND_MODE=disabled` keeps the regular cursor and hides the tutorial hand.

Restart `npm run dev` after editing `.env`. Rebuild to include your settings in the production or AppLovin build.
