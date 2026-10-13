export const STAGES = ['New', 'Seen', 'Familiar', 'Mastered'];
export const REVIEW_DAYS = [1, 3, 7, 21, 60];
const DAY = 86400000;
export const ROUND_SIZE = 7;

export const newCard = (term, def) => ({
  id: crypto.randomUUID(),
  term,
  def,
  stage: 0,
  box: 0,
  due: 0,
  misses: 0,
});

const stripAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

export const normalize = (s) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,!?;:"'’“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const variants = (answer) =>
  answer
    .split(/\s*[/;]\s*|,\s+(?![^(]*\))/)
    .map(normalize)
    .filter(Boolean)
    .concat(normalize(answer));

export function check(given, answer, { strictAccents = false } = {}) {
  const g = normalize(given);
  if (!g) return 'wrong';
  const ok = variants(answer);
  if (ok.includes(g)) return 'correct';
  if (!strictAccents && ok.some((v) => stripAccents(v) === stripAccents(g))) return 'accent';
  return 'wrong';
}

export const questionKind = (card) => (card.stage >= 2 ? 'write' : 'choice');

export function refreshDue(cards, now = Date.now()) {
  for (const c of cards) if (c.stage === 3 && c.due <= now) c.stage = 2;
}

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

export function pickRound(cards, size = ROUND_SIZE) {
  const live = cards.filter((c) => c.stage < 3);
  const byStage = shuffle(live).sort((a, b) => b.misses - a.misses || a.stage - b.stage);
  return byStage.slice(0, size);
}

export function direction(setting) {
  if (setting === 'term') return 'term';
  if (setting === 'def') return 'def';
  return Math.random() < 0.5 ? 'term' : 'def';
}

export function buildQuestion(card, deck, setting) {
  const dir = direction(setting);
  const prompt = dir === 'term' ? card.term : card.def;
  const answer = dir === 'term' ? card.def : card.term;
  const kind = questionKind(card);
  const q = { cardId: card.id, dir, prompt, answer, kind };
  if (kind === 'choice') q.options = shuffle([answer, ...distractors(card, deck, dir)]);
  return q;
}

export function distractors(card, cards, dir, n = 3) {
  const pick = (c) => (dir === 'term' ? c.def : c.term);
  const target = pick(card);
  const pool = cards
    .filter((c) => c.id !== card.id && pick(c) !== target)
    .sort((a, b) => Math.abs(pick(a).length - target.length) - Math.abs(pick(b).length - target.length));
  const near = shuffle(pool.slice(0, n * 3)).slice(0, n);
  return [...new Set(near.map(pick))];
}

export function applyAnswer(card, correct, now = Date.now()) {
  if (correct) {
    card.stage = Math.min(3, card.stage + 1);
    if (card.stage === 3) {
      card.due = now + REVIEW_DAYS[Math.min(card.box, REVIEW_DAYS.length - 1)] * DAY;
      card.box += 1;
    }
  } else {
    card.misses += 1;
    card.box = 0;
    card.stage = card.stage === 3 ? 1 : Math.max(0, card.stage - 1);
  }
  return card;
}

export const counts = (cards) => {
  const c = [0, 0, 0, 0];
  for (const card of cards) c[card.stage]++;
  return c;
};

export function parseImport(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+[-–—=]\s+|\s*;\s*|,(?=\s)/);
    const [term, ...rest] = parts.map((p) => p.trim());
    const def = rest.join(', ');
    if (term && def) out.push({ term, def });
  }
  return out;
}
