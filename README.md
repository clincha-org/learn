# Learn

Vocabulary trainer with adaptive study rounds. Sets, progress and in-progress rounds are saved to the server (one JSON file per set under `DATA_DIR/decks`), so they follow you across devices. The browser keeps a local copy and retries when offline; the newest edit to a set wins. JSON export/import is there for backups.

## How a session works

- Each term moves through four stages: New, Seen, Familiar, Mastered.
- Rounds of up to 7 terms. New and Seen terms get multiple choice; Familiar terms must be typed.
- A correct answer moves a term up a stage, a wrong one drops it and brings it back a few questions later in the same round.
- Typed answers accept `/`-separated alternatives, ignore bracketed notes, and forgive missing diacritics (ą, š, ž…) unless strict mode is on. Lithuanian letter buttons sit under the input.
- Mastered terms return for typed review after 1, 3, 7, 21 and 60 days; a miss resets that ladder.

## Importing vocabulary

Paste one pair per line, separated by a tab, ` - `, or `;`:

```
duona - bread
vanduo; water
obuolys	apple
```

## Development

```
DATA_DIR=./data node server.js
npm test
```

Deployed to Kubernetes from `clincha-org/clincha` at `learn.clinch-home.com`.
