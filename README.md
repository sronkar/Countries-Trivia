# Countries-Trivia

A flag → country → capital trivia game. No build step, no dependencies — plain HTML/CSS/JavaScript.

## How to play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Flag images are loaded from the web, so an internet connection is needed.)

## Modes

- **Trivia** — a flag is shown; type the country name (autocomplete suggestions appear as you type), then guess its capital city. 3 tries per step, and after every answer you click **Next** to move on.
  - **3 missed countries ends the game.** Countries never repeat within a game.
  - **Tiered points**: every country sits in one of 8 point tiers (5–100 pts) reflecting how hard it actually is to name — related to, but not locked to, its game level (Greenland is level 5 but famous, so it pays less than Pitcairn). Naming the capital earns a 50% bonus. Tiers live in `data.js` (`TIER_OVERRIDES`) and are meant to be re-tuned over time.
  - **Result tracking**: the game records per-country outcomes (times shown, guessed %, capital %, hints used). The menu's "Your results" panel shows them and can export JSON — if a "hard" country is guessed right 100% of the time, demote its tier.
  - **2 hints per game**: on well-known countries (levels 1–3) a hint narrows the answer to 3 choices; on obscure ones (levels 4–5) it reveals the geographical location (e.g. "the Caribbean", "the South Pacific").
  - **High scores** are saved locally — enter your name on the game-over screen; the top 10 table shows on the menu.
- **2 Players** — duel mode: enter two names and a target score (your choice, default 100). Players alternate full turns (one flag each: country + capital), first to reach the target wins. No lives; each player gets their own 2 hints. **Fair rounds**: each round deals both players flags from the same point tier (adjacent tier at worst), so nobody gets a 5-point flag while their opponent draws a 100-pointer. Duel results don't enter the solo high-score table.
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
