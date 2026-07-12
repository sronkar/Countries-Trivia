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

- **Trivia** — a flag is shown; type the country name (autocomplete suggestions appear as you type), then guess its capital city. 3 tries per step; more points for fewer tries. Score and streak are tracked.
- **Knowledge** — study mode: a flag is shown; click the card to reveal the country name, click again to reveal the capital, click again for the next card.

## Difficulty levels

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
- `data.js` — country/territory dataset (~240 entries with capitals, difficulty levels and aliases)
- `app.js` — game logic
