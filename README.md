# Loop Sort Playable

PixiJS and TypeScript prototype for the Voodoo playable ad task. Translucent arrows move counterclockwise around the conveyor above six carriers.

The truck sprite is in `src/assets/truck-body.png`. The original cargo art is stored as individual PNGs in `src/assets/blocks/`. The game packs these files into one texture at startup.

The [palette](docs/palette.json) is the source of truth for the base hex and RGB colors in both themes.

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

Edit `.env` to choose the game variant, theme, and hand. Open [the local preview](http://localhost:5173/) to play the selected version. The web build and the standalone AppLovin export use the same settings.

- `VITE_PLAYABLE_VARIANT=standard` starts with shuffled truck loads and an empty belt. Complete all six trucks to win.
- `VITE_PLAYABLE_VARIANT=staged` places six preset loads in random lanes and starts the belt at 15/16. Tap the opening truck to remove its blocker and let the belt fill it. Complete all six trucks to win.
- `VITE_PLAYABLE_VARIANT=win` starts with a blocked, half-filled truck and two colors on the belt. The opening hint points to the matching truck, and the player can unload any truck that has cargo and space on the belt. On the guided route, the first tap fills the matching truck and leaves five pink blocks circulating. Releasing the two pink loads brings the belt to 15/16, and freeing the pink truck clears it. The win screen appears when the belt reaches zero and the cargo lands.
- `VITE_PLAYABLE_THEME=classic` uses pink, orange, and white bricks with Casual Music Loop 18. Set this to `alternative` for rose, yellow, and blue bricks with Casual Music Loop 01.
- `VITE_HAND_MODE=tutorial` shows the hand at startup and brings it back after three seconds without input. On the preset board it follows a fixed truck order, moving on once the current truck is empty or down to one color. On the shuffled board it picks a random truck and ends once that truck is empty or complete.
- `VITE_HAND_MODE=mouse` replaces the mouse cursor with the hand inside the playable for recording.
- `VITE_HAND_MODE=disabled` keeps the regular cursor and hides the tutorial hand.

Restart `npm run dev` after editing `.env`. Rebuild to include your settings in the production or AppLovin build.

**Download** stays visible during play and on every ending. In AppLovin it becomes active after the first gameplay move and opens the campaign destination through MRAID.
