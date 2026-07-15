/* Countries Trivia — game logic */

const FLAG_URL = (code) => `flags/${code}.svg`; // bundled locally — works offline

const MAX_ATTEMPTS = 3;   // guesses per step (country / capital)
const MAX_WRONG = 3;      // missed countries before game over
const MAX_HINTS = 2;      // hints per game
const TURN_SECONDS = 20;  // duel: time allowed per guess
const MAX_SUGGESTIONS = 8;
const EASY_HINT_MAX_LEVEL = 3; // levels 1-3 hint = multiple choice; 4-5 hint = region
const HS_KEY = "ct-highscores";
const NAME_KEY = "ct-player-name";
const STATS_KEY = "ct-country-stats";
const capitalBonus = (c) => Math.round(c.points / 2);

// ---------- helpers ----------

const $ = (id) => document.getElementById(id);

// On touch devices, focusing the input opens the keyboard and shoves the flag
// off-screen — only auto-focus when a fine pointer (mouse/trackpad) is present.
const COARSE_POINTER = window.matchMedia("(pointer: coarse)").matches;
function focusInput(el) {
  if (!COARSE_POINTER) el.focus();
}

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
  paused: false,       // a game is parked behind the menu, resumable
  askCapitals: true,   // menu option: follow up each flag with its capital
  multiChoice: false,  // menu option: answer by picking one of 6 options
  choices: null,       // {country:[names], capital:[names]} for the current flag
  // 2-player duel: null in solo, else {players:[{name,score,caps,wrong}...], turn, target}
  duel: null,
  steal: null,         // {owner} while a missed duel flag is offered to the opponent
  afterNext: "question", // what the Next button leads to: "question" | "steal"
  timeLeft: TURN_SECONDS, // duel: seconds remaining for the current guess
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

// in-page confirm dialog (native confirm() can be blocked inside sandboxed frames)
function askConfirm(text, yesLabel, noLabel) {
  return new Promise((resolve) => {
    $("modal-text").textContent = text;
    $("modal-yes").textContent = yesLabel;
    $("modal-no").textContent = noLabel;
    $("modal").classList.remove("hidden");
    const done = (v) => {
      $("modal").classList.add("hidden");
      $("modal-yes").onclick = $("modal-no").onclick = $("modal").onclick = null;
      resolve(v);
    };
    $("modal-yes").onclick = () => done(true);
    $("modal-no").onclick = () => done(false);
    $("modal").onclick = (e) => { if (e.target === $("modal")) done(false); };
    $("modal-no").focus();
  });
}

async function confirmDiscardPaused() {
  if (!state.paused) return true;
  return askConfirm("You have a paused game. Discard it and start a new one?", "Discard & start", "Keep it");
}

function updateResumeBanner() {
  const banner = $("resume-banner");
  if (!state.paused) {
    banner.classList.add("hidden");
    return;
  }
  let label;
  if (state.duel) {
    const [a, b] = state.duel.players;
    label = `▶ Resume duel — ${a.name} ${a.score} : ${b.score} ${b.name}`;
  } else {
    label = `▶ Resume game — ${state.score} pts · flag ${state.questionNum} / ${state.deck.length}`;
  }
  $("resume-btn").textContent = label;
  banner.classList.remove("hidden");
}

// ---------- level picker (multi-select) ----------

function levelsLabel() {
  return "Level " + [...state.levels].sort().join("+");
}

function levelPool() {
  return COUNTRIES.filter((c) => state.levels.has(c.level));
}

function pointsRange(pool) {
  const pts = pool.map((c) => c.points);
  return `${Math.min(...pts)}–${Math.max(...pts)} pts`;
}

function updateLevelHint() {
  const hint = $("level-hint");
  if (state.levels.size === 0) {
    hint.textContent = "Select at least one level to play";
    return;
  }
  const names = [...state.levels].sort().map((l) => LEVEL_NAMES[l]).join(" + ");
  const pool = levelPool();
  hint.textContent = `${names} — ${pool.length} flags in play · ${pointsRange(pool)} per flag`;
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
    const range = pointsRange(COUNTRIES.filter((c) => c.level === lv));
    btn.innerHTML =
      `<span class="lv-num">${lv}</span><span class="lv-name">${LEVEL_NAMES[lv]}</span><span class="lv-pts">${range}</span>`;
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

async function startQuiz() {
  if (!requireLevels()) return;
  if (!(await confirmDiscardPaused())) return;
  state.duel = null;
  beginGame();
}

async function startDuel() {
  if (!requireLevels()) return;
  if (!(await confirmDiscardPaused())) return;
  const p1 = $("duel-p1").value.trim() || "Player 1";
  const p2 = $("duel-p2").value.trim() || "Player 2";
  const target = Math.max(10, parseInt($("duel-target").value, 10) || 100);
  try {
    localStorage.setItem("ct-duel-names", JSON.stringify([p1, p2]));
  } catch { /* ignore */ }
  state.duel = {
    players: [
      { name: p1, score: 0, caps: 0, wrong: 0 },
      { name: p2, score: 0, caps: 0, wrong: 0 },
    ],
    turn: 0,
    target,
  };
  beginGame();
}

// A duel round = one flag for each player. The game may only end on a round
// boundary, so both players always get the same number of turns; a tie at or
// above the target goes to sudden death (keep playing until a round has a leader).
// whose flag the current question is — during a steal the turn sits with the
// stealer, but the flag still belongs to the player who missed it
function duelOwner() {
  return state.steal ? state.steal.owner : state.duel.turn;
}
function duelRoundDone() {
  return duelOwner() === 1;
}
function duelDecided() {
  const [a, b] = state.duel.players;
  const eliminated = a.wrong >= MAX_WRONG || b.wrong >= MAX_WRONG;
  return eliminated || (duelWon() && a.score !== b.score) || state.deckPos >= state.deck.length;
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
  state.paused = false;
  $("quiz-level-badge").textContent =
    `${levelsLabel()} · ` + (state.duel ? `Duel to ${state.duel.target}` : "Trivia");
  $("wrap-score").classList.toggle("hidden", !!state.duel);
  $("wrap-lives").classList.toggle("hidden", !!state.duel);
  $("wrap-hints").classList.toggle("hidden", !!state.duel || state.multiChoice);
  $("duel-bar").classList.toggle("hidden", !state.duel);
  showScreen("quiz");
  nextQuestion();
}

function nextQuestion() {
  const finished = state.duel
    ? state.deckPos >= state.deck.length // duel wins are decided at round boundaries in onNext
    : state.wrong >= MAX_WRONG || state.deckPos >= state.deck.length;
  if (finished) {
    gameOver();
    return;
  }
  state.current = state.deck[state.deckPos++];
  state.stage = "country";
  state.attempts = 0;
  state.hintedThisQuestion = false;
  state.steal = null;
  state.afterNext = "question";
  state.questionNum++;

  $("quiz-image").src = FLAG_URL(state.current.code);
  $("quiz-tier").textContent = `Tier ${state.current.tier} · worth ${state.current.points} pts`;
  $("quiz-prompt").textContent =
    (state.duel ? `${duelP().name} — w` : "W") + "hich country does this flag belong to?";
  state.choices = state.multiChoice ? buildChoices(state.current) : null;
  applyAnswerMode("country");
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
  if (state.duel) startTurnTimer();
  window.scrollTo(0, 0); // bring the new flag back into view on small screens
  focusInput($("quiz-input"));
}

function hintsLeftNow() {
  return state.duel ? 0 : state.hintsLeft; // duels have no hints
}

// duels are single-attempt; solo gets MAX_ATTEMPTS tries
function attemptsAllowed() {
  return state.duel ? 1 : MAX_ATTEMPTS;
}

// what to reveal for a missed country — hide the capital when not playing capitals
function revealText(c) {
  return state.askCapitals ? `${c.name} (capital: ${c.capital})` : c.name;
}

// ---------- multiple-choice option ----------

// coarse region bucket for picking plausible decoys ("the Caribbean (Lesser
// Antilles)" and "the Caribbean (south of Cuba)" should count as neighbours)
function regionKey(c) {
  return c.region.toLowerCase().replace(/^the /, "").split("(")[0].trim();
}

// decoys that aren't obviously wrong: prefer same region, then similar level
function pickDecoys(c, n) {
  const key = regionKey(c);
  const scored = shuffle(COUNTRIES.filter((x) => x.code !== c.code)).map((x) => ({
    x,
    score: (regionKey(x) === key ? 2 : 0) + (Math.abs(x.level - c.level) <= 1 ? 1 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((o) => o.x);
}

// 6 options (answer included) for the current flag, one set per stage
function buildChoices(c) {
  const countryChoices = shuffle([c.name, ...pickDecoys(c, 5).map((x) => x.name)]);
  const capitalPool = [];
  for (const d of pickDecoys(c, 12)) {
    if (d.capital !== c.capital && !capitalPool.includes(d.capital)) capitalPool.push(d.capital);
    if (capitalPool.length === 5) break;
  }
  return { country: countryChoices, capital: shuffle([c.capital, ...capitalPool]) };
}

function renderChoices(stage) {
  const box = $("choice-box");
  box.innerHTML = "";
  state.choices[stage].forEach((text) => {
    const b = document.createElement("button");
    b.className = "choice-btn";
    b.textContent = text;
    b.addEventListener("click", () => {
      if (state.stage !== stage) return;
      $("quiz-input").value = text;
      submitGuess();
      // wrong pick with tries left: grey it out and let them try again
      if (state.stage === stage) {
        b.classList.add("wrong");
        b.disabled = true;
      }
    });
    box.appendChild(b);
  });
}

// swap between typed answers and the 6-option grid for the current stage
function applyAnswerMode(stage) {
  $("answer-area").classList.toggle("hidden", state.multiChoice);
  $("choice-box").classList.toggle("hidden", !state.multiChoice);
  if (state.multiChoice) renderChoices(stage);
}

// on resolution: freeze the grid and highlight the answer (unless a steal is
// coming — the opponent still has to find it)
function settleChoices(revealAnswer) {
  if (!state.multiChoice) return;
  const answer = state.stage === "capital" ? state.current.capital : state.current.name;
  $("choice-box").querySelectorAll(".choice-btn").forEach((b) => {
    b.disabled = true;
    if (revealAnswer && b.textContent === answer) b.classList.add("correct");
  });
}

function updateStats() {
  $("stat-score").textContent = state.score;
  $("stat-lives").textContent =
    "❤".repeat(MAX_WRONG - state.wrong) + "♡".repeat(state.wrong);
  $("stat-hints").textContent = hintsLeftNow();
  $("stat-question").textContent = `${state.questionNum} / ${state.deck.length}`;
  if (state.duel) {
    const [a, b] = state.duel.players;
    const suddenDeath = duelWon() && a.score === b.score;
    $("duel-bar").innerHTML = state.duel.players
      .map(
        (p, i) =>
          `<span class="duel-player${i === state.duel.turn ? " active" : ""}">${escapeHtml(p.name)} <b>${p.score}</b>` +
          ` <span class="duel-hearts">${"❤".repeat(Math.max(0, MAX_WRONG - p.wrong))}${"♡".repeat(Math.min(MAX_WRONG, p.wrong))}</span></span>`
      )
      .join('<span class="duel-vs">vs</span>') +
      `<span class="duel-target">${suddenDeath ? "⚡ sudden death — lead after a round to win" : `first to ${state.duel.target}`}</span>`;
  }
}

function updateHintButton() {
  const btn = $("quiz-hint");
  // multiple choice is already its own hint — no extra ones
  const inGuessStage =
    (state.stage === "country" || state.stage === "capital") && !state.duel && !state.multiChoice;
  btn.classList.toggle("hidden", !inGuessStage);
  btn.disabled = !(inGuessStage && hintsLeftNow() > 0 && !state.hintedThisQuestion);
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
      if (state.askCapitals) {
        startCapitalStage(); // straight to the capital — no extra click
        setFeedback(`✔ It's ${c.name}! +${c.points} pts — now the capital:`, "good");
      } else {
        setFeedback(`✔ Correct! It's ${c.name}. +${c.points} pts`, "good");
        pauseForNext(nextLabel());
      }
    } else {
      state.attempts++;
      if (state.attempts >= attemptsAllowed()) {
        recordResult(c.code, { seen: 1, right: 0, hinted: state.hintedThisQuestion ? 1 : 0 });
        // no steals in multiple-choice duels: the greyed-out wrong pick would
        // shrink the option space and hand the stealer an unfair edge
        if (state.duel && !state.steal && !state.multiChoice) {
          // owner misses: no reveal — the opponent gets one shot at the same flag
          duelP().wrong++;
          state.steal = { owner: state.duel.turn };
          setFeedback(`✘ Not it — ${duelOther().name} can steal!`, "bad");
          pauseForNext(`Steal: ${duelOther().name}'s try ➜`, "steal");
        } else {
          if (state.duel) {
            // a failed steal costs the stealer nothing; an owner's miss costs a heart
            if (!state.steal) duelP().wrong++;
            setFeedback(`✘ Wrong — it was ${revealText(c)}.`, "bad");
          } else {
            state.wrong++;
            setFeedback(`✘ Wrong — it was ${revealText(c)}.`, "bad");
          }
          pauseForNext(nextLabel());
        }
      } else {
        const left = attemptsAllowed() - state.attempts;
        setFeedback(`✘ Wrong country — ${left} ${left === 1 ? "try" : "tries"} left.`, "bad");
        $("quiz-input").select();
      }
    }
  } else {
    if (capitalAnswers(c).includes(guess)) {
      state.capitals++;
      if (state.duel) {
        duelP().score += capitalBonus(c);
        duelP().caps++;
      } else state.score += capitalBonus(c);
      recordResult(c.code, { capSeen: 1, capRight: 1 });
      setFeedback(`✔ Correct! The capital of ${c.name} is ${c.capital}. +${capitalBonus(c)} pts bonus`, "good");
    } else {
      state.attempts++;
      if (state.attempts < attemptsAllowed()) {
        const left = attemptsAllowed() - state.attempts;
        setFeedback(`✘ Wrong capital — ${left} ${left === 1 ? "try" : "tries"} left.`, "bad");
        $("quiz-input").select();
        updateStats();
        return;
      }
      recordResult(c.code, { capSeen: 1, capRight: 0 });
      setFeedback(`✘ Wrong — the capital of ${c.name} is ${c.capital}.`, "bad");
    }
    pauseForNext(nextLabel());
  }
  updateStats();
}

function nextLabel() {
  if (state.duel) {
    if (duelRoundDone() && duelDecided()) return "See results ➜";
    return `Next: ${state.duel.players[1 - duelOwner()].name}'s turn ➜`;
  }
  if (state.wrong >= MAX_WRONG || state.deckPos >= state.deck.length) return "See results ➜";
  return "Next flag ➜";
}

// freeze input and wait for an explicit Next click
function pauseForNext(label, afterNext = "question") {
  stopTurnTimer(true); // no pressure while the phone changes hands
  settleChoices(afterNext !== "steal"); // don't spoil the answer for the stealer
  state.afterNext = afterNext;
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
  if (state.afterNext === "steal") {
    startSteal();
    return;
  }
  if (state.duel) {
    if (duelRoundDone() && duelDecided()) {
      gameOver();
      return;
    }
    state.duel.turn = 1 - duelOwner(); // next flag belongs to the other player
  }
  nextQuestion();
}

// ---------- duel turn timer ----------

let turnTimerId = null;

function renderTurnTimer() {
  const el = $("duel-timer");
  el.textContent = `⏱ ${state.timeLeft}s`;
  el.classList.toggle("urgent", state.timeLeft <= 5);
}

function stopTurnTimer(hide) {
  clearInterval(turnTimerId);
  turnTimerId = null;
  if (hide) $("duel-timer").classList.add("hidden");
}

// continue counting down from state.timeLeft
function resumeTurnTimer() {
  stopTurnTimer(false);
  if (!state.duel) {
    $("duel-timer").classList.add("hidden");
    return;
  }
  renderTurnTimer();
  $("duel-timer").classList.remove("hidden");
  turnTimerId = setInterval(() => {
    state.timeLeft--;
    renderTurnTimer();
    if (state.timeLeft <= 0) {
      stopTurnTimer(false);
      giveUp(true); // timing out counts exactly like giving up
    }
  }, 1000);
}

// fresh countdown for a new guess
function startTurnTimer() {
  state.timeLeft = TURN_SECONDS;
  resumeTurnTimer();
}

// the opponent takes one shot at the flag the owner just missed
function startSteal() {
  state.duel.turn = 1 - state.duel.turn;
  state.stage = "country";
  state.attempts = 0;
  state.hintedThisQuestion = false;
  state.afterNext = "question";
  $("quiz-prompt").textContent = `${duelP().name} — steal! Which country does this flag belong to?`;
  setFeedback("", "");
  $("quiz-input").value = "";
  $("quiz-input").placeholder = "Type a country name...";
  $("quiz-input").disabled = false;
  $("quiz-submit").disabled = false;
  $("quiz-reveal").classList.remove("hidden");
  $("quiz-next").classList.add("hidden");
  applyAnswerMode("country"); // fresh grid for the stealer, same 6 options
  updateHintButton();
  hideSuggestions();
  updateStats();
  startTurnTimer();
  window.scrollTo(0, 0);
  focusInput($("quiz-input"));
}

function startCapitalStage() {
  const c = state.current;
  state.stage = "capital";
  state.attempts = 0;
  state.hintedThisQuestion = false; // a fresh hint is allowed for the capital
  $("quiz-tier").textContent = `Tier ${c.tier} · capital bonus +${capitalBonus(c)} pts`;
  $("quiz-prompt").textContent =
    (state.duel ? `${duelP().name} — w` : "W") + `hat is the capital of ${c.name}?`;
  setFeedback("", "");
  $("quiz-input").value = "";
  $("quiz-input").placeholder = "Type a capital city...";
  $("quiz-input").disabled = false;
  $("quiz-submit").disabled = false;
  $("hint-box").classList.add("hidden");
  $("hint-box").innerHTML = "";
  $("quiz-reveal").classList.remove("hidden");
  $("quiz-next").classList.add("hidden");
  applyAnswerMode("capital");
  updateHintButton();
  hideSuggestions();
  if (state.duel) startTurnTimer();
  window.scrollTo(0, 0);
  focusInput($("quiz-input"));
}

function giveUp(timedOut = false) {
  const prefix = timedOut ? "⏰ Time's up — " : "";
  const c = state.current;
  if (state.stage === "country") {
    recordResult(c.code, { seen: 1, right: 0, hinted: state.hintedThisQuestion ? 1 : 0 });
    if (state.duel && !state.steal && !state.multiChoice) {
      duelP().wrong++;
      state.steal = { owner: state.duel.turn };
      setFeedback(`${prefix}${duelP().name} passes — ${duelOther().name} can steal!`, "bad");
      pauseForNext(`Steal: ${duelOther().name}'s try ➜`, "steal");
      updateStats();
      return;
    }
    if (state.duel) {
      if (!state.steal) duelP().wrong++; // multiple-choice duels: a pass still costs the heart
    } else state.wrong++;
    setFeedback(`${prefix}It was ${revealText(c)}.`, "bad");
    pauseForNext(nextLabel());
  } else if (state.stage === "capital") {
    recordResult(c.code, { capSeen: 1, capRight: 0 });
    setFeedback(`${prefix}The capital of ${c.name} is ${c.capital}.`, "bad");
    pauseForNext(nextLabel());
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

function hintLabel(text) {
  const label = document.createElement("p");
  label.className = "hint-label";
  label.textContent = text;
  return label;
}

function hintOptions(box, options, stage) {
  const row = document.createElement("div");
  row.className = "hint-options";
  options.forEach((optText) => {
    const b = document.createElement("button");
    b.className = "hint-option";
    b.textContent = optText;
    b.addEventListener("click", () => {
      if (state.stage !== stage) return;
      $("quiz-input").value = optText;
      submitGuess();
    });
    row.appendChild(b);
  });
  box.appendChild(row);
}

function useHint() {
  if (state.duel) return; // no hints in duels
  if ((state.stage !== "country" && state.stage !== "capital") || hintsLeftNow() <= 0 || state.hintedThisQuestion) return;
  state.hintsLeft--;
  state.hintedThisQuestion = true;
  const c = state.current;
  const box = $("hint-box");
  box.innerHTML = "";

  const decoyPool = () => shuffle(COUNTRIES.filter((x) => x.level === c.level && x.code !== c.code)).slice(0, 2);

  if (state.stage === "country") {
    if (c.level <= EASY_HINT_MAX_LEVEL) {
      box.appendChild(hintLabel("💡 It's one of these:"));
      hintOptions(box, shuffle([c, ...decoyPool()].map((x) => x.name)), "country");
    } else {
      box.appendChild(hintLabel(`💡 Located in ${c.region}.`));
    }
  } else {
    if (c.level <= EASY_HINT_MAX_LEVEL) {
      box.appendChild(hintLabel("💡 The capital is one of these:"));
      hintOptions(box, shuffle([c, ...decoyPool()].map((x) => x.capital)), "capital");
    } else {
      box.appendChild(hintLabel(`💡 The capital starts with “${c.capital[0]}” (${c.capital.length} characters).`));
    }
  }
  box.classList.remove("hidden");
  updateHintButton();
  updateStats();
  focusInput($("quiz-input"));
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
  stopTurnTimer(true);
  state.stage = "over";
  state.paused = false;

  if (state.duel) {
    const [a, b] = state.duel.players;
    const aOut = a.wrong >= MAX_WRONG;
    const bOut = b.wrong >= MAX_WRONG;
    let title;
    let note = "";
    if (aOut && bOut) {
      // equal turns mean both can go down in the same round
      title = "💥 Both eliminated!";
      note = " Both players missed 3 flags — no winner.";
    } else if (aOut || bOut) {
      const loser = aOut ? a : b;
      title = `🏆 ${(aOut ? b : a).name} wins!`;
      note = ` ${loser.name} missed 3 flags.`;
    } else {
      // tiebreaker chain: points → capitals guessed → true tie
      let winner = null;
      if (a.score !== b.score) winner = duelLeader();
      else if (a.caps !== b.caps) {
        winner = a.caps > b.caps ? a : b;
        note = ` Tie broken by capitals guessed (${a.caps}–${b.caps}).`;
      }
      title = winner ? `🏆 ${winner.name} wins!` : "🤝 It's a tie!";
    }
    $("over-title").textContent = title;
    $("over-summary").textContent =
      `${a.name} ${a.score} — ${b.score} ${b.name} · first to ${state.duel.target} · ` +
      `${levelsLabel()} · ${state.questionNum} flags played.` + note;
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
  window.scrollTo(0, 0);
  focusInput($("over-name"));
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

// capitals on/off option (persisted)
try {
  state.askCapitals = localStorage.getItem("ct-ask-capitals") !== "off";
} catch { /* ignore */ }
$("opt-capitals").checked = state.askCapitals;
$("opt-capitals").addEventListener("change", () => {
  state.askCapitals = $("opt-capitals").checked;
  try {
    localStorage.setItem("ct-ask-capitals", state.askCapitals ? "on" : "off");
  } catch { /* ignore */ }
});

// multiple-choice option (persisted, off by default)
try {
  state.multiChoice = localStorage.getItem("ct-multi-choice") === "on";
} catch { /* ignore */ }
$("opt-choices").checked = state.multiChoice;
$("opt-choices").addEventListener("change", () => {
  state.multiChoice = $("opt-choices").checked;
  try {
    localStorage.setItem("ct-multi-choice", state.multiChoice ? "on" : "off");
  } catch { /* ignore */ }
});

// with the on-screen keyboard up, pin the quiz card (flag included) to the top
$("quiz-input").addEventListener("focus", () => {
  if (!COARSE_POINTER || screens.quiz.classList.contains("hidden")) return;
  setTimeout(() => {
    document.querySelector("#screen-quiz .quiz-card").scrollIntoView({ block: "start" });
  }, 350); // after the keyboard animation settles
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

$("home-btn").addEventListener("click", async () => {
  const midGame = !screens.quiz.classList.contains("hidden") && state.stage !== "over";
  if (midGame) {
    const timerWasRunning = turnTimerId !== null;
    stopTurnTimer(false); // freeze the clock while deciding
    const ok = await askConfirm(
      "Pause the game and open the menu? You can resume it from there.",
      "Pause & menu", "Keep playing"
    );
    if (!ok) {
      if (timerWasRunning) resumeTurnTimer();
      return;
    }
    state.paused = true;
  }
  renderHighScores($("menu-highscores"));
  updateResumeBanner();
  showScreen("menu");
});

$("resume-btn").addEventListener("click", () => {
  state.paused = false;
  showScreen("quiz");
  // resume the duel clock if the paused turn was mid-guess
  if (state.duel && (state.stage === "country" || state.stage === "capital")) {
    resumeTurnTimer();
  }
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
$("quiz-reveal").addEventListener("click", () => giveUp());
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
$("stats-reset").addEventListener("click", async () => {
  if (!(await askConfirm("Reset all recorded country results?", "Reset", "Cancel"))) return;
  try {
    localStorage.removeItem(STATS_KEY);
  } catch { /* ignore */ }
  renderStatsPanel();
});
$("over-again").addEventListener("click", () => {
  if (state.duel) {
    state.duel.players.forEach((p) => { p.score = 0; p.caps = 0; p.wrong = 0; });
    state.duel.turn = 0;
    beginGame();
  } else {
    startQuiz();
  }
});
$("over-menu").addEventListener("click", () => {
  renderHighScores($("menu-highscores"));
  updateResumeBanner();
  showScreen("menu");
});

$("learn-card").addEventListener("click", learnCardClick);
$("learn-prev").addEventListener("click", (e) => { e.stopPropagation(); learnStep(-1); });
$("learn-next").addEventListener("click", (e) => { e.stopPropagation(); learnStep(1); });

showScreen("menu");

// offline support: cache the whole app (flags included) via a service worker.
// Skipped on file:// where workers aren't allowed — the single-file build
// doesn't need one anyway.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline mode unavailable */ });
  });
}
