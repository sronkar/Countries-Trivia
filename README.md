# Countries-Trivia

A flag → country → capital trivia game. No build step, no dependencies — plain HTML/CSS/JavaScript. All 238 flags are bundled in `flags/`, so nothing is fetched from the internet.

## How to play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Offline / install as an app

- **PWA**: when served over HTTP(S), a service worker (`sw.js`) precaches the entire app — after the first visit it works fully offline, and "Add to Home Screen" installs it like a native app (`manifest.webmanifest`, icons in `icons/`). To host it, enable GitHub Pages for this repo (Settings → Pages → Deploy from a branch → `main`).
- **Single file**: `countries-trivia-offline.html` is the whole game (flags embedded) in one file — copy it anywhere and open it, no server or internet needed. Rebuild it after changes with `node tools/build-single-file.js`.

## Modes

- **Trivia** — a flag is shown; type the country name (autocomplete suggestions appear as you type), then guess its capital city. 3 tries per step, and after every answer you click **Next** to move on.
  - **3 missed countries ends the game.** Countries never repeat within a game.
  - **Tiered points**: every country sits in one of 8 point tiers (5–100 pts) reflecting how hard it actually is to name — related to, but not locked to, its game level (Greenland is level 5 but famous, so it pays less than Pitcairn). Naming the capital earns a 50% bonus. Tiers live in `data.js` (`TIER_OVERRIDES`) and are meant to be re-tuned over time.
  - **Result tracking**: the game records per-country outcomes (times shown, guessed %, capital %, hints used). The menu's "Your results" panel shows them and can export JSON — if a "hard" country is guessed right 100% of the time, demote its tier.
  - **2 hints per game**: on well-known countries (levels 1–3) a hint narrows the answer to 3 choices; on obscure ones (levels 4–5) it reveals the geographical location (e.g. "the Caribbean", "the South Pacific").
  - **High scores** are saved locally — enter your name on the game-over screen; the top 10 table shows on the menu.
- **2 Players** — duel mode: enter two names and a target score (your choice, min 10, default 100). Players alternate full turns (one flag each). Duels are harsher than solo: **one attempt per guess, no hints, and 3 missed countries eliminates you** (each player's remaining hearts show on the scoreboard). Missing a flag doesn't reveal the answer — instead the opponent gets a **steal**: one shot at the same flag for its full points (and capital bonus); the answer is only revealed if the steal fails too. A failed steal costs the stealer nothing. Every guess is on a **20-second clock** — running out counts as a pass (the clock pauses between turns and while the game is paused). The game can only end on a **round boundary**, so both players always get the same number of turns — meaning both can be eliminated in the same round (no winner). Otherwise, first to be ahead at or above the target after a completed round wins; a tie at the target goes to **sudden death**, and if the deck runs out the tiebreak is points → capitals guessed → tie. **Fair rounds**: each round deals both players flags from the same point tier (adjacent tier at worst). Duel results don't enter the solo high-score table.
- **Options** — capitals can be turned off entirely (flag → country only, no bonus stage), and **multiple choice** can be turned on (off by default): answer by picking one of 6 options instead of typing — easier and kid-friendly, with decoys drawn from the same region and similar difficulty so they're plausible rather than obviously wrong. Works in solo and duels — but **steals are disabled in multiple-choice duels**, since seeing the first player's wrong pick would shrink the option space unfairly. Both choices are remembered.
- **Knowledge** — study mode: a flag is shown; click the card to reveal the country name, click again to reveal the capital, click again for the next card.

The app follows your OS light/dark preference, and the ◐ button in the header switches theme manually (remembered between visits).

## Difficulty levels

Select **one or more** levels to build your pool — e.g. play 1+2, or 2+4.

| Level | Name | Contents |
|-------|------|----------|
| 1 | Beginner | World-famous countries everyone knows |
| 2 | Traveler | Well-known countries |
| 3 | Explorer | Moderately known countries |
| 4 | Geographer | Lesser-known countries & micro-states |
| 5 | Cartographer | Obscure territories & remote islands (Tokelau, Pitcairn, Svalbard…) |

Answers are matched ignoring case, accents and punctuation, and common aliases are accepted (e.g. "USA", "Holland", "Czech Republic", "Burma").

## Files

- `index.html` — page structure
- `styles.css` — styling
- `data.js` — country/territory dataset (~240 entries with capitals, regions, difficulty levels and aliases)
- `app.js` — game logic
