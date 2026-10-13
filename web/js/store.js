import { newCard } from './engine.js';

const KEY = 'learn.v1';
const DEFAULTS = { direction: 'mixed', strictAccents: false };
const PUSH_DELAY = 400;

let state = { decks: [], pending: [] };
let status = 'local';
let onStatus = () => {};
const timers = new Map();
const inflight = new Set();

export function load() {
  try {
    state = { decks: [], pending: [], ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    state = { decks: [], pending: [] };
  }
  return state;
}

const persist = () => localStorage.setItem(KEY, JSON.stringify(state));
const setStatus = (s) => {
  status = s;
  onStatus(s);
};

export const watchStatus = (fn) => {
  onStatus = fn;
  fn(status);
};
export const decks = () => state.decks;
export const getDeck = (id) => state.decks.find((d) => d.id === id);

export function save(deck) {
  if (deck) {
    deck.updated = Date.now();
    queue(deck.id);
  }
  persist();
}

function queue(id) {
  if (!state.pending.includes(id)) state.pending.push(id);
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => push(id), PUSH_DELAY));
  setStatus('pending');
}

async function push(id) {
  if (inflight.has(id)) return queue(id);
  const deck = getDeck(id);
  inflight.add(id);
  try {
    const res = deck
      ? await fetch(`/api/decks/${id}`, { method: 'PUT', body: JSON.stringify(deck) })
      : await fetch(`/api/decks/${id}`, { method: 'DELETE' });
    if (res.status === 409) {
      adopt(await res.json());
    } else if (!res.ok) {
      throw new Error(String(res.status));
    }
    state.pending = state.pending.filter((p) => p !== id);
    persist();
    setStatus(state.pending.length ? 'pending' : 'synced');
  } catch {
    setStatus('offline');
  } finally {
    inflight.delete(id);
  }
}

function adopt(remote) {
  state.decks = state.decks.filter((d) => d.id !== remote.id);
  if (!remote.deleted) state.decks.push(remote);
}

export async function sync() {
  try {
    const res = await fetch('/api/decks');
    if (!res.ok) throw new Error(String(res.status));
    const { decks: remote } = await res.json();
    const byId = new Map(remote.map((d) => [d.id, d]));
    for (const local of [...state.decks]) {
      const theirs = byId.get(local.id);
      if (!theirs || (local.updated ?? 0) > theirs.updated) queue(local.id);
    }
    for (const theirs of remote) {
      const mine = getDeck(theirs.id);
      if (!mine || theirs.updated > (mine.updated ?? 0)) adopt(theirs);
    }
    persist();
    if (!state.pending.length) setStatus('synced');
    for (const id of state.pending) queue(id);
  } catch {
    setStatus('offline');
  }
}

export const retryPending = () => state.pending.forEach(queue);

export function addDeck(name) {
  const deck = { id: crypto.randomUUID(), name, cards: [], settings: { ...DEFAULTS }, updated: 0 };
  state.decks.push(deck);
  save(deck);
  return deck;
}

export function removeDeck(id) {
  state.decks = state.decks.filter((d) => d.id !== id);
  queue(id);
  persist();
}

export function addCards(deck, pairs) {
  const known = new Set(deck.cards.map((c) => `${c.term}\u0000${c.def}`));
  let added = 0;
  for (const { term, def } of pairs) {
    if (known.has(`${term}\u0000${def}`)) continue;
    deck.cards.push(newCard(term, def));
    added++;
  }
  save(deck);
  return added;
}

export function resetProgress(deck) {
  for (const c of deck.cards) Object.assign(c, { stage: 0, box: 0, due: 0, misses: 0 });
  deck.session = null;
  save(deck);
}

export const exportJson = () => JSON.stringify({ decks: state.decks }, null, 2);

export function importJson(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.decks)) throw new Error('Not a Learn export');
  for (const d of data.decks) {
    d.settings = { ...DEFAULTS, ...d.settings };
    state.decks = state.decks.filter((x) => x.id !== d.id);
    state.decks.push(d);
    save(d);
  }
}
