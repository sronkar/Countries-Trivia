# Countries-Trivia

A small flag-trivia game for family and friends. Pure HTML/CSS/JS — no build
step, no dependencies, flags streamed from [flagcdn.com](https://flagcdn.com).

## Modes

- **Learn** — flags shown at random; tap to reveal the country, then the
  capital, then advance.
- **Test** — quiz on country (from the flag) then capital. Choose
  *multiple-choice* or *open-text*. Scoring: +1 per correct sub-answer
  (max `2 × rounds`).

## Filters

- **Continents** — Africa, Americas, Asia, Europe, Oceania.
- **Regions** — finer sub-regions of the selected continents.
- **Difficulty** — 1 (universally famous) through 10 (microstates and
  obscure territories). Presets: Easy 1–3, Medium 1–6, Hard 1–10,
  Obscure 7–10.

Filters and best-score-per-filter-scope are persisted in `localStorage`.

## Dataset

~245 entries: UN member states + observers (Vatican, Palestine) + major
widely-recognised territories (Taiwan, Hong Kong, Puerto Rico, Greenland,
Faroe Islands, French Polynesia, etc.). See `data/countries.js` for the
full list and difficulty rubric.

## Running locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works — no Node, no build, no bundler.

## Deploying

This repo is GitHub-Pages-ready (`.nojekyll` is included so the `data/` and
`js/` folders are served verbatim). Enable Pages on the `main` branch and
the game is live.
