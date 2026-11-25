# Pyramid Trainer

A single-page browser app for practicing the guitar "pyramid exercise" (quarter → eighth → triplet → sixteenth → triplet → eighth → quarter) against a metronome. It records the take through the microphone, places the subdivision grid on the recording, and analyzes after the fact how early or late every note was.

This file is the handover from the Claude (Cowork) session where the app was built, written so that Claude Code in VS Code can continue the work. Use American spelling in the UI and in replies.

## Repository layout

```
index.html            markup; loads style.css and js/main.js
style.css             all CSS
js/                   the app as ES modules (see the code map below); js/main.js is the entry point
js/core/              signal processing and scoring, with no page access (runs in Node too)
js/version.js         the version shown at the bottom of the page; bump it with an entry in CHANGELOG.md
build.mjs             joins everything into one file → dist/pyramid.html and dist/index.html (not checked in)
package.json          scripts: build, serve, test, check
tests/                Playwright scripts (headless Chromium with a fake microphone), plus Node-only tests of js/core
tests/_env.mjs        serves the app on a local port for the tests; `spy()`; PYRAMID_HTML, PW_CHROME, SHOTS_DIR env overrides
tests/run-all.mjs     runs every test, reports failures
CLAUDE.md             this file
```

The source is a regular page, but browsers do not load ES modules from `file://`, so it needs a local server (`npm run serve`). `npm run build` writes `dist/pyramid.html`, the whole app in one file. That file is a page *fragment*: it starts at `<title>` with no doctype, `<html>`, `<head>` or `<body>`, because the Claude artifact host adds that skeleton when publishing. `dist/index.html` is the same inside a complete document and opens by double-click. The build strips the `import` lines and `export` keywords and joins the modules, so top-level names must stay unique across modules (the build fails on a duplicate `const`, `let` or `class`).

There are no runtime dependencies and no bundler. Fonts come from Google Fonts (optional; system fonts are the fallback).

## Commands

```
npm install                 # installs Playwright (dev only)
npx playwright install chromium
npm run check               # syntax-check every module
npm test                    # all tests (≈5 min; they run real-time metronome sessions)
node tests/run-all.mjs align csv     # only tests whose file name contains "align" or "csv"
node tests/run-all.mjs core align-unit   # the Node-only tests (under a second, no browser)
npm run serve               # serve the source on http://localhost:8080
npm run build               # write dist/pyramid.html and dist/index.html
PYRAMID_HTML=dist/pyramid.html npm test   # run the tests against the single-file build
```

Playwright needs Node 20 or newer.

The microphone needs a secure context: `http://localhost` or `https://`, or a `file://` page with permission granted. For real use open it in Chrome or Edge (the output-device selector needs `AudioContext.setSinkId`, which Safari and Firefox lack).

About the tests: most of them print what they observed and only fail on a page error or a crash; they were written as verification scripts during development, with the expected values in the log text or in comments. Read the output when changing timing or analysis code. Turning the printed expectations into real assertions is worthwhile and not done yet, except in `core-analysis.mjs`, which asserts. Screenshots land in `tests/out/`.

Module variables are not globals, so the browser tests reach the app through `window.app` (set at the end of `js/main.js`): shared state is `app.S.<name>`, and the functions and elements listed there are `app.<name>`. A test that needs to observe calls to a function uses `spy(page, name)` from `tests/_env.mjs`.

## Claude artifact host

The app was first published as a Claude artifact (the links are in `CLAUDE.local.md`, which is not checked in). To publish a new version there, build and publish `dist/pyramid.html`.

Two places in the code are artifact-specific and already have fallbacks, so nothing breaks outside the artifact host: `exportWav()` and `downloadCsv()` try `window.claude.use('downloads')` first and fall back to a plain `<a download>` link. Outside the host the fallback is what runs.

## How it works

### The core idea

There is no real-time note detection (it was tried and removed: unreliable on real audio). The mic is only recorded. The metronome click plays on speakers, so the mic records the click next to the guitar. After Stop, the app finds the recorded clicks, matches them to the schedule it kept while playing, and places the whole subdivision grid from that. Nothing is calibrated; the count-in is the calibration.

### Code map

| Module | Contents |
|---|---|
| `js/state.js` | `S`, the one object holding every variable that more than one module reads or writes (`S.bpm`, `S.beatLog`, `S.recBeats`, …). A variable used by a single module is a plain `let` in that module |
| `js/dom.js` | `$ = getElementById`, element refs, small helpers (`manualSubdiv()`) |
| `js/core/onset.js` | `computeOnsetFunction` |
| `js/core/align.js` | `alignByRecordedClicks`, `clickRulerShift`, `gridFromLog`, `placeGrid` (the three combined, with the fallback) |
| `js/core/timing.js` | `analyzeTake` (attack per beat, score, points, per-position statistics) |
| `js/core/bands.js` | `bandsFor`, `ioiWeight` |
| `js/core/findings.js` | `buildFindings` |
| `js/vanish.js` | vanishing-metronome tables `VANISH_DEF` / `VANISH_SEQ` and stage logic |
| `js/ui.js` | `buildBeatDots`, `buildPyramidSeq` (sequence from the selected steps), `renderBarsRow` / `upcomingBars` (the ♩♫♬ bar notation), `updateSessionHead` (round, BPM, bar x of y, time) |
| `js/audio.js` | `playTone`, `synthClick` (four sounds), `playClick`, `pollClickHeard` (does the input hear the click during the count-in?) |
| `js/devices.js` | `getMicStream` (one stream kept open; echo cancellation, noise suppression and AGC off), `populateDevices`, `populateOutputs`, `applySink`, mic test |
| `js/scheduler.js` | `scheduleTick` (lookahead scheduler), `endCountIn`, `advancePyramidStep`, `applyProgression`, `randomBpm`, `timeDone` |
| `js/recording.js` | `startRecording`, `finalizeRecording`, `clearRecording`, `exportWav` |
| `js/playback.js` | waveform rendering, `startPlayback` |
| `js/results.js` | `analyzeTiming` (reads the page settings, calls `analyzeTake`, stores and shows the result), `renderDriftChart`, `driftHtml`, `renderAnaSummary` |
| `js/history.js` | `snapshotTake()` (settings of a take, for the CSV), takes history, CSV log |
| `js/session.js` | `startAudio` / `stop` |
| `js/main.js` | UI handlers, init and settings memory, `window.app` |

The modules in `js/core/` take plain arrays and objects and return plain objects. They must not import from outside `js/core/` or touch `document`, `window` or `S`.

### Scheduler

Web Audio lookahead scheduling: a 40 ms `setInterval` schedules every tick within the next 120 ms (`LOOKAHEAD`). State changes (end of count-in, next pyramid step, time limit) are functions put in `pendingTransition` and executed inside the scheduler exactly on a tick boundary. UI updates that must coincide with the sound go through `atTickTime()`. `sessionId` guards stale timers.

Every scheduled tick is logged in `beatLog` while recording: `{bpm, t, q (on a quarter), bar (bar downbeat), sub, clicked, ci (count-in), quiet (first count-in bar), seg (recording segment, +1 per resume), round}`. `t` is AudioContext time minus the time spent paused. This log is the schedule the recording is later aligned to.

### Recording

Mic only, mono: `sourceNode → micMono (1 channel) → MediaStreamDestination → MediaRecorder`. The electronic click is never mixed in; the click in the recording is the acoustic one. The recording starts at the count-in. Pausing mutes and drops ticks already scheduled in the lookahead, and resume starts a new segment.

### Grid alignment (`placeGrid`, called by `finalizeRecording`)

1. `alignByRecordedClicks`: Goertzel per 128-sample block at the click pitches (1800/1200 Hz exercise, 2000/1400 Hz count-in). Candidates are blocks where the tone jumps ≥ 12 dB and dominates the block. The offset between recorded and scheduled clicks is the mode of the pairwise differences (4 ms bins), voted by the clicks of the first, silent count-in bar only (`quiet`), then the median. At least two agreeing silent-bar clicks are required (three clicks when there is no usable silent bar). After a pause/resume the offset is re-estimated per segment (`segOffset`).
2. `clickRulerShift`: the alignment dates a click at the first block where its tone appears, the note detector dates a note at the half-rise of its attack. The recorded clicks are re-dated with the note detector and the grid shifted by the median difference (0–15 ms), so notes and clicks share one ruler. Without this every note read ~5–7 ms late.
3. `S.recBeats = gridFromLog(…, offset + ruler, segOffsets)`.
4. Fallback when the click is not in the recording (headphones, direct input): the grid is placed by the delay the audio system reports (`baseLatency + outputLatency + 8 ms`), or a fixed 60 ms if nothing is reported. The UI says so right after the count-in and under the waveform.

### Timing analysis (`analyzeTake`)

- Onset function: SuperFlux (Böck & Widmer 2013). 512-sample Hann frame, hop 128, log magnitude, flux against a max-filtered frame 3 hops earlier. A second function excludes the bins around the click pitches and their 2nd/3rd harmonics (`odfNoClick`), and `tone` is the share of the newest block's energy at click pitches.
- Peaks: local maximum ±2 hops, rise ≥ 5 over the mean of the previous 32 hops. Onset time = the hop where the rise passes half its height, plus one frame length.
- Click vs note: a peak is "click" if its block is mostly click tone or it lies within 15 ms of a beat where the metronome actually clicked. Such a peak counts as a note only if it has clearly more off-click flux (1.5×) or level (1.6×) than the bare count-in clicks had.
- Per beat: among the attacks within half the note's interval (max 150 ms), the clearly loudest one wins (amplitude in the 20 ms after the onset); flux decides only between comparably loud ones. This is what keeps pre-strum scrapes from being picked.
- Weak-note rule: an attack weaker than X% of the take's median strength is dropped (slider "Ignore attacks weaker than", default 10%).
- Beats after the last detected note are `skipped` (time to press Stop). With "ignore unplayed beats" on, empty beats become `rest` and are left out; otherwise they are misses.
- Bands scale with the interval the note had to hit (`bandsFor`): green = max(15 ms, 3%) capped at 25 ms; amber = max(35 ms, 7%) capped at 60 ms.
- Score = share of beats inside the amber band × 100 (misses count 0, no weighting). Points = score × mean `ioiWeight` × length factor. `ioiWeight` is 1 for 250–700 ms intervals, +0.35 per halving below, +0.25 per doubling above; length factor = 1 + 0.15·log2(N/16), clamped 0.85–1.6.
- `byPos`: statistics per position (downbeat, beats 2–4, "+", e, a, trip, let). `buildFindings` turns everything into plain sentences (per subdivision, overall lean, weak position, single-syllable lean, rush/stretch after the beat, downbeat vs 2–4, progress over the take, drift).
- Spread = sample standard deviation of the deviations; lean = their mean.

### Validation done

A WAV of an instructor playing quarters at 60 bpm scored 100 with ±2.5 ms spread. Synthetic takes with known deviations are recovered within 5 ms. Notes placed exactly on the click read 0 to −3 ms end to end. The thresholds and weights come from the timing literature; the sources and reasoning are in the folded "research notes" box at the bottom of the app and in the companion document.

### Browser storage

`localStorage` keys: `pyramidSettings` (all controls), `pyramidTakes` (history table), `pyramidCsvLog` (one row per beat per analyzed take, keyed by take id), `pyramidOutputLabel` (chosen output device, by name). All reads and writes are wrapped in try/catch.

### CSV log

One row per analyzed beat; columns in `CSV_COLS`. Take-level columns (date, time, settings) repeat on every row; per-beat columns are round, bar, beat, subdivision, position, interval, grid and onset time, deviation (negative = early), band, in_zone, plus the take's score, points and difficulty. Re-analyzing a take replaces its rows.

## Decisions that should not be undone without asking

- No real-time onset detection; analysis happens after Stop.
- The recording is the microphone only; the click is recorded acoustically, never mixed in electronically (mixing it made the guitar appear early on playback).
- No calibration step; the count-in (minimum one bar, default two) anchors the grid, and only its first bar needs silence.
- Score stays plain accuracy; difficulty goes into Points, not into the score.
- Quarter is the default subdivision, 50 bpm the default tempo, "stop after" defaults to 5 minutes.

## Known limits and open work

1. **Direct inputs (iRig 2, audio interfaces).** The click never reaches the recording, so the grid uses the reported system delay. Spread, drift and position comparisons are unaffected; the absolute lean is uncertain by a few ms on a same-device setup (iRig through the headphone jack) and by 10–50 ms when input and output are different devices. Agreed but not built:
   - grey out or caveat the Lean, Score and In-zone tiles when the click was not heard;
   - a one-time two-input calibration (interface + built-in mic recorded together) to measure an interface's delay and clock-drift rate, stored per device;
   - for mic takes, fit a line through all recorded clicks instead of one offset per segment, to absorb slow clock drift (e.g. Bluetooth speakers).
2. **Reported bug, not reproduced with synthetic audio:** on real takes the metronome clicks were sometimes analyzed as notes. A fix based on the schedule and the click harmonics went in at version 60; it needs confirmation on a real recording (ask for a WAV export of a failing take).
3. **"I hear myself earlier in the recording than while playing."** A code review found no path that shifts the guitar relative to the click; likely perceptual. A WAV export of such a take would settle it.
4. `restartGridNow` (tempo or subdivision changed mid-session) leaves the already scheduled lookahead clicks sounding, so there is a brief double click.
5. Most tests print rather than assert (see above).

## Working conventions from the original session

- Show an example or a plan before building anything substantial, then build after a yes.
- After every change: syntax check, run the affected tests, look at a screenshot when the UI changed.
- Keep explanations short and concrete; no jargon without a definition.
