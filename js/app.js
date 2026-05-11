// App shell: filters, mode switching, view routing.

import { COUNTRIES, CONTINENTS, REGIONS_BY_CONTINENT } from "../data/countries.js";
import { storage, el, clear } from "./util.js";
import { mountLearn } from "./learn.js";
import { mountTest } from "./test.js";

const FILTER_KEY = "flagtrivia:filters";

const defaultFilters = {
  continents: CONTINENTS.slice(),
  regions: [],          // empty = all regions within selected continents
  difficultyMin: 1,
  difficultyMax: 3,     // start easy
};

const state = {
  filters: { ...defaultFilters, ...storage.get(FILTER_KEY, {}) },
  view: "menu",         // "menu" | "learn" | "test"
};

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  refs.filterBar = document.getElementById("filter-bar");
  refs.view = document.getElementById("view");
  refs.poolCount = document.getElementById("pool-count");
  refs.modeButtons = document.querySelectorAll("[data-mode]");

  buildFilterBar();
  bindModeButtons();
  render();
});

function bindModeButtons() {
  for (const btn of refs.modeButtons) {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.mode;
      render();
    });
  }
}

function pool() {
  const { continents, regions, difficultyMin, difficultyMax } = state.filters;
  return COUNTRIES.filter((c) => {
    if (!continents.includes(c.continent)) return false;
    if (regions.length && !regions.includes(c.region)) return false;
    if (c.difficulty < difficultyMin || c.difficulty > difficultyMax) return false;
    return true;
  });
}

function saveFilters() {
  storage.set(FILTER_KEY, state.filters);
  updatePoolCount();
}

function updatePoolCount() {
  refs.poolCount.textContent = `${pool().length} countries match`;
}

function buildFilterBar() {
  clear(refs.filterBar);

  // ── Continent chips ─────────────────────────────────────────────────────
  const contRow = el("div", { class: "filter-row" }, [
    el("span", { class: "filter-label" }, "Continents:"),
  ]);
  for (const cont of CONTINENTS) {
    const active = state.filters.continents.includes(cont);
    const chip = el("button", {
      class: "chip" + (active ? " active" : ""),
      onclick: () => {
        const set = new Set(state.filters.continents);
        if (set.has(cont)) set.delete(cont); else set.add(cont);
        state.filters.continents = [...set];
        // Drop regions that are no longer reachable
        state.filters.regions = state.filters.regions.filter((r) =>
          state.filters.continents.some((c) => REGIONS_BY_CONTINENT[c].includes(r))
        );
        saveFilters();
        buildFilterBar();
      },
    }, cont);
    contRow.append(chip);
  }
  refs.filterBar.append(contRow);

  // ── Region chips (expandable, only for selected continents) ─────────────
  const regionsRow = el("div", { class: "filter-row regions-row" }, [
    el("span", { class: "filter-label" }, "Regions:"),
  ]);
  const allBtn = el("button", {
    class: "chip" + (state.filters.regions.length === 0 ? " active" : ""),
    onclick: () => {
      state.filters.regions = [];
      saveFilters();
      buildFilterBar();
    },
  }, "All");
  regionsRow.append(allBtn);
  for (const cont of state.filters.continents) {
    for (const r of REGIONS_BY_CONTINENT[cont]) {
      const active = state.filters.regions.includes(r);
      const chip = el("button", {
        class: "chip small" + (active ? " active" : ""),
        onclick: () => {
          const set = new Set(state.filters.regions);
          if (set.has(r)) set.delete(r); else set.add(r);
          state.filters.regions = [...set];
          saveFilters();
          buildFilterBar();
        },
      }, r);
      regionsRow.append(chip);
    }
  }
  refs.filterBar.append(regionsRow);

  // ── Difficulty range ────────────────────────────────────────────────────
  const diffRow = el("div", { class: "filter-row" }, [
    el("span", { class: "filter-label" }, "Difficulty:"),
  ]);
  const minInput = el("input", {
    type: "number", min: "1", max: "10", value: state.filters.difficultyMin,
    class: "diff-input",
    oninput: (e) => {
      let v = clamp(parseInt(e.target.value || "1", 10), 1, 10);
      state.filters.difficultyMin = v;
      if (state.filters.difficultyMax < v) state.filters.difficultyMax = v;
      saveFilters();
      buildFilterBar();
    },
  });
  const maxInput = el("input", {
    type: "number", min: "1", max: "10", value: state.filters.difficultyMax,
    class: "diff-input",
    oninput: (e) => {
      let v = clamp(parseInt(e.target.value || "10", 10), 1, 10);
      state.filters.difficultyMax = v;
      if (state.filters.difficultyMin > v) state.filters.difficultyMin = v;
      saveFilters();
      buildFilterBar();
    },
  });
  diffRow.append(minInput, el("span", {}, " to "), maxInput, el("span", { class: "hint-sub" }, " (1 = household names, 10 = obscure)"));

  // quick difficulty presets
  const presets = el("div", { class: "preset-row" }, [
    presetBtn("Easy (1–3)", 1, 3),
    presetBtn("Medium (1–6)", 1, 6),
    presetBtn("Hard (1–10)", 1, 10),
    presetBtn("Obscure (7–10)", 7, 10),
  ]);
  diffRow.append(presets);
  refs.filterBar.append(diffRow);

  refs.poolCount = document.getElementById("pool-count");
  updatePoolCount();
}

function presetBtn(label, min, max) {
  const active = state.filters.difficultyMin === min && state.filters.difficultyMax === max;
  return el("button", {
    class: "chip small" + (active ? " active" : ""),
    onclick: () => {
      state.filters.difficultyMin = min;
      state.filters.difficultyMax = max;
      saveFilters();
      buildFilterBar();
    },
  }, label);
}

function clamp(n, lo, hi) {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function render() {
  for (const btn of refs.modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === state.view);
  }

  if (state.view === "menu") return renderMenu();
  if (state.view === "learn") return mountLearn(refs.view, pool());
  if (state.view === "test") return renderTestSetup();
}

function renderMenu() {
  clear(refs.view);
  refs.view.append(
    el("section", { class: "menu" }, [
      el("h2", {}, "Welcome"),
      el("p", {}, "Pick a mode above. Learn explores flags at your own pace; Test scores you on country + capital."),
      el("ul", { class: "menu-list" }, [
        el("li", {}, "Filter by continent, region, or difficulty in the bar at the top."),
        el("li", {}, "Difficulty 1 is for households names (USA, France). 10 is microstates and rarely-seen flags."),
        el("li", {}, "Flags are loaded from flagcdn.com over the network."),
      ]),
    ])
  );
}

function renderTestSetup() {
  clear(refs.view);
  const p = pool();
  if (!p.length) {
    refs.view.append(el("p", { class: "empty" }, "No countries match the filters."));
    return;
  }

  const setup = { rounds: 10, style: "mc" };

  const roundsRow = el("div", { class: "filter-row" }, [
    el("span", { class: "filter-label" }, "Rounds:"),
    ...[5, 10, 20, 50, Math.min(p.length, 200)].map((n) =>
      el("button", {
        class: "chip" + (setup.rounds === n ? " active" : ""),
        onclick: (e) => {
          setup.rounds = n;
          for (const b of roundsRow.querySelectorAll(".chip")) b.classList.remove("active");
          e.target.classList.add("active");
        },
      }, n === p.length ? `All ${n}` : `${n}`)
    ),
  ]);

  const styleRow = el("div", { class: "filter-row" }, [
    el("span", { class: "filter-label" }, "Answer style:"),
    el("button", {
      class: "chip active",
      onclick: (e) => {
        setup.style = "mc";
        styleRow.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
      },
    }, "Multiple choice"),
    el("button", {
      class: "chip",
      onclick: (e) => {
        setup.style = "open";
        styleRow.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
      },
    }, "Open text"),
  ]);

  const startBtn = el("button", {
    class: "btn primary big",
    onclick: () => {
      const scopeKey = `${setup.style}:c=${state.filters.continents.join(",") || "any"}:r=${state.filters.regions.join(",") || "all"}:d=${state.filters.difficultyMin}-${state.filters.difficultyMax}`;
      mountTest(refs.view, p, {
        rounds: setup.rounds,
        style: setup.style,
        scopeKey,
        onExit: () => { state.view = "menu"; render(); },
      });
    },
  }, "Start test");

  refs.view.append(
    el("section", { class: "test-setup" }, [
      el("h2", {}, "Test mode"),
      roundsRow,
      styleRow,
      el("div", { class: "controls" }, [startBtn]),
    ])
  );
}
