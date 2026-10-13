import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAnswer, buildQuestion, check, counts, distractors, newCard, parseImport, pickRound, refreshDue,
} from '../web/js/engine.js';

test('check accepts alternatives and ignores parentheticals', () => {
  assert.equal(check('hello', 'hello / hi'), 'correct');
  assert.equal(check('hi', 'hello / hi'), 'correct');
  assert.equal(check('to eat', 'to eat (verb)'), 'correct');
  assert.equal(check('cat', 'dog'), 'wrong');
  assert.equal(check('', 'dog'), 'wrong');
});

test('check flags missing diacritics unless strict', () => {
  assert.equal(check('duona', 'duona'), 'correct');
  assert.equal(check('sviesa', 'šviesa'), 'accent');
  assert.equal(check('sviesa', 'šviesa', { strictAccents: true }), 'wrong');
  assert.equal(check('ąžuolas', 'ąžuolas'), 'correct');
});

test('stage progression and demotion', () => {
  const c = newCard('a', 'b');
  applyAnswer(c, true);
  applyAnswer(c, true);
  assert.equal(c.stage, 2);
  applyAnswer(c, false);
  assert.equal(c.stage, 1);
  assert.equal(c.misses, 1);
  applyAnswer(c, true, 0);
  applyAnswer(c, true, 0);
  assert.equal(c.stage, 3);
  assert.equal(c.box, 1);
  assert.ok(c.due > 0);
});

test('mastered cards return for review once due', () => {
  const c = newCard('a', 'b');
  c.stage = 3;
  c.due = 100;
  refreshDue([c], 50);
  assert.equal(c.stage, 3);
  refreshDue([c], 200);
  assert.equal(c.stage, 2);
});

test('wrong answer on mastered card resets the review box', () => {
  const c = newCard('a', 'b');
  c.stage = 3;
  c.box = 3;
  applyAnswer(c, false);
  assert.equal(c.box, 0);
  assert.equal(c.stage, 1);
});

test('pickRound skips mastered and caps size', () => {
  const cards = Array.from({ length: 12 }, (_, i) => newCard(`t${i}`, `d${i}`));
  cards[0].stage = 3;
  const round = pickRound(cards);
  assert.equal(round.length, 7);
  assert.ok(!round.includes(cards[0]));
});

test('distractors never include the answer or duplicates', () => {
  const cards = [['a', 'x'], ['b', 'y'], ['c', 'z'], ['d', 'x'], ['e', 'w']].map(([t, d]) => newCard(t, d));
  const d = distractors(cards[0], cards, 'term');
  assert.ok(!d.includes('x'));
  assert.equal(new Set(d).size, d.length);
});

test('buildQuestion uses typed answers from Familiar upward', () => {
  const cards = [newCard('a', 'x'), newCard('b', 'y'), newCard('c', 'z'), newCard('d', 'w')];
  assert.equal(buildQuestion(cards[0], cards, 'term').kind, 'choice');
  cards[0].stage = 2;
  const q = buildQuestion(cards[0], cards, 'def');
  assert.equal(q.kind, 'write');
  assert.equal(q.answer, 'a');
});

test('parseImport handles tabs, dashes, semicolons and comments', () => {
  const r = parseImport('# fruit\nobuolys - apple\nduona\tbread\nvanduo; water\n\nbad');
  assert.deepEqual(r.map((x) => [x.term, x.def]), [['obuolys', 'apple'], ['duona', 'bread'], ['vanduo', 'water']]);
});

test('counts', () => {
  const cards = [newCard('a', 'b'), newCard('c', 'd')];
  cards[1].stage = 3;
  assert.deepEqual(counts(cards), [1, 0, 0, 1]);
});
