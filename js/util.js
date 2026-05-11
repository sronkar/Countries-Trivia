// Shared helpers for Flag Trivia.

export function flagUrl(code, size = "w320") {
  return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
}

export function flagSrcset(code) {
  const c = code.toLowerCase();
  return [
    `https://flagcdn.com/w320/${c}.png 1x`,
    `https://flagcdn.com/w640/${c}.png 2x`,
  ].join(", ");
}

// Fisher–Yates, returns a new array.
export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

// Lowercase, strip diacritics, collapse punctuation, drop leading "the ",
// and apply a few common abbreviations so guesses like "Trinidad & Tobago"
// and "St Lucia" match.
export function normalize(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[`'’.,()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/\bst\b/g, "saint");
}

// Exact-after-normalization match against name (or capital) and any aliases.
export function matchesAnswer(guess, country, field /* "name" | "capital" */) {
  const g = normalize(guess);
  if (!g) return false;
  const candidates = [country[field]];
  if (country.aliases) candidates.push(...country.aliases);
  return candidates.some((c) => normalize(c) === g);
}

// Pick n distractors from pool that aren't the answer. Prefer same continent.
export function pickDistractors(answer, pool, n, field /* "name" | "capital" */) {
  const sameContinent = pool.filter(
    (c) => c.continent === answer.continent && c[field] !== answer[field]
  );
  const others = pool.filter(
    (c) => c.continent !== answer.continent && c[field] !== answer[field]
  );
  const picks = [];
  const seen = new Set([answer[field]]);
  for (const src of [shuffle(sameContinent), shuffle(others)]) {
    for (const c of src) {
      if (picks.length >= n) break;
      if (seen.has(c[field])) continue;
      seen.add(c[field]);
      picks.push(c);
    }
    if (picks.length >= n) break;
  }
  return picks;
}

// localStorage with graceful fallback (private browsing, disabled storage).
const memStore = {};
export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return key in memStore ? memStore[key] : fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      memStore[key] = val;
    }
  },
};

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = v;
    else if (v === true) node.setAttribute(k, "");
    else if (v === false || v == null) {/* skip */}
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
