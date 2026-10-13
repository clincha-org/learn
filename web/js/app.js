import {
  STAGES, applyAnswer, buildQuestion, check, counts, parseImport, pickRound, refreshDue,
} from './engine.js';
import * as store from './store.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');
const LT_KEYS = ['ą', 'č', 'ę', 'ė', 'į', 'š', 'ų', 'ū', 'ž'];
let cleanup = () => {};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const mount = (...nodes) => root.replaceChildren(...nodes);

function bar(cards) {
  const c = counts(cards);
  const total = cards.length || 1;
  return h('div', {},
    h('div', { class: 'bar', role: 'img', 'aria-label': STAGES.map((s, i) => `${c[i]} ${s}`).join(', ') },
      c.map((n, i) => h('span', { class: `s${i}`, style: `width:${(n / total) * 100}%` }))),
    h('div', { class: 'legend' }, STAGES.map((s, i) => h('span', {}, h('i', { class: `s${i}` }), `${s} ${c[i]}`))));
}

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

function home() {
  nav.replaceChildren(
    h('button', { onclick: () => download('learn-export.json', store.exportJson()) }, 'Export'),
    h('label', { class: 'btn' }, 'Import',
      h('input', {
        type: 'file', accept: 'application/json', hidden: true,
        onchange: async (e) => {
          try { store.importJson(await e.target.files[0].text()); route(); } catch (err) { alert(err.message); }
        },
      })));
  const create = h('form', {
    class: 'row',
    onsubmit: (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (name) location.hash = `#/deck/${store.addDeck(name).id}`;
    },
  }, h('input', { type: 'text', name: 'name', placeholder: 'New set, e.g. Lithuanian: food', 'aria-label': 'Set name', style: 'flex:1' }),
  h('button', { class: 'primary' }, 'Create'));
  const list = store.decks().map((d) => h('a', { class: 'card deck', href: `#/deck/${d.id}` },
    h('div', { class: 'row spread' }, h('strong', {}, d.name), h('span', { class: 'muted' }, `${d.cards.length} terms`)),
    bar(d.cards)));
  mount(h('h1', {}, 'Your sets'), h('div', { class: 'card' }, create),
    ...(list.length ? list : [h('p', { class: 'muted' }, 'No sets yet. Create one, then paste your vocabulary in.')]));
}

function deckPage(id) {
  const deck = store.getDeck(id);
  if (!deck) return void (location.hash = '#/');
  nav.replaceChildren(h('a', { class: 'btn', href: '#/' }, 'All sets'));
  const due = deck.cards.filter((c) => c.stage === 3 && c.due <= Date.now()).length;

  const paste = h('textarea', {
    placeholder: 'One per line, Lithuanian then English:\nduona - bread\nvanduo - water\nobuolys\tapple', 'aria-label': 'Paste terms',
  });
  const settings = deck.settings;
  const select = (label, key, opts) => h('label', {}, label,
    h('select', { onchange: (e) => { settings[key] = e.target.value; store.save(deck); } },
      opts.map(([v, t]) => h('option', { value: v, selected: settings[key] === v }, t))));

  const rows = deck.cards.map((c) => h('tr', {},
    ['term', 'def'].map((f) => h('td', {}, h('input', {
      type: 'text', value: c[f], 'aria-label': f === 'term' ? 'Term' : 'Definition',
      onchange: (e) => { c[f] = e.target.value.trim() || c[f]; store.save(deck); },
    }))),
    h('td', {}, h('span', { class: 'pill' }, STAGES[c.stage])),
    h('td', {}, h('button', {
      class: 'danger', 'aria-label': `Delete ${c.term}`,
      onclick: () => { deck.cards = deck.cards.filter((x) => x !== c); store.save(deck); deckPage(id); },
    }, '✕'))));

  mount(
    h('div', { class: 'row spread' },
      h('h1', { style: 'margin:0' }, deck.name),
      h('a', { class: `btn primary big${deck.cards.length < 2 ? ' disabled' : ''}`, href: deck.cards.length < 2 ? '#' : `#/learn/${id}` }, 'Learn')),
    h('div', { class: 'card' }, bar(deck.cards),
      due ? h('p', { class: 'muted' }, `${due} mastered terms are due for review.`) : null),
    h('div', { class: 'card row' },
      select('Prompt', 'direction', [['mixed', 'Mixed'], ['term', 'Term → definition'], ['def', 'Definition → term']]),
      h('label', { class: 'row' }, h('input', {
        type: 'checkbox', checked: settings.strictAccents,
        onchange: (e) => { settings.strictAccents = e.target.checked; store.save(deck); },
      }), 'Strict diacritics (ą, š, ž…)')),
    h('h2', {}, 'Add terms'),
    h('div', { class: 'card' }, paste,
      h('div', { class: 'row', style: 'margin-top:.5rem' },
        h('button', {
          class: 'primary',
          onclick: () => {
            const n = store.addCards(deck, parseImport(paste.value));
            alert(`${n} new terms added`);
            deckPage(id);
          },
        }, 'Add pasted terms'),
        h('span', { class: 'muted' }, 'Separate with a tab, " - ", or ";". Use "/" for accepted alternatives.'))),
    h('h2', {}, `Terms (${deck.cards.length})`),
    h('div', { class: 'card' }, h('table', {}, h('tbody', {}, rows))),
    h('div', { class: 'row' },
      h('button', { onclick: () => { if (confirm('Reset all progress for this set?')) { store.resetProgress(deck); deckPage(id); } } }, 'Reset progress'),
      h('button', { class: 'danger', onclick: () => { if (confirm(`Delete "${deck.name}"?`)) { store.removeDeck(id); location.hash = '#/'; } } }, 'Delete set')));
}

function learn(id) {
  const deck = store.getDeck(id);
  if (!deck || deck.cards.length < 2) return void (location.hash = `#/deck/${id}`);
  nav.replaceChildren(h('a', { class: 'btn', href: `#/deck/${id}` }, 'Exit'));
  refreshDue(deck.cards);

  let queue = [];
  let missed = new Set();
  let roundStats = { right: 0, wrong: 0, total: 0 };
  let current = null;
  let answered = false;

  const saveSession = () => {
    deck.session = queue.length ? { queue, missed: [...missed], stats: roundStats } : null;
    store.save(deck);
  };

  const startRound = () => {
    const saved = deck.session;
    const valid = saved?.queue.every((id) => deck.cards.some((c) => c.id === id));
    if (saved?.queue.length && valid) {
      queue = [...saved.queue];
      roundStats = { ...saved.stats };
      missed = new Set(saved.missed);
      deck.session = null;
      return next();
    }
    const round = pickRound(deck.cards);
    if (!round.length) return finish();
    queue = round.map((c) => c.id);
    missed = new Set();
    roundStats = { right: 0, wrong: 0, total: round.length };
    saveSession();
    next();
  };

  const next = () => {
    if (!queue.length) return summary();
    const card = deck.cards.find((c) => c.id === queue[0]);
    current = { card, q: buildQuestion(card, deck.cards, deck.settings.direction) };
    answered = false;
    renderQuestion();
  };

  const record = (correct) => {
    const { card } = current;
    applyAnswer(card, correct);
    queue.shift();
    if (correct) {
      roundStats.right++;
    } else {
      roundStats.wrong++;
      missed.add(card.id);
      current.requeued = Math.min(3, queue.length);
      queue.splice(current.requeued, 0, card.id);
    }
    saveSession();
  };

  const header = () => h('div', {}, bar(deck.cards),
    h('p', { class: 'muted' }, `Round: ${roundStats.right} of ${roundStats.total} answered`));

  const resolve = (result, given) => {
    answered = true;
    const { q } = current;
    const correct = result !== 'wrong';
    record(correct);
    renderFeedback(q, result, given);
  };

  function renderQuestion() {
    const { q } = current;
    const body = q.kind === 'choice' ? choiceUi(q) : writeUi(q);
    mount(header(),
      h('div', { class: 'card' },
        h('div', { class: 'muted center' }, q.kind === 'choice' ? 'Choose the matching term' : 'Type the answer'),
        h('div', { class: 'prompt' }, q.prompt), body));
    root.querySelector('input[type=text]')?.focus();
  }

  function choiceUi(q) {
    const opts = q.options.map((o, i) => h('button', {
      class: 'opt', 'data-i': i, onclick: () => !answered && pick(o),
    }, h('kbd', {}, i + 1), o));
    const pick = (o) => {
      const right = o === q.answer;
      opts.forEach((b, i) => {
        if (q.options[i] === q.answer) b.classList.add('good');
        else if (q.options[i] === o) b.classList.add('bad');
      });
      resolve(right ? 'correct' : 'wrong', o);
    };
    current.pick = (i) => q.options[i] != null && !answered && pick(q.options[i]);
    return h('div', {}, h('div', { class: 'options' }, opts),
      h('p', { class: 'center' }, h('button', { onclick: () => !answered && pick(null) }, "Don't know")));
  }

  function writeUi(q) {
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer' });
    const submit = () => !answered && resolve(check(input.value, q.answer, deck.settings), input.value);
    const keys = h('div', { class: 'keys' }, LT_KEYS.map((k) => h('button', {
      type: 'button', 'aria-label': `Insert ${k}`,
      onclick: () => { input.value += k; input.focus(); },
    }, k)));
    return h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } }, input, keys,
      h('div', { class: 'row' },
        h('button', { class: 'primary' }, 'Answer'),
        h('button', { type: 'button', onclick: () => !answered && resolve('wrong', '') }, "Don't know")));
  }

  function renderFeedback(q, result, given) {
    const kind = result === 'correct' ? 'good' : result === 'accent' ? 'warn' : 'bad';
    const text = { correct: 'Correct!', accent: 'Correct, but mind the spelling.', wrong: given ? 'Not quite.' : 'The answer is:' }[result];
    const fb = h('div', { class: `feedback ${kind}`, role: 'status' },
      h('strong', {}, text),
      result !== 'correct' ? h('div', {}, q.answer) : null,
      result === 'wrong' && given && q.kind === 'write' ? h('div', { class: 'muted' }, `You typed: ${given}`) : null);
    const card = root.querySelector('.card');
    card.append(fb);
    const row = h('div', { class: 'row' },
      h('button', { class: 'primary', id: 'continue', onclick: () => next() }, 'Continue'),
      result === 'wrong' && q.kind === 'write' && given
        ? h('button', {
          onclick: () => {
            const c = current.card;
            queue.splice(current.requeued, 1);
            roundStats.wrong--; roundStats.right++;
            missed.delete(c.id);
            c.misses = Math.max(0, c.misses - 1);
            applyAnswer(c, true);
            saveSession();
            next();
          },
        }, 'I was right')
        : null);
    card.append(row);
    root.querySelector('form')?.querySelectorAll('input,button').forEach((el) => (el.disabled = true));
    card.querySelector('#continue').focus();
  }

  function summary() {
    const cards = deck.cards.filter((c) => missed.has(c.id));
    mount(header(), h('div', { class: 'card center' },
      h('h1', {}, 'Round complete'),
      h('div', { class: 'stat' }, `${roundStats.total - missed.size} / ${roundStats.total}`),
      h('p', { class: 'muted' }, 'terms right first time'),
      cards.length ? h('div', {}, h('h2', {}, 'Keep an eye on'), h('table', {}, h('tbody', {},
        cards.map((c) => h('tr', {}, h('td', {}, c.term), h('td', {}, c.def)))))) : null,
      h('p', {}, h('button', { class: 'primary big', id: 'continue', onclick: startRound }, 'Next round'))));
    root.querySelector('#continue').focus();
  }

  function finish() {
    mount(h('div', { class: 'card center' },
      h('h1', {}, 'All terms mastered 🎉'),
      bar(deck.cards),
      h('p', { class: 'muted' }, 'Mastered terms come back for review after 1, 3, 7, 21 and 60 days.'),
      h('a', { class: 'btn primary', href: `#/deck/${id}` }, 'Back to set')));
  }

  const onKey = (e) => {
    if (e.target.tagName === 'BUTTON' || (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
    if (/^[1-4]$/.test(e.key) && current?.pick) current.pick(Number(e.key) - 1);
    else if (e.key === 'Enter' && answered) next();
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => document.removeEventListener('keydown', onKey);
  startRound();
}

function route() {
  cleanup();
  cleanup = () => {};
  const [, page, id] = location.hash.split('/');
  if (page === 'deck') deckPage(id);
  else if (page === 'learn') learn(id);
  else home();
}

const LABELS = { synced: 'Saved', pending: 'Saving…', offline: 'Offline, will retry', local: '' };
const badge = h('span', { class: 'muted', role: 'status' });
document.querySelector('header').insertBefore(badge, nav);
store.watchStatus((s) => { badge.textContent = LABELS[s]; });

addEventListener('hashchange', route);
addEventListener('online', store.retryPending);
store.load();
if (!store.decks().length) await store.sync();
route();
store.sync().then(() => {
  if (!location.hash.startsWith('#/learn')) route();
});
