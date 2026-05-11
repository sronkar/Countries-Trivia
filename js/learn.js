// Learn mode: show a flag, then click to reveal country, then capital, then next.

import { flagUrl, flagSrcset, shuffle, el, clear } from "./util.js";

const STAGES = ["flag", "country", "capital"];

export function mountLearn(root, pool) {
  clear(root);
  if (!pool.length) {
    root.append(el("p", { class: "empty" }, "No countries match the filters. Loosen them to start learning."));
    return;
  }

  const state = {
    deck: shuffle(pool),
    index: 0,
    stage: 0, // 0 = flag only, 1 = + country, 2 = + capital
    seenCount: 0,
  };

  const card = el("div", { class: "card learn-card", role: "button", tabindex: "0", "aria-label": "Tap to reveal" });
  const flagImg = el("img", { class: "flag", alt: "Country flag", loading: "eager" });
  const countryLine = el("div", { class: "reveal-line country" });
  const capitalLine = el("div", { class: "reveal-line capital" });
  const hint = el("div", { class: "hint" }, "Tap the flag to reveal the country");

  card.append(flagImg, countryLine, capitalLine, hint);

  const controls = el("div", { class: "controls" }, [
    el("button", { class: "btn", onclick: prev }, "Previous"),
    el("button", { class: "btn", onclick: skip }, "Skip"),
    el("button", { class: "btn primary", onclick: advance }, "Next"),
  ]);

  const progress = el("div", { class: "progress" });

  root.append(card, controls, progress);

  card.addEventListener("click", advance);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      advance();
    }
  });

  function current() {
    return state.deck[state.index];
  }

  function render() {
    const c = current();
    flagImg.src = flagUrl(c.code, "w640");
    flagImg.srcset = flagSrcset(c.code);
    flagImg.alt = `Flag of a country in ${c.region}`;

    countryLine.textContent = state.stage >= 1 ? c.name : "";
    countryLine.classList.toggle("visible", state.stage >= 1);

    capitalLine.textContent = state.stage >= 2 ? `Capital: ${c.capital}` : "";
    capitalLine.classList.toggle("visible", state.stage >= 2);

    hint.textContent =
      state.stage === 0 ? "Tap the flag to reveal the country" :
      state.stage === 1 ? "Tap again for the capital" :
      "Tap again for the next flag";

    progress.textContent = `${state.seenCount + 1} seen · ${state.deck.length} in pool`;
  }

  function advance() {
    if (state.stage < STAGES.length - 1) {
      state.stage += 1;
    } else {
      nextCountry();
    }
    render();
  }

  function nextCountry() {
    state.seenCount += 1;
    state.index += 1;
    state.stage = 0;
    if (state.index >= state.deck.length) {
      state.deck = shuffle(pool);
      state.index = 0;
    }
  }

  function skip() {
    nextCountry();
    render();
  }

  function prev() {
    if (state.index === 0) return;
    state.index -= 1;
    state.seenCount = Math.max(0, state.seenCount - 1);
    state.stage = 2; // show full reveal on previous so you can study what you missed
    render();
  }

  render();
}
