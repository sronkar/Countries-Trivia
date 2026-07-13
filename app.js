/* Countries Trivia — game logic */

const FLAG_URL = (code) => `https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${code}.svg`;

const MAX_ATTEMPTS = 3;
const MAX_SUGGESTIONS = 8;

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
  level: 1,
  mode: null,          // "flag" | "learn"
  // quiz state
  deck: [],
  deckPos: 0,
  current: null,
  stage: "country",    // "country" | "capital" | "done"
  attempts: 0,
  score: 0,
  streak: 0,
  questionNum: 0,
  // learn state
  learnDeck: [],
  learnPos: 0,
  learnStage: 0,       // 0 = map only, 1 = +name, 2 = +capital
};

// ---------- screens ----------

const screens = { menu: $("screen-menu"), quiz: $("screen-quiz"), learn: $("screen-learn") };

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  $("home-btn").classList.toggle("hidden", name === "menu");
}

// ---------- level picker ----------

function buildLevelPicker() {
  const picker = $("level-picker");
  for (let lv = 1; lv <= 5; lv++) {
    const btn = document.createElement("button");
    btn.className = "level-btn" + (lv === state.level ? " selected" : "");
    btn.innerHTML = `<span class="lv-num">${lv}</span>${LEVEL_NAMES[lv]}`;
    btn.addEventListener("click", () => {
      state.level = lv;
      picker.querySelectorAll(".level-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      $("level-hint").textContent = LEVEL_HINTS[lv];
    });
    picker.appendChild(btn);
  }
  $("level-hint").textContent = LEVEL_HINTS[state.level];
}

function levelPool() {
  return COUNTRIES.filter((c) => c.level === state.level);
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
  if (!q) {
    box.classList.add("hidden");
    box.innerHTML = "";
    acItems = [];
    return;
  }
  const source = acSource();
  const starts = source.filter((n) => normalize(n).startsWith(q));
  const contains = source.filter((n) => !normalize(n).startsWith(q) && normalize(n).includes(q));
  acItems = [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  if (acItems.length === 0) {
    box.classList.add("hidden");
    box.innerHTML = "";
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

// ---------- quiz flow ----------

function startQuiz() {
  state.mode = "flag";
  state.deck = shuffle(levelPool());
  state.deckPos = 0;
  state.score = 0;
  state.streak = 0;
  state.questionNum = 0;
  $("quiz-level-badge").textContent = `Level ${state.level} · ${LEVEL_NAMES[state.level]} · Trivia`;
  showScreen("quiz");
  nextQuestion();
}

function nextQuestion() {
  if (state.deckPos >= state.deck.length) {
    state.deck = shuffle(levelPool());
    state.deckPos = 0;
  }
  state.current = state.deck[state.deckPos++];
  state.stage = "country";
  state.attempts = 0;
  state.questionNum++;

  const img = $("quiz-image");
  img.classList.add("flag-img");
  img.src = FLAG_URL(state.current.code);

  $("quiz-prompt").textContent = "Which country does this flag belong to?";
  $("quiz-feedback").textContent = "";
  $("quiz-feedback").className = "feedback";
  $("quiz-input").value = "";
  $("quiz-input").placeholder = "Type a country name...";
  $("quiz-input").disabled = false;
  $("quiz-submit").disabled = false;
  $("quiz-reveal").classList.remove("hidden");
  $("quiz-next").classList.add("hidden");
  hideSuggestions();
  updateStats();
  $("quiz-input").focus();
}

function updateStats() {
  $("stat-score").textContent = state.score;
  $("stat-streak").textContent = state.streak;
  $("stat-question").textContent = state.questionNum;
}

function submitGuess() {
  if (state.stage === "done") return;
  const guess = normalize($("quiz-input").value);
  if (!guess) return;
  hideSuggestions();

  const c = state.current;
  const correct = state.stage === "country" ? countryAnswers(c).includes(guess) : capitalAnswers(c).includes(guess);
  const fb = $("quiz-feedback");

  if (correct) {
    const points = Math.max(1, MAX_ATTEMPTS - state.attempts); // 3 first try, 2 second, 1 third
    state.score += points;
    if (state.stage === "country") {
      fb.textContent = `✔ Correct, it's ${c.name}! (+${points}) Now — what is its capital?`;
      fb.className = "feedback good";
      state.stage = "capital";
      state.attempts = 0;
      $("quiz-prompt").textContent = `What is the capital of ${c.name}?`;
      $("quiz-input").value = "";
      $("quiz-input").placeholder = "Type a capital city...";
      $("quiz-input").focus();
    } else {
      state.streak++;
      fb.textContent = `✔ Correct! The capital of ${c.name} is ${c.capital}. (+${points})`;
      fb.className = "feedback good";
      finishQuestion();
    }
  } else {
    state.attempts++;
    const what = state.stage === "country" ? "country" : "capital";
    if (state.attempts >= MAX_ATTEMPTS) {
      state.streak = 0;
      fb.textContent = state.stage === "country"
        ? `✘ Out of tries — it was ${c.name} (capital: ${c.capital}).`
        : `✘ Out of tries — the capital of ${c.name} is ${c.capital}.`;
      fb.className = "feedback bad";
      finishQuestion();
    } else {
      fb.textContent = `✘ Not that ${what} — ${MAX_ATTEMPTS - state.attempts} ${MAX_ATTEMPTS - state.attempts === 1 ? "try" : "tries"} left.`;
      fb.className = "feedback bad";
      $("quiz-input").select();
    }
  }
  updateStats();
}

function revealAnswer() {
  if (state.stage === "done") return;
  const c = state.current;
  state.streak = 0;
  $("quiz-feedback").textContent = `It was ${c.name} — capital: ${c.capital}.`;
  $("quiz-feedback").className = "feedback bad";
  finishQuestion();
  updateStats();
}

function finishQuestion() {
  state.stage = "done";
  $("quiz-input").disabled = true;
  $("quiz-submit").disabled = true;
  $("quiz-reveal").classList.add("hidden");
  $("quiz-next").classList.remove("hidden");
  $("quiz-next").focus();
}

// ---------- knowledge (learn) mode ----------

function startLearn() {
  state.mode = "learn";
  state.learnDeck = shuffle(levelPool());
  state.learnPos = 0;
  $("learn-level-badge").textContent = `Level ${state.level} · ${LEVEL_NAMES[state.level]} · Knowledge`;
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

document.querySelectorAll(".mode-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "learn") startLearn();
    else startQuiz();
  });
});

$("home-btn").addEventListener("click", () => showScreen("menu"));

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
$("quiz-reveal").addEventListener("click", revealAnswer);
$("quiz-next").addEventListener("click", nextQuestion);

document.addEventListener("keydown", (e) => {
  if (state.stage === "done" && e.key === "Enter" && !screens.quiz.classList.contains("hidden")) {
    nextQuestion();
  }
});

$("learn-card").addEventListener("click", learnCardClick);
$("learn-prev").addEventListener("click", (e) => { e.stopPropagation(); learnStep(-1); });
$("learn-next").addEventListener("click", (e) => { e.stopPropagation(); learnStep(1); });

showScreen("menu");
