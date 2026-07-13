/* Countries Trivia — game logic */

const FLAG_URL = (code) => `https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${code}.svg`;

const MAX_ATTEMPTS = 3;   // guesses per step (country / capital)
const MAX_WRONG = 3;      // missed countries before game over
const MAX_HINTS = 2;      // hints per game
const MAX_SUGGESTIONS = 8;
const EASY_HINT_MAX_LEVEL = 3; // levels 1-3 hint = multiple choice; 4-5 hint = region
const HS_KEY = "ct-highscores";
const NAME_KEY = "ct-player-name";

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
  score: 0,            // countries guessed correctly
  capitals: 0,         // capitals guessed correctly
  wrong: 0,            // countries missed (game over at MAX_WRONG)
  hintsLeft: MAX_HINTS,
  hintedThisQuestion: false,
  questionNum: 0,
  saved: false,
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
  const lvls = [...state.levels].sort();
  const names = lvls.map((l) => LEVEL_NAMES[l]).join(" + ");
  $("level-hint").textContent = `${names} — ${levelPool().length} flags in play`;
}

function buildLevelPicker() {
  const picker = $("level-picker");
  for (let lv = 1; lv <= 5; lv++) {
    const btn = document.createElement("button");
    btn.className = "level-btn" + (state.levels.has(lv) ? " selected" : "");
    btn.innerHTML = `<span class="lv-num">${lv}</span>${LEVEL_NAMES[lv]}`;
    btn.title = LEVEL_HINTS[lv];
    btn.addEventListener("click", () => {
      if (state.levels.has(lv)) {
        if (state.levels.size === 1) return; // keep at least one level selected
        state.levels.delete(lv);
        btn.classList.remove("selected");
      } else {
        state.levels.add(lv);
        btn.classList.add("selected");
      }
      updateLevelHint();
    });
    picker.appendChild(btn);
  }
  updateLevelHint();
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

function startQuiz() {
  state.mode = "flag";
  state.deck = shuffle(levelPool());
  state.deckPos = 0;
  state.score = 0;
  state.capitals = 0;
  state.wrong = 0;
  state.hintsLeft = MAX_HINTS;
  state.questionNum = 0;
  state.saved = false;
  $("quiz-level-badge").textContent = `${levelsLabel()} · Trivia`;
  showScreen("quiz");
  nextQuestion();
}

function nextQuestion() {
  if (state.wrong >= MAX_WRONG || state.deckPos >= state.deck.length) {
    gameOver();
    return;
  }
  state.current = state.deck[state.deckPos++];
  state.stage = "country";
  state.attempts = 0;
  state.hintedThisQuestion = false;
  state.questionNum++;

  $("quiz-image").src = FLAG_URL(state.current.code);
  $("quiz-prompt").textContent = "Which country does this flag belong to?";
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

function updateStats() {
  $("stat-score").textContent = state.score;
  $("stat-lives").textContent =
    "❤".repeat(MAX_WRONG - state.wrong) + "♡".repeat(state.wrong);
  $("stat-hints").textContent = state.hintsLeft;
  $("stat-question").textContent = `${state.questionNum} / ${state.deck.length}`;
}

function updateHintButton() {
  const btn = $("quiz-hint");
  const usable = state.stage === "country" && state.hintsLeft > 0 && !state.hintedThisQuestion;
  btn.classList.toggle("hidden", state.stage !== "country");
  btn.disabled = !usable;
  btn.textContent = `💡 Hint (${state.hintsLeft} left)`;
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
      state.score++;
      setFeedback(`✔ Correct! It's ${c.name}.`, "good");
      pauseForNext("Next: guess the capital ➜");
      state.afterNext = "capital";
    } else {
      state.attempts++;
      if (state.attempts >= MAX_ATTEMPTS) {
        state.wrong++;
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
      setFeedback(`✔ Correct! The capital of ${c.name} is ${c.capital}.`, "good");
    } else {
      state.attempts++;
      if (state.attempts < MAX_ATTEMPTS) {
        setFeedback(`✘ Wrong capital — ${MAX_ATTEMPTS - state.attempts} ${MAX_ATTEMPTS - state.attempts === 1 ? "try" : "tries"} left.`, "bad");
        $("quiz-input").select();
        updateStats();
        return;
      }
      setFeedback(`✘ Wrong — the capital of ${c.name} is ${c.capital}.`, "bad");
    }
    pauseForNext(nextLabel());
    state.afterNext = "question";
  }
  updateStats();
}

function nextLabel() {
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
    nextQuestion();
  }
}

function startCapitalStage() {
  const c = state.current;
  state.stage = "capital";
  state.attempts = 0;
  $("quiz-prompt").textContent = `What is the capital of ${c.name}?`;
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
    state.wrong++;
    setFeedback(`It was ${c.name} (capital: ${c.capital}).`, "bad");
    pauseForNext(nextLabel());
    state.afterNext = "question";
  } else if (state.stage === "capital") {
    setFeedback(`The capital of ${c.name} is ${c.capital}.`, "bad");
    pauseForNext(nextLabel());
    state.afterNext = "question";
  }
  updateStats();
}

// ---------- hints ----------

function useHint() {
  if (state.stage !== "country" || state.hintsLeft <= 0 || state.hintedThisQuestion) return;
  state.hintsLeft--;
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
        <td>${s.capitals}</td>
        <td>${escapeHtml(s.levels)}</td>
        <td>${escapeHtml(s.date)}</td>
      </tr>`
    )
    .join("");
  container.innerHTML = `<div class="hs-scroll"><table class="hs-table">
    <thead><tr><th>#</th><th>Name</th><th>Countries</th><th>Capitals</th><th>Levels</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function gameOver() {
  state.stage = "over";
  const cleared = state.wrong < MAX_WRONG;
  $("over-title").textContent = cleared ? "🎉 You cleared every flag!" : "Game over!";
  $("over-summary").textContent =
    `You named ${state.score} ${state.score === 1 ? "country" : "countries"} correctly ` +
    `(and ${state.capitals} ${state.capitals === 1 ? "capital" : "capitals"}) ` +
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

buildLevelPicker();
renderHighScores($("menu-highscores"));

document.querySelectorAll(".mode-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "learn") startLearn();
    else startQuiz();
  });
});

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
$("over-again").addEventListener("click", startQuiz);
$("over-menu").addEventListener("click", () => {
  renderHighScores($("menu-highscores"));
  showScreen("menu");
});

$("learn-card").addEventListener("click", learnCardClick);
$("learn-prev").addEventListener("click", (e) => { e.stopPropagation(); learnStep(-1); });
$("learn-next").addEventListener("click", (e) => { e.stopPropagation(); learnStep(1); });

showScreen("menu");
