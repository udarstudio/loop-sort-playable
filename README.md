# Loop Sort Playable

PixiJS and TypeScript prototype for the Voodoo playable ad task. Translucent arrows move counterclockwise around the conveyor above six carriers.

The truck sprite is in `src/assets/truck-body.png`. The original cargo art is stored as individual PNGs in `src/assets/blocks/`. The game packs these files into one texture at startup.

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
- `VITE_EASY_START=true` places the six preset loads in random lanes. The easiest truck has one off-color block on top, and its missing match is on top of a five-layer truck. The matched blocks and the layers travel with their trucks when the lanes are shuffled. Set this to `false` to shuffle the individual blocks instead.
- `VITE_HAND_MODE=tutorial` shows a hand pointing to a random truck as soon as the board appears. After three seconds without input, it returns to that lane when the truck can unload, even with one block left. The tutorial ends for that run once the truck is empty or full of one color.
- `VITE_HAND_MODE=mouse` replaces the mouse cursor with the hand inside the playable for recording.
- `VITE_HAND_MODE=disabled` keeps the regular cursor and hides the tutorial hand.

Restart `npm run dev` after editing `.env`. Rebuild to include your settings in the production or AppLovin build.
