/* Countries Trivia — game logic */

const FLAG_URL = (code) => `https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${code}.svg`;

const MAX_ATTEMPTS = 3;   // guesses per step (country / capital)
const MAX_WRONG = 3;      // missed countries before game over
const MAX_HINTS = 2;      // hints per game
const MAX_SUGGESTIONS = 8;
const EASY_HINT_MAX_LEVEL = 3; // levels 1-3 hint = multiple choice; 4-5 hint = region
const HS_KEY = "ct-highscores";
const NAME_KEY = "ct-player-name";
const STATS_KEY = "ct-country-stats";
const capitalBonus = (c) => Math.round(c.points / 2);

// ---------- helpers ----------

const $ = (id) => document.getElementById(id);

function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]/g, "");      // strip spaces & punctuation
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_COUNTRY_NAMES = COUNTRIES.map((c) => c.name).sort((a, b) => a.localeCompare(b));
const ALL_CAPITAL_NAMES = [...new Set(COUNTRIES.map((c) => c.capital))].sort((a, b) => a.localeCompare(b));

function countryAnswers(c) {
  return [c.name, ...c.aliases].map(normalize);
}
function capitalAnswers(c) {
  return [c.capital, ...c.capitalAliases].map(normalize);
}

// ---------- global state ----------

const state = {
  levels: new Set([1]),
  mode: null,          // "flag" | "learn"
  // trivia game state
  deck: [],            // shuffled, never refilled — no repeats within a game
  deckPos: 0,
  current: null,
  stage: "country",    // "country" | "capital" | "done" | "over"
  attempts: 0,
  score: 0,            // total points (tiered per country + capital bonus)
  countriesRight: 0,   // countries guessed correctly
  capitals: 0,         // capitals guessed correctly
  wrong: 0,            // countries missed (game over at MAX_WRONG)
  hintsLeft: MAX_HINTS,
  hintedThisQuestion: false,
  questionNum: 0,
  saved: false,
  // 2-player duel: null in solo, else {players:[{name,score,hints}...], turn, target}
  duel: null,
  // learn state
  learnDeck: [],
  learnPos: 0,
  learnStage: 0,       // 0 = flag only, 1 = +name, 2 = +capital
};

// ---------- screens ----------

const screens = {
  menu: $("screen-menu"),
  quiz: $("screen-quiz"),
  over: $("screen-over"),
  learn: $("screen-learn"),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  $("home-btn").classList.toggle("hidden", name === "menu");
}

// ---------- level picker (multi-select) ----------

function levelsLabel() {
  return "Level " + [...state.levels].sort().join("+");
}

function levelPool() {
  return COUNTRIES.filter((c) => state.levels.has(c.level));
}

function updateLevelHint() {
  const hint = $("level-hint");
  if (state.levels.size === 0) {
    hint.textContent = "Select at least one level to play";
    return;
  }
  const names = [...state.levels].sort().map((l) => LEVEL_NAMES[l]).join(" + ");
  hint.textContent = `${names} — ${levelPool().length} flags in play`;
}

function refreshLevelButtons() {
  $("level-picker").querySelectorAll(".level-btn").forEach((btn, i) => {
    btn.classList.toggle("selected", state.levels.has(i + 1));
  });
  updateLevelHint();
}

function buildLevelPicker() {
  const picker = $("level-picker");
  for (let lv = 1; lv <= 5; lv++) {
    const btn = document.createElement("button");
    btn.className = "level-btn" + (state.levels.has(lv) ? " selected" : "");
    btn.innerHTML = `<span class="lv-num">${lv}</span>${LEVEL_NAMES[lv]}`;
    btn.title = LEVEL_HINTS[lv];
    btn.addEventListener("click", () => {
      if (state.levels.has(lv)) state.levels.delete(lv);
      else state.levels.add(lv);
      refreshLevelButtons();
    });
    picker.appendChild(btn);
  }
  $("levels-all").addEventListener("click", () => {
    state.levels = new Set([1, 2, 3, 4, 5]);
    refreshLevelButtons();
  });
  $("levels-none").addEventListener("click", () => {
    state.levels.clear();
    refreshLevelButtons();
  });
  updateLevelHint();
}

// true when playable; otherwise nudges the user to pick a level
function requireLevels() {
  if (state.levels.size > 0) return true;
  const hint = $("level-hint");
  hint.classList.remove("shake");
  void hint.offsetWidth; // restart the animation
  hint.classList.add("shake");
  return false;
}

// ---------- autocomplete ----------

let acItems = [];
let acActive = -1;

function acSource() {
  return state.stage === "country" ? ALL_COUNTRY_NAMES : ALL_CAPITAL_NAMES;
}

function updateSuggestions() {
  const box = $("quiz-suggestions");
  const q = normalize($("quiz-input").value);
  acActive = -1;
  if (!q || (state.stage !== "country" && state.stage !== "capital")) {
    hideSuggestions();
    return;
  }
  const source = acSource();
  const starts = source.filter((n) => normalize(n).startsWith(q));
  const contains = source.filter((n) => !normalize(n).startsWith(q) && normalize(n).includes(q));
  acItems = [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  if (acItems.length === 0) {
    hideSuggestions();
    return;
  }
  box.innerHTML = "";
  acItems.forEach((name, i) => {
    const li = document.createElement("li");
    li.textContent = name;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep input focus
      pickSuggestion(i);
    });
    box.appendChild(li);
  });
  box.classList.remove("hidden");
}

function pickSuggestion(i) {
  $("quiz-input").value = acItems[i];
  hideSuggestions();
  submitGuess();
}

function hideSuggestions() {
  $("quiz-suggestions").classList.add("hidden");
  $("quiz-suggestions").innerHTML = "";
  acItems = [];
  acActive = -1;
}

function moveActive(delta) {
  if (acItems.length === 0) return;
  acActive = (acActive + delta + acItems.length) % acItems.length;
  const lis = $("quiz-suggestions").querySelectorAll("li");
  lis.forEach((li, i) => li.classList.toggle("active", i === acActive));
  lis[acActive].scrollIntoView({ block: "nearest" });
}

// ---------- trivia game flow ----------

const duelP = () => state.duel.players[state.duel.turn];
const duelOther = () => state.duel.players[1 - state.duel.turn];
const duelLeader = () =>
  state.duel.players[0].score >= state.duel.players[1].score ? state.duel.players[0] : state.duel.players[1];
const duelWon = () => state.duel.players.some((p) => p.score >= state.duel.target);

function startQuiz() {
  if (!requireLevels()) return;
  state.duel = null;
  beginGame();
}

function startDuel() {
  if (!requireLevels()) return;
  const p1 = $("duel-p1").value.trim() || "Player 1";
  const p2 = $("duel-p2").value.trim() || "Player 2";
  const target = Math.max(10, parseInt($("duel-target").value, 10) || 100);
  try {
    localStorage.setItem("ct-duel-names", JSON.stringify([p1, p2]));
  } catch { /* ignore */ }
  state.duel = {
    players: [
      { name: p1, score: 0, hints: MAX_HINTS },
      { name: p2, score: 0, hints: MAX_HINTS },
    ],
    turn: 0,
    target,
  };
  beginGame();
}

// Duel decks are dealt in rounds of two same-tier flags, so each turn both
// players compete for (nearly) the same points. Leftover singles per tier are
// paired with the nearest tier; a final unpaired flag is dropped so both
// players always face the same number of questions.
function buildDuelDeck(pool) {
  const byTier = {};
  shuffle(pool).forEach((c) => (byTier[c.tier] = byTier[c.tier] || []).push(c));
  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  const pairs = [];
  let carry = null; // an odd tier's spare pairs with the next tier up
  for (const tier of tiers) {
    const group = byTier[tier];
    if (carry) {
      pairs.push([carry, group.pop()]);
      carry = null;
    }
    while (group.length >= 2) pairs.push([group.pop(), group.pop()]);
    if (group.length) carry = group.pop();
  }
  return shuffle(pairs).flat();
}

function beginGame() {
  state.mode = "flag";
  state.deck = state.duel ? buildDuelDeck(levelPool()) : shuffle(levelPool());
  state.deckPos = 0;
  state.score = 0;
  state.countriesRight = 0;
  state.capitals = 0;
  state.wrong = 0;
  state.hintsLeft = MAX_HINTS;
  state.questionNum = 0;
  state.saved = false;
  $("quiz-level-badge").textContent =
    `${levelsLabel()} · ` + (state.duel ? `Duel to ${state.duel.target}` : "Trivia");
  $("wrap-score").classList.toggle("hidden", !!state.duel);
  $("wrap-lives").classList.toggle("hidden", !!state.duel);
  $("duel-bar").classList.toggle("hidden", !state.duel);
  showScreen("quiz");
  nextQuestion();
}

function nextQuestion() {
  const finished = state.duel
    ? duelWon() || state.deckPos >= state.deck.length
    : state.wrong >= MAX_WRONG || state.deckPos >= state.deck.length;
  if (finished) {
    gameOver();
    return;
  }
  state.current = state.deck[state.deckPos++];
  state.stage = "country";
  state.attempts = 0;
  state.hintedThisQuestion = false;
  state.questionNum++;

  $("quiz-image").src = FLAG_URL(state.current.code);
  $("quiz-tier").textContent = `Tier ${state.current.tier} · worth ${state.current.points} pts`;
  $("quiz-prompt").textContent =
    (state.duel ? `${duelP().name} — w` : "W") + "hich country does this flag belong to?";
  setFeedback("", "");
  $("quiz-input").value = "";
  $("quiz-input").placeholder = "Type a country name...";
  $("quiz-input").disabled = false;
  $("quiz-submit").disabled = false;
  $("hint-box").classList.add("hidden");
  $("hint-box").innerHTML = "";
  $("quiz-reveal").classList.remove("hidden");
  $("quiz-next").classList.add("hidden");
  updateHintButton();
  hideSuggestions();
  updateStats();
  $("quiz-input").focus();
}

function hintsLeftNow() {
  return state.duel ? duelP().hints : state.hintsLeft;
}

function updateStats() {
  $("stat-score").textContent = state.score;
  $("stat-lives").textContent =
    "❤".repeat(MAX_WRONG - state.wrong) + "♡".repeat(state.wrong);
  $("stat-hints").textContent = hintsLeftNow();
  $("stat-question").textContent = `${state.questionNum} / ${state.deck.length}`;
  if (state.duel) {
    $("duel-bar").innerHTML = state.duel.players
      .map(
        (p, i) =>
          `<span class="duel-player${i === state.duel.turn ? " active" : ""}">${escapeHtml(p.name)} <b>${p.score}</b></span>`
      )
      .join('<span class="duel-vs">vs</span>') +
      `<span class="duel-target">first to ${state.duel.target}</span>`;
  }
}

function updateHintButton() {
  const btn = $("quiz-hint");
  const usable = state.stage === "country" && hintsLeftNow() > 0 && !state.hintedThisQuestion;
  btn.classList.toggle("hidden", state.stage !== "country");
  btn.disabled = !usable;
  btn.textContent = `💡 Hint (${hintsLeftNow()} left)`;
}

function setFeedback(text, kind) {
  const fb = $("quiz-feedback");
  fb.textContent = text;
  fb.className = "feedback" + (kind ? " " + kind : "");
}

function submitGuess() {
  if (state.stage !== "country" && state.stage !== "capital") return;
  const guess = normalize($("quiz-input").value);
  if (!guess) return;
  hideSuggestions();

  const c = state.current;

  if (state.stage === "country") {
    if (countryAnswers(c).includes(guess)) {
      if (state.duel) duelP().score += c.points;
      else state.score += c.points;
      state.countriesRight++;
      recordResult(c.code, { seen: 1, right: 1, hinted: state.hintedThisQuestion ? 1 : 0 });
      setFeedback(`✔ Correct! It's ${c.name}. +${c.points} pts`, "good");
      pauseForNext("Next: guess the capital ➜");
      state.afterNext = "capital";
    } else {
      state.attempts++;
      if (state.attempts >= MAX_ATTEMPTS) {
        if (!state.duel) state.wrong++;
        recordResult(c.code, { seen: 1, right: 0, hinted: state.hintedThisQuestion ? 1 : 0 });
        setFeedback(`✘ Wrong — it was ${c.name} (capital: ${c.capital}).`, "bad");
        pauseForNext(nextLabel());
        state.afterNext = "question";
      } else {
        setFeedback(`✘ Wrong country — ${MAX_ATTEMPTS - state.attempts} ${MAX_ATTEMPTS - state.attempts === 1 ? "try" : "tries"} left.`, "bad");
        $("quiz-input").select();
      }
    }
  } else {
    if (capitalAnswers(c).includes(guess)) {
      state.capitals++;
      if (state.duel) duelP().score += capitalBonus(c);
      else state.score += capitalBonus(c);
      recordResult(c.code, { capSeen: 1, capRight: 1 });
      setFeedback(`✔ Correct! The capital of ${c.name} is ${c.capital}. +${capitalBonus(c)} pts bonus`, "good");
    } else {
      state.attempts++;
      if (state.attempts < MAX_ATTEMPTS) {
        setFeedback(`✘ Wrong capital — ${MAX_ATTEMPTS - state.attempts} ${MAX_ATTEMPTS - state.attempts === 1 ? "try" : "tries"} left.`, "bad");
        $("quiz-input").select();
        updateStats();
        return;
      }
      recordResult(c.code, { capSeen: 1, capRight: 0 });
      setFeedback(`✘ Wrong — the capital of ${c.name} is ${c.capital}.`, "bad");
    }
    pauseForNext(nextLabel());
    state.afterNext = "question";
  }
  updateStats();
}

function nextLabel() {
  if (state.duel) {
    if (duelWon() || state.deckPos >= state.deck.length) return "See results ➜";
    return `Next: ${duelOther().name}'s turn ➜`;
  }
  if (state.wrong >= MAX_WRONG || state.deckPos >= state.deck.length) return "See results ➜";
  return "Next flag ➜";
}

// freeze input and wait for an explicit Next click
function pauseForNext(label) {
  state.stage = "done";
  $("quiz-input").disabled = true;
  $("quiz-submit").disabled = true;
  $("quiz-reveal").classList.add("hidden");
  $("quiz-hint").classList.add("hidden");
  $("hint-box").classList.add("hidden");
  const next = $("quiz-next");
  next.textContent = label;
  next.classList.remove("hidden");
  next.focus();
}

function onNext() {
  if (state.afterNext === "capital") {
    startCapitalStage();
  } else {
    if (state.duel) state.duel.turn = 1 - state.duel.turn; // hand over the flag
    nextQuestion();
  }
}

function startCapitalStage() {
  const c = state.current;
  state.stage = "capital";
  state.attempts = 0;
  $("quiz-prompt").textContent =
    (state.duel ? `${duelP().name} — w` : "W") + `hat is the capital of ${c.name}?`;
  setFeedback("", "");
  $("quiz-input").value = "";
  $("quiz-input").placeholder = "Type a capital city...";
  $("quiz-input").disabled = false;
  $("quiz-submit").disabled = false;
  $("quiz-reveal").classList.remove("hidden");
  $("quiz-next").classList.add("hidden");
  updateHintButton(); // hides it (country stage only)
  $("quiz-input").focus();
}

function giveUp() {
  const c = state.current;
  if (state.stage === "country") {
    if (!state.duel) state.wrong++;
    recordResult(c.code, { seen: 1, right: 0, hinted: state.hintedThisQuestion ? 1 : 0 });
    setFeedback(`It was ${c.name} (capital: ${c.capital}).`, "bad");
    pauseForNext(nextLabel());
    state.afterNext = "question";
  } else if (state.stage === "capital") {
    recordResult(c.code, { capSeen: 1, capRight: 0 });
    setFeedback(`The capital of ${c.name} is ${c.capital}.`, "bad");
    pauseForNext(nextLabel());
    state.afterNext = "question";
  }
  updateStats();
}

// ---------- per-country result tracking (for re-tuning tiers over time) ----------

function loadResultStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveResultStats(all) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}

function recordResult(code, patch) {
  const all = loadResultStats();
  const s = all[code] || { seen: 0, right: 0, capSeen: 0, capRight: 0, hinted: 0 };
  for (const k of Object.keys(patch)) s[k] = (s[k] || 0) + patch[k];
  all[code] = s;
  saveResultStats(all);
}

function statsRows() {
  const all = loadResultStats();
  return COUNTRIES.filter((c) => all[c.code])
    .map((c) => {
      const s = all[c.code];
      return {
        code: c.code,
        name: c.name,
        level: c.level,
        tier: c.tier,
        points: c.points,
        seen: s.seen,
        right: s.right,
        countryPct: s.seen ? Math.round((100 * s.right) / s.seen) : null,
        capSeen: s.capSeen,
        capRight: s.capRight,
        capitalPct: s.capSeen ? Math.round((100 * s.capRight) / s.capSeen) : null,
        hinted: s.hinted,
      };
    })
    .sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name));
}

function renderStatsPanel() {
  const panel = $("stats-panel");
  const rows = statsRows();
  if (rows.length === 0) {
    panel.innerHTML = '<p class="hs-empty">No games recorded yet — play some trivia first.</p>';
    return;
  }
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.tier}</td>
        <td>${r.seen}</td>
        <td>${r.countryPct === null ? "—" : r.countryPct + "%"}</td>
        <td>${r.capitalPct === null ? "—" : r.capitalPct + "%"}</td>
        <td>${r.hinted}</td>
      </tr>`
    )
    .join("");
  panel.innerHTML = `<div class="hs-scroll"><table class="hs-table">
    <thead><tr><th>Country</th><th>Tier</th><th>Seen</th><th>Guessed</th><th>Capital</th><th>Hints</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function exportStats() {
  const payload = {
    exported: new Date().toISOString(),
    tierPoints: TIER_POINTS,
    countries: statsRows(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "countries-trivia-stats.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- hints ----------

function useHint() {
  if (state.stage !== "country" || hintsLeftNow() <= 0 || state.hintedThisQuestion) return;
  if (state.duel) duelP().hints--;
  else state.hintsLeft--;
  state.hintedThisQuestion = true;
  const c = state.current;
  const box = $("hint-box");
  box.innerHTML = "";

  if (c.level <= EASY_HINT_MAX_LEVEL) {
    // easy hint: 3 options to choose from
    const decoys = shuffle(COUNTRIES.filter((x) => x.level === c.level && x.code !== c.code)).slice(0, 2);
    const options = shuffle([c, ...decoys]);
    const label = document.createElement("p");
    label.className = "hint-label";
    label.textContent = "💡 It's one of these:";
    box.appendChild(label);
    const row = document.createElement("div");
    row.className = "hint-options";
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "hint-option";
      b.textContent = opt.name;
      b.addEventListener("click", () => {
        if (state.stage !== "country") return;
        $("quiz-input").value = opt.name;
        submitGuess();
      });
      row.appendChild(b);
    });
    box.appendChild(row);
  } else {
    // hard hint: geographical location
    const label = document.createElement("p");
    label.className = "hint-label";
    label.textContent = `💡 Located in ${c.region}.`;
    box.appendChild(label);
  }
  box.classList.remove("hidden");
  updateHintButton();
  updateStats();
  $("quiz-input").focus();
}

// ---------- game over & high scores ----------

function loadHighScores() {
  try {
    return JSON.parse(localStorage.getItem(HS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHighScores(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  } catch { /* storage unavailable — scores just won't persist */ }
}

function renderHighScores(container) {
  const list = loadHighScores();
  if (list.length === 0) {
    container.innerHTML = '<p class="hs-empty">No scores yet — be the first!</p>';
    return;
  }
  const rows = list
    .map(
      (s, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${s.score}</td>
        <td>${s.countries ?? "—"}</td>
        <td>${s.capitals}</td>
        <td>${escapeHtml(s.levels)}</td>
        <td>${escapeHtml(s.date)}</td>
      </tr>`
    )
    .join("");
  container.innerHTML = `<div class="hs-scroll"><table class="hs-table">
    <thead><tr><th>#</th><th>Name</th><th>Points</th><th>Countries</th><th>Capitals</th><th>Levels</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function gameOver() {
  state.stage = "over";

  if (state.duel) {
    const [a, b] = state.duel.players;
    const tie = a.score === b.score;
    $("over-title").textContent = tie ? "🤝 It's a tie!" : `🏆 ${duelLeader().name} wins!`;
    $("over-summary").textContent =
      `${a.name} ${a.score} — ${b.score} ${b.name} · first to ${state.duel.target} · ` +
      `${levelsLabel()} · ${state.questionNum} flags played.`;
    // duel results aren't comparable to solo runs — no high-score entry
    $("over-save-form").classList.add("hidden");
    $("over-saved").classList.add("hidden");
    $("over-highscores").innerHTML = "";
    showScreen("over");
    $("over-again").focus();
    return;
  }

  const cleared = state.wrong < MAX_WRONG;
  $("over-title").textContent = cleared ? "🎉 You cleared every flag!" : "Game over!";
  $("over-summary").textContent =
    `You scored ${state.score} points: ` +
    `${state.countriesRight} ${state.countriesRight === 1 ? "country" : "countries"} ` +
    `(and ${state.capitals} ${state.capitals === 1 ? "capital" : "capitals"}) named correctly ` +
    `out of ${state.questionNum} flags — ${levelsLabel()}.`;
  $("over-save-form").classList.remove("hidden");
  $("over-saved").classList.add("hidden");
  try {
    $("over-name").value = localStorage.getItem(NAME_KEY) || "";
  } catch { /* ignore */ }
  renderHighScores($("over-highscores"));
  showScreen("over");
  $("over-name").focus();
}

function saveScore(e) {
  e.preventDefault();
  if (state.saved) return;
  const name = $("over-name").value.trim() || "Anonymous";
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch { /* ignore */ }
  const list = loadHighScores();
  list.push({
    name,
    score: state.score,
    countries: state.countriesRight,
    capitals: state.capitals,
    levels: levelsLabel().replace("Level ", ""),
    date: new Date().toLocaleDateString(),
  });
  list.sort((a, b) => b.score - a.score || b.capitals - a.capitals);
  saveHighScores(list.slice(0, 10));
  state.saved = true;
  $("over-save-form").classList.add("hidden");
  $("over-saved").classList.remove("hidden");
  renderHighScores($("over-highscores"));
}

// ---------- knowledge (learn) mode ----------

function startLearn() {
  if (!requireLevels()) return;
  state.mode = "learn";
  state.learnDeck = shuffle(levelPool());
  state.learnPos = 0;
  $("learn-level-badge").textContent = `${levelsLabel()} · Knowledge`;
  showScreen("learn");
  renderLearnCard();
}

function renderLearnCard() {
  const c = state.learnDeck[state.learnPos];
  state.learnStage = 0;
  $("learn-flag").src = FLAG_URL(c.code);
  $("learn-name").innerHTML = "&nbsp;";
  $("learn-capital").innerHTML = "&nbsp;";
  $("learn-hint").textContent = "Click the card to reveal the country";
  $("learn-progress").textContent = `${state.learnPos + 1} / ${state.learnDeck.length}`;
}

function learnCardClick() {
  const c = state.learnDeck[state.learnPos];
  if (state.learnStage === 0) {
    state.learnStage = 1;
    $("learn-name").textContent = c.name;
    $("learn-hint").textContent = "Click again to reveal the capital";
  } else if (state.learnStage === 1) {
    state.learnStage = 2;
    $("learn-capital").textContent = `Capital: ${c.capital}`;
    $("learn-hint").textContent = "Click for the next card";
  } else {
    learnStep(1);
  }
}

function learnStep(delta) {
  const n = state.learnDeck.length;
  state.learnPos = (state.learnPos + delta + n) % n;
  renderLearnCard();
}

// ---------- wiring ----------

// theme: honor a saved choice; otherwise follow the OS (or the artifact viewer's toggle)
const THEME_KEY = "ct-theme";
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* ignore */ }
$("theme-btn").addEventListener("click", () => {
  const root = document.documentElement;
  const current =
    root.dataset.theme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch { /* ignore */ }
});

buildLevelPicker();
renderHighScores($("menu-highscores"));

document.querySelectorAll(".mode-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "learn") startLearn();
    else if (btn.dataset.mode === "duel") {
      if (!requireLevels()) return;
      const setup = $("duel-setup");
      setup.classList.toggle("hidden");
      if (!setup.classList.contains("hidden")) {
        try {
          const [p1, p2] = JSON.parse(localStorage.getItem("ct-duel-names")) || [];
          if (p1 && !$("duel-p1").value) $("duel-p1").value = p1;
          if (p2 && !$("duel-p2").value) $("duel-p2").value = p2;
        } catch { /* ignore */ }
        setup.scrollIntoView({ behavior: "smooth", block: "nearest" });
        $("duel-p1").focus();
      }
    } else startQuiz();
  });
});

$("duel-start").addEventListener("click", startDuel);

$("home-btn").addEventListener("click", () => {
  renderHighScores($("menu-highscores"));
  showScreen("menu");
});

$("quiz-input").addEventListener("input", updateSuggestions);
$("quiz-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (acActive >= 0) pickSuggestion(acActive);
    else submitGuess();
  } else if (e.key === "Escape") hideSuggestions();
});
$("quiz-input").addEventListener("blur", () => setTimeout(hideSuggestions, 150));

$("quiz-submit").addEventListener("click", submitGuess);
$("quiz-reveal").addEventListener("click", giveUp);
$("quiz-hint").addEventListener("click", useHint);
$("quiz-next").addEventListener("click", onNext);

document.addEventListener("keydown", (e) => {
  if (state.stage === "done" && e.key === "Enter" && !screens.quiz.classList.contains("hidden")) {
    onNext();
  }
});

$("over-save-form").addEventListener("submit", saveScore);

$("stats-toggle").addEventListener("click", () => {
  const panel = $("stats-panel");
  const show = panel.classList.contains("hidden");
  if (show) renderStatsPanel();
  panel.classList.toggle("hidden", !show);
  $("stats-toggle").textContent = show ? "Hide stats" : "Show stats";
});
$("stats-export").addEventListener("click", exportStats);
$("stats-reset").addEventListener("click", () => {
  if (!confirm("Reset all recorded country results?")) return;
  try {
    localStorage.removeItem(STATS_KEY);
  } catch { /* ignore */ }
  renderStatsPanel();
});
$("over-again").addEventListener("click", () => {
  if (state.duel) {
    // rematch: same players & target, loser of the coin toss... just alternate starter
    state.duel.players.forEach((p) => { p.score = 0; p.hints = MAX_HINTS; });
    state.duel.turn = 0;
    beginGame();
  } else {
    startQuiz();
  }
});
$("over-menu").addEventListener("click", () => {
  renderHighScores($("menu-highscores"));
  showScreen("menu");
});

$("learn-card").addEventListener("click", learnCardClick);
$("learn-prev").addEventListener("click", (e) => { e.stopPropagation(); learnStep(-1); });
$("learn-next").addEventListener("click", (e) => { e.stopPropagation(); learnStep(1); });

showScreen("menu");
