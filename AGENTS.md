# AGENTS.md — deutsche-workbooks

> **This file and its twin, `CLAUDE.md`, are kept byte-for-byte identical on purpose** (different tools look for different filenames — this covers both without risking the two drifting apart). If you edit one, copy the exact same edit into the other in the same turn.

## Keep this file current — read this first

This file exists so Yatender never has to re-explain this project's context from scratch. **Whenever you add a workbook, an exam-prep page, a new folder, or make a structural/format decision in this repo, update the relevant section below in the same turn — don't wait to be asked, and don't leave this file stale.** If something here turns out to be wrong, fix it rather than working around it silently. Treat this file as living documentation of the current state of the repo, not a one-time snapshot.

## What this repo is

Yatender's personal German-learning workbook repo. He passed telc A1 with 91% and is preparing for **telc B2, target exam late November 2026**. This is unrelated to any work codebase — treat it as a personal project.

## Structure

- `index.html` — navigation hub, links to everything below, grouped by level.
- `study-plan.html` — phased timeline (A2 bridge/B1 grammar → B1 exam-task practice → B2 grammar → B2 exam-task practice → consolidation), weekly routine, milestone checklist. **Keep this in sync** if the target exam date, scope, or phase order changes.
- `assets/print-workbook.css` — the ONE shared stylesheet for every printable workbook/exam-prep page. Reuse its existing classes (`doc-header`, `level-badge`, `tip-box`, `cheatsheet`, `section`, `exercise`, `write-line`, `write-area`/`write-area.tall`, `answer-block`, `model-answer-block`, `audio-controls`, etc.) — do not invent new ones or add inline `<style>` blocks. If a genuinely new reusable component is needed, add it here so every page benefits.
- `assets/listening.js` — Web Speech API (`speechSynthesis`)-based text-to-speech for Hörverstehen pages: `speakText(id)`, `stopSpeaking(id)`, `toggleTranscript(id, btnEl)`. There is no hosted audio anywhere in this repo and none should be added — this is the mechanism, permanently.
- `workbooks/A1/` and `workbooks/A2/workbook-1..6` — **pre-existing, older interactive/Tailwind-CDN workbooks. Leave these untouched.** They predate the print-first system below and intentionally use a different technical approach (in-browser click/localStorage progress tracking instead of print-and-write).
- `workbooks/A2/workbook-7-*`, `workbook-8-*` — the A2→B1 bridge workbooks (Adjektivendungen & Vergleich, Reflexive Verben), in the current print-first format, chained to each other and on to `workbooks/B1/workbook-1`.
- `workbooks/B1/workbook-1..6`, `workbooks/B2/workbook-1..6` — grammar workbooks, one file per topic, print-first format, chained via prev/next nav links inside each file.
- `exam-prep/B1/`, `exam-prep/B2/` — telc exam-task practice by skill: `leseverstehen-practice.html` (reading), `hoerverstehen-practice.html` (listening, TTS-based), `sprachbausteine-practice.html` (language-elements cloze), `schriftlicher-ausdruck-guide.html` (writing, with model answers + self-assessment checklist). **Mündliche Prüfung (speaking) is not yet covered** — a natural future addition here, only if asked.
- `cheatsheets/`, `web workbooks/` — older reference material, unrelated to the current system.
- `vocab/` — interactive vocabulary trainer, A1–B2, separate system from the print-first workbooks below (see "Vocabulary trainer" section).

## The print-first workbook format (core convention — apply to every new page)

Every current-format page (`workbooks/A2/workbook-7-*`, `workbook-8-*`, all of `workbooks/B1/`, `workbooks/B2/`, all of `exam-prep/`) follows this exact pattern. When adding a new one, copy an existing file of the same type as the literal structural template rather than inventing markup from scratch:

- Links `assets/print-workbook.css` via a relative path; `<body class="level-a2|level-b1|level-b2|level-exam">` sets the accent color.
- `.controls` (no-print): Index link, Print button, Prev/Next links. `.doc-header`: `.level-badge` + `<h1>` + `.doc-meta`.
- `.tip-box` (no-print) explaining how to use the page.
- `.cheatsheet` box with grammar rules or a format overview, using plain `<table>`s.
- `.section` blocks, each with a `.section-title` (including its exercise number range) and a `.section-note`.
- Each `.exercise`: `.qnum`, `.prompt`, then `.write-line` (single blank) or `.write-area` / `.write-area.tall` (sentence/essay length), **then an `.answer-block` immediately below** with `.label` "Lösung" + the correct answer + an optional `.why`. The answer key is always directly under the exercise, never in a separate back-of-book section — this is a hard requirement: Yatender works on an iPad (Noteful app), prints pages to PDF, writes answers by hand, and self-checks against the answer directly below.
- Cloze passages: circled-number spans (`&#9312;` etc.) inside one `.write-area.tall`, with one combined `.answer-block` listing every gap's answer.
- Free-writing tasks (letters/essays): `.model-answer-block` instead of `.answer-block` (no single correct answer), plus a self-assessment checklist.
- `.doc-footer` (no-print) mirrors the controls-bar nav links.
- When inserting a new page into the sequence, update the prev/next links in both the file before it and the file after it.

## Listening content

No audio files, ever — Hörverstehen pages read a hidden German transcript aloud via `assets/listening.js`, triggered by a `.play-btn`. Copy the exact pattern from `exam-prep/B1/hoerverstehen-practice.html` (audio-controls block, hidden transcript div, transcript-toggle button, script include at the end of body).

## Vocabulary trainer (`vocab/`)

A separate, fully interactive app (not print-first) — spaced-repetition vocab practice across A1–B2, ~5,860 words. No backend, no build step: plain HTML/CSS/JS, static-hostable like the rest of the repo.

- **Source of truth**: `vocab/data/{a1,a2,b1,b2}.json`, one flat array per level. Schema per entry: `{id, word, article, plural, forms, full, translation_en, examples: [{de, en?}], level}` (`plural` is for nouns, `forms` holds verb principal parts — e.g. "gibt ab, hat abgegeben" — mutually exclusive with `plural`). Regenerating these files requires re-running the one-off extraction scripts (not checked into the repo) against: the official Goethe A1 (Start Deutsch 1) and A2 wordlist PDFs (word + German example only, no English — English was backfilled from the B1 set where the same word recurs there), a B1 Anki deck (`B1_Wortliste_DTZ_Goethe...apkg`, richest source: word + article + plural + English + up to 9 example sentence pairs), and the "B2 Der-Die-Das" 1,479-noun sub-deck of a TELC B2 grammar Anki deck (word + article + English, no example sentences). None of these source files are checked into the repo — treat `vocab/data/*.json` as the durable artifact.
- **No hosted audio** — same rule as the rest of the repo. `vocab/practice.html` includes `assets/listening.js` directly and reuses `speakText(id)` for the listening practice mode (writes the current word/sentence into a hidden `#tts-source` span, then calls `speakText('tts-source')`).
- **Storage**: IndexedDB only (`vocab/js/db.js`), no server. Three object stores: `profiles` (name-based, no auth), `cards` (per-profile SRS state keyed by `${profile}::${entryId}`), `reviews` (append-only log used for the stats page). Multiple profiles can coexist on one device; the active profile is remembered in `localStorage` under `vocab.activeProfile`.
- **Scheduler**: simplified day-granularity SM-2 in `vocab/js/srs.js` (Again/Hard/Good/Easy grading, same family of algorithm Anki uses — not a literal port).
- **Practice modes** (`vocab/js/practice.js`): flashcard self-grade, multiple choice, fill-in-the-blank (cloze, built from a real example sentence), type-the-German-word, and listening. "Gemischt" (mixed) picks a random mode per card, falling back to flashcard when an entry lacks the data a mode needs (e.g. no `translation_en` → skip MCQ/type; no usable example → skip cloze).
- **Pages**: `vocab/index.html` (profile picker + level/mode/session-length setup), `vocab/practice.html` (session runner), `vocab/stats.html` (14-day bar chart, 15-week activity heatmap, streak, per-level accuracy — all computed client-side from the `reviews` store). Styling lives in `vocab/vocab.css`, a sibling to `assets/print-workbook.css` but intentionally separate since this isn't a print page (same `--accent` per-level convention, different components).
- **Installable / offline (PWA)**: `vocab/manifest.json` + `vocab/sw.js` (cache-first service worker, scope `vocab/`) + `vocab/js/register-sw.js` (included at the bottom of all three pages) make the trainer installable to a phone home screen on both Android and iOS and fully usable offline — everything it needs (data is already loaded as `vocab/data/*.js`, not fetched) is precached. Icons live in `vocab/icons/` (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, generated from `icon-source.svg` via `magick`). When adding a new page under `vocab/` or a new JS/CSS asset it depends on, add it to `PRECACHE_URLS` in `vocab/sw.js` and bump `CACHE_NAME` so returning users pick up the change. Note: service workers require a real HTTP(S) origin — they will not register over `file://` or in some sandboxed preview browsers; test via a local server (e.g. `python3 -m http.server`) or the deployed site.
- Content-accuracy requirements below apply here too, but note the A1/A2 example sentences and B2 nouns come from official/curated third-party lists rather than being generated — if you add new levels or regenerate data, keep flagging provenance (official wordlist vs. generated) rather than presenting everything as equally authoritative.

## Content-accuracy requirements

This is real exam-prep material.

- Every exercise and answer key must be correct standard Hochdeutsch — double-check case endings, verb position, and irregular forms before finalizing.
- Caveat telc format claims ("exact task counts can shift between test versions — check the current telc Modellsatz") rather than stating them as guaranteed fact.
- For any multiple-choice or lettered-matching exercise, **deliberately vary which letter is correct across items.** Content generation has a known failure mode of always writing the correct option first (letter "a") — before considering such content done, list the correct letter per item and confirm it isn't clustered on one letter.

## Timeline context

Target exam: telc B2, late November 2026. `study-plan.html` holds the phased plan. If the target date, scope (e.g. adding speaking/listening later), or phase order changes, update `study-plan.html`'s phase table, milestone checklist, and any date math in the same turn — don't leave it describing an out-of-date plan.
