import { newCard } from './engine.js';

const KEY = 'learn.v1';
const DEFAULTS = { direction: 'mixed', strictAccents: false };

let state = { decks: [] };

export function load() {
  try {
    state = JSON.parse(localStorage.getItem(KEY)) ?? state;
  } catch {
    state = { decks: [] };
  }
  return state;
}

export const save = () => localStorage.setItem(KEY, JSON.stringify(state));
export const decks = () => state.decks;
export const getDeck = (id) => state.decks.find((d) => d.id === id);

export function addDeck(name) {
  const deck = { id: crypto.randomUUID(), name, cards: [], settings: { ...DEFAULTS } };
  state.decks.push(deck);
  save();
  return deck;
}

export function removeDeck(id) {
  state.decks = state.decks.filter((d) => d.id !== id);
  save();
}

export function addCards(deck, pairs) {
  const known = new Set(deck.cards.map((c) => `${c.term}\u0000${c.def}`));
  let added = 0;
  for (const { term, def } of pairs) {
    if (known.has(`${term}\u0000${def}`)) continue;
    deck.cards.push(newCard(term, def));
    added++;
  }
  save();
  return added;
}

export function resetProgress(deck) {
  for (const c of deck.cards) Object.assign(c, { stage: 0, box: 0, due: 0, misses: 0 });
  save();
}

export const exportJson = () => JSON.stringify(state, null, 2);

export function importJson(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.decks)) throw new Error('Not a Learn export');
  const ids = new Set(state.decks.map((d) => d.id));
  for (const d of data.decks) {
    d.settings = { ...DEFAULTS, ...d.settings };
    if (ids.has(d.id)) state.decks = state.decks.filter((x) => x.id !== d.id);
    state.decks.push(d);
  }
  save();
}
