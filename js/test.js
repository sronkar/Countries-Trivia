// Test mode: ask country (from flag), then capital. MC or open-text.

import {
  flagUrl, flagSrcset, shuffle, sample, matchesAnswer,
  pickDistractors, storage, el, clear,
} from "./util.js";

const SCORE_KEY = "flagtrivia:bestScores";

export function mountTest(root, pool, opts) {
  clear(root);
  if (!pool.length) {
    root.append(el("p", { class: "empty" }, "No countries match the filters. Loosen them to start a test."));
    return;
  }

  const total = Math.min(opts.rounds, pool.length);
  const deck = sample(pool, total);

  const state = {
    deck,
    index: 0,
    step: "country", // "country" → "capital" → "next"
    score: 0,
    answersGiven: [], // { country, gotCountry, gotCapital, guessCountry, guessCapital }
    style: opts.style, // "mc" | "open"
    pool,
  };

  const header = el("div", { class: "test-header" });
  const stage = el("div", { class: "test-stage" });
  root.append(header, stage);

  renderRound();

  function updateHeader() {
    clear(header);
    header.append(
      el("div", { class: "round" }, `Round ${Math.min(state.index + 1, total)} / ${total}`),
      el("div", { class: "score" }, `Score: ${state.score}`),
    );
  }

  function renderRound() {
    if (state.index >= total) return renderResults();
    updateHeader();
    clear(stage);

    const country = state.deck[state.index];
    const flagImg = el("img", {
      class: "flag",
      src: flagUrl(country.code, "w640"),
      srcset: flagSrcset(country.code),
      alt: "Country flag",
    });

    const prompt = el("div", { class: "prompt" },
      state.step === "country" ? "Which country?" : `Which capital? (${country.name})`
    );

    stage.append(flagImg, prompt);

    if (state.style === "mc") renderMC(country);
    else renderOpen(country);
  }

  function renderMC(country) {
    const field = state.step === "country" ? "name" : "capital";
    const distractors = pickDistractors(country, state.pool, 3, field);
    const options = shuffle([country, ...distractors]);
    const grid = el("div", { class: "options" });
    for (const opt of options) {
      const btn = el("button", {
        class: "option",
        onclick: () => choose(opt[field]),
      }, opt[field]);
      grid.append(btn);
    }
    stage.append(grid);

    function choose(value) {
      const correct = value === country[field];
      // Mark UI
      for (const b of grid.querySelectorAll(".option")) {
        b.disabled = true;
        const t = b.textContent;
        if (t === country[field]) b.classList.add("correct");
        else if (t === value) b.classList.add("wrong");
      }
      recordAnswer(country, field, value, correct);
      stage.append(buildContinueButton(country));
    }
  }

  function renderOpen(country) {
    const field = state.step === "country" ? "name" : "capital";
    const input = el("input", {
      class: "answer-input",
      type: "text",
      autocomplete: "off",
      autocapitalize: "words",
      spellcheck: "false",
      placeholder: state.step === "country" ? "Type the country…" : "Type the capital…",
    });
    const feedback = el("div", { class: "feedback" });
    const submit = el("button", { class: "btn primary", onclick: check }, "Submit");

    const form = el("form", {
      class: "open-form",
      onsubmit: (e) => { e.preventDefault(); check(); },
    }, [input, submit]);

    stage.append(form, feedback);
    setTimeout(() => input.focus(), 0);

    function check() {
      const guess = input.value.trim();
      if (!guess) return;
      const correct = matchesAnswer(guess, country, field);
      input.disabled = true;
      submit.disabled = true;
      feedback.classList.add(correct ? "correct" : "wrong");
      feedback.textContent = correct
        ? `Correct — ${country[field]}`
        : `Answer: ${country[field]}`;
      recordAnswer(country, field, guess, correct);
      stage.append(buildContinueButton(country));
    }
  }

  function buildContinueButton(country) {
    const isCountryStep = state.step === "country";
    return el("button", {
      class: "btn primary continue",
      onclick: () => {
        if (isCountryStep) {
          state.step = "capital";
          renderRound();
        } else {
          state.step = "country";
          state.index += 1;
          renderRound();
        }
      },
    }, isCountryStep ? "Next: capital" : (state.index + 1 >= total ? "See results" : "Next country"));
  }

  function recordAnswer(country, field, guess, correct) {
    if (correct) state.score += 1;
    const existing = state.answersGiven.find((a) => a.country === country);
    const entry = existing || { country, gotCountry: null, gotCapital: null, guessCountry: "", guessCapital: "" };
    if (field === "name") {
      entry.gotCountry = correct;
      entry.guessCountry = guess;
    } else {
      entry.gotCapital = correct;
      entry.guessCapital = guess;
    }
    if (!existing) state.answersGiven.push(entry);
    updateHeader();
  }

  function renderResults() {
    clear(header);
    clear(stage);
    const maxScore = total * 2;
    const pct = Math.round((state.score / maxScore) * 100);

    // Persist best score
    const key = opts.scopeKey;
    const best = storage.get(SCORE_KEY, {});
    const prev = best[key] || 0;
    const newBest = state.score > prev;
    if (newBest) {
      best[key] = state.score;
      storage.set(SCORE_KEY, best);
    }

    stage.append(
      el("h2", {}, `Final score: ${state.score} / ${maxScore} (${pct}%)`),
      newBest ? el("p", { class: "best-badge" }, `New best for ${key}!`) :
                el("p", {}, `Best on these filters: ${Math.max(prev, state.score)}`),
    );

    const review = el("div", { class: "review" });
    review.append(el("h3", {}, "Round review"));
    for (const a of state.answersGiven) {
      const c = a.country;
      const row = el("div", { class: "review-row" }, [
        el("img", { class: "flag-thumb", src: flagUrl(c.code, "w80"), alt: "" }),
        el("div", { class: "review-meta" }, [
          el("div", {}, `${c.name} — ${c.capital}`),
          el("div", { class: "review-sub" }, [
            el("span", { class: a.gotCountry ? "ok" : "no" },
              a.gotCountry ? "✓ country" : `✗ country${a.guessCountry ? ` (“${a.guessCountry}”)` : ""}`),
            " · ",
            el("span", { class: a.gotCapital ? "ok" : "no" },
              a.gotCapital ? "✓ capital" : `✗ capital${a.guessCapital ? ` (“${a.guessCapital}”)` : ""}`),
          ]),
        ]),
      ]);
      review.append(row);
    }
    stage.append(review);

    stage.append(
      el("div", { class: "controls" }, [
        el("button", { class: "btn primary", onclick: () => mountTest(root, pool, opts) }, "Play again"),
        el("button", { class: "btn", onclick: opts.onExit }, "Back to menu"),
      ])
    );
  }
}
