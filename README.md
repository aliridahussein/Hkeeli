# Hkeeli — إحكيلي

A bilingual (English / Arabic) site for a Lebanese Arabic dialect teacher. It is
two things at once:

1. a **guided learning journey** — a free mini-lesson, a curriculum with stated
   outcomes, and a daily practice session, for people who don't read Arabic yet;
2. a **portfolio and booking page** — how she teaches, what a class is, how to
   book one.

The promise the whole site is arranged around: *speak useful Lebanese Arabic
from your first lesson, even if you can't read Arabic.*

Static HTML, CSS and ES modules. **No build step, no dependencies, no backend.**
Deploy the folder as-is to Netlify, Vercel, GitHub Pages or any static host.

> **Vercel note:** `vercel.json` sets `"outputDirectory": "."` and must stay.
> With the "Other" framework preset Vercel publishes `public/` when that folder
> exists — and ours holds only audio, so without this file the whole site 404s.
> See [Deploying](#deploying).

---

## Running it locally

```bash
npx serve .
```

Then open <http://localhost:3000>.

> Opening `index.html` directly with `file://` **will not work**: the site loads
> `data/*.json` with `fetch()` and uses ES modules, both of which browsers block
> on the `file:` protocol. Any static server will do — `npx serve`,
> `python -m http.server`, the VS Code Live Server extension.

A ready-made config for the Claude Code preview pane lives in
`.claude/launch.json` (port 4321).

---

## Folder structure

```
index.html          Home — hero, mini-lesson, goals, method, journey, teacher,
                    classes + booking, FAQ
start.html          Start Here — three-question onboarding and a recommendation
learn.html          The curriculum: units grouped by stage, expandable
practice.html       Daily Practice, plus the seven games grouped by skill

css/
  tokens.css        Design tokens: colour, type, spacing, radii, shadows, motion
  base.css          Reset, typography, Arabic/transliteration rules, utilities
  components.css    Nav, buttons, postcard, lesson card, game tile, forms, footer
  layout.css        Page grids and breakpoints (mobile-first)
  games.css         Practice-page UI (loaded by practice.html only)

js/
  config.js         Everything environment-dependent — audio base, keys, tuning
  i18n.js           Bilingual layer: bundles, data-i18n, <html lang/dir>
  data.js           Loads lessons.json; the only module that fetches it
  audio.js          playPhrase(): recording first, speech synthesis fallback
  storage.js        Progress adapter (localStorage) + spaced repetition
  toast.js          Transient messages
  ui.js             Page chrome + shared renderers (phrase strip, progress, …)
  journey.js        Stages, goals, recommendations, unit progress — the model
                    every page asks "what should this learner do next?"
  mini-lesson.js    The working lesson on the home page
  daily.js          Daily Practice — sequences the existing games into one session
  main.js           Home page
  start.js          Start Here onboarding
  learn.js          Lessons page
  practice.js       Practice page — daily session, game catalogue, mounting
  booking.js        Booking form submission
  games/
    index.js        Game registry + shared shell (score, streak, summary)
    shared.js       Shuffling, answer normalisation, option building
    keyboard.js       A-D / 1-9 / Enter for the multiple-choice games
    listen-choose.js  match.js  fill-blank.js
    sentence-builder.js  order-dialogue.js  reply.js  flashcards.js

data/
  lessons.json      All course content — units, dialogues, phrases, exercises
  en.json           English UI strings
  ar.json           Arabic UI strings

public/audio/       Recordings, one folder per unit (see public/audio/README.md)
assets/images/      Photography and logo assets
```

### Design system

The approved mockup is the source of truth and lives entirely in
`css/tokens.css` + `css/components.css`. **No stylesheet outside `tokens.css`
should contain a colour literal**, and no stylesheet should use physical
properties (`margin-left`, `left`, `text-align: right`) — logical properties
only, which is what makes the Arabic layout mirror correctly for free.

---

## Adding a lesson unit

Append one object to `units` in `data/lessons.json`. Nothing else changes: the
Lessons page renders it under its stage, and every phrase in it immediately
becomes playable in all seven games and in Daily Practice.

```jsonc
{
  "id": "unit-4",
  "order": 4,
  "slug": "directions",
  "featured": false,              // true = show on the home page preview
  "feature": "u4-p3",             // optional: which phrase shows on the card
  "stage": "everyday-situations", // which journey stage it belongs to
  "level":       { "en": "Everyday", "ar": "يوميّات" },
  "title":       { "en": "Finding Your Way", "ar": "..." },
  "description": { "en": "...", "ar": "..." },
  "outcome":     { "en": "Ask for directions and understand the answer.", "ar": "..." },
  "skills": [                                    // shown as chips on the card
    { "en": "Left, right, straight on", "ar": "..." }
  ],
  "tip":         { "en": "...", "ar": "..." },   // optional
  "challenge":   { "en": "...", "ar": "..." },   // optional
  "homework":    { "en": "...", "ar": "..." },   // optional
  "dialogue": [
    { "speaker": "A", "ar": "وين الطريق؟", "translit": "wein el tari2?", "en": "Where's the road?" }
  ],
  "phrases": [
    {
      "id": "u4-p1",
      "ar": "على اليمين",
      "translit": "3a l-yamin",
      "en": "to the right",
      "audio": "lessons/unit-4/3a-l-yamin.mp3",   // optional until recorded
      "accept": ["3a l yamin", "aa l yamin"],     // extra accepted spellings
      "tags": ["directions"],
      "literal": { "en": "on the right side", "ar": "..." },  // optional
      "note":    { "en": "Said pointing, not on the phone.", "ar": "..." }, // optional
      "audioSlow": "lessons/unit-4/3a-l-yamin-slow.mp3",      // optional
      "blank": {                                   // optional, see below
        "translit": "lif ___ ba3d el ishara",
        "ar": "لف ___ بعد الإشارة",
        "answer": "3a l-yamin",
        "hint": { "en": "right", "ar": "يمين" }
      }
    }
  ]
}
```

Notes:

- **`id` must be unique across the whole file** — progress and scheduling are
  keyed on it. Renaming an id resets that phrase's learning history.
- **Every phrase needs `ar`, `translit` and `en`.** All three are always shown,
  in both site languages: an English-mode learner still needs the script, and an
  Arabic-mode beginner still needs the transliteration.
- **`blank` is optional.** Without it, Fill the Blank derives an exercise by
  hiding the longest word of the transliteration. Single-word phrases are simply
  skipped by that game.
- **`stage`** places the unit on the learning journey. The five stage ids live
  in `js/journey.js` (`STAGES`); a unit with no `stage`, or one naming a stage
  that isn't there, simply won't appear on the Lessons page — check this first
  if a new unit goes missing.
- **`outcome` and `skills`** drive the curriculum card. Write the outcome as
  something the learner will be able to *do*; the page prefixes it with "You'll
  be able to:". Without an outcome the card falls back to `description`.
- **`literal` and `note`** are optional and only for what is actually true of
  the phrase — a literal gloss where it differs from the natural meaning, and a
  usage note. The register label ("Casual", "Polite", "A blessing"…) is derived
  from `tags`, not written by hand, so it can never contradict the data.
- **`audioSlow`** adds a slow recording. The slow control appears **only** when
  the file is named here — there is deliberately no synthetic stand-in, because
  a "slow" button that plays the same speed teaches nothing.
- **`accept`** is worth filling in. Typed answers are already normalised
  (case, spacing, punctuation, doubled letters, and chat-alphabet digits — `7`/`h`,
  `3`/`gh`/`aa`, `2`, `5`/`kh`, `9`/`s`) and tolerate one typo, but listing the
  spellings you actually see from students makes the game feel fair.

---

## Audio

`js/audio.js` resolves pronunciation in this order:

1. the phrase's `audio` file, resolved against `CONFIG.audioBase`;
2. the browser's speech synthesis in an Arabic voice (temporary placeholder);
3. a "no audio yet" toast — it never throws.

A missing file is probed **once** per phrase per session, then remembered, so a
404 doesn't repeat on every tap. The 404s you'll see in the console today are
exactly that — intentional, and they disappear as recordings land.

### Adding a recording

Drop the file at the path already named in `lessons.json`:

```
public/audio/lessons/unit-1/kifak.mp3
```

That's the whole change — no code, no data edit. The file takes priority over
speech synthesis the moment it exists.

### Moving to hosted audio

One line in `js/config.js`:

```js
audioBase: 'https://cdn.example.com/hkeeli/audio/'
```

Phrase paths stay relative and resolve against the new base. A phrase whose
`audio` is already an absolute URL is used as-is, so partial migration works
too. When the recordings are complete, set `ttsFallback: false` to stop the
synthetic-voice fallback entirely.

---

## Bilingual and RTL

UI copy never appears in the markup. Elements name a key instead:

```html
<h2 data-i18n="about.title"></h2>
<button data-i18n-attr="aria-label:nav.openMenu"></button>
<input data-i18n-attr="placeholder:book.goalsPlaceholder">
```

Keys resolve against `data/en.json` and `data/ar.json`. To add a string, add it
to **both** files with the same key path — a key missing from `ar.json` falls
back to English rather than rendering blank.

Switching language sets `<html lang>` and `<html dir>`, re-renders every
translatable node, saves the choice to `localStorage`, and fires a
`hkeeli:langchange` event that data-driven sections listen for. There is no
page reload. English is the default on a first visit.

Lesson *content* is deliberately exempt: Arabic script, transliteration and
English always render together, in both modes.

All three scripts isolate their own direction (`unicode-bidi: isolate`, see the
top of `css/base.css`). This matters for the Latin runs, not just the Arabic:
without it an Arabic page renders `How are you?` as `?How are you`, because the
trailing punctuation gets absorbed into the surrounding RTL run. Any new element
holding a phrase's English needs to join that selector list.

---

## Brand assets, icons and link previews

The mark is a teal speech bubble holding a citrus **ح** — the root letter of
حكي (to talk) and the H of "Hkeeli".

```
favicon.ico              root by necessity - browsers request /favicon.ico
                         automatically when no <link> matches
favicon.svg              root by convention; preferred where supported, and the
                         letter is an outline path so it needs no Arabic font
apple-touch-icon.png     root by necessity - iOS probes /apple-touch-icon.png.
                         180px, full-bleed and square: iOS masks it itself
robots.txt               root by spec
sitemap.xml              root by convention

assets/icons/favicon-32x32.png     tab icon
assets/icons/favicon-192x192.png   Android home screen
assets/icons/favicon-512x512.png   splash / future PWA manifest
assets/images/og-image.png         1200x630 link preview card
```

Only the files with an automatic root lookup live in the root. Everything else
is reached through an explicit tag, so it belongs under `assets/` - moving one
of those means updating the three `<head>` blocks, and nothing else.

These are generated, not hand-drawn. The script lives outside the repo (it
pulls Fraunces, Markazi Text and Karla from Google Fonts and draws at 4x before
downsampling); regenerate only if the mark or the palette changes.

### Domain

**`og:url`, `og:image`, `canonical`, `robots.txt` and `sitemap.xml` all hardcode
`https://hkeeli.com`.** Absolute URLs are required — link scrapers do not
resolve relative `og:image` paths reliably — so this is the one string to change
when the real domain is decided:

```bash
grep -rl "https://hkeeli.com" index.html start.html learn.html practice.html robots.txt sitemap.xml   | xargs sed -i "s|https://hkeeli.com|https://YOUR-DOMAIN|g"
```

Until the domain resolves, link previews will show the title and description
but no image, because the scraper can't fetch it.

There is deliberately **no `Person` structured data** yet: the teacher's name,
photo and testimonials in `data/en.json` are still placeholders, and publishing
invented ones as machine-readable claims would be worse than publishing none.

---

## The About section

There is no portrait, by choice: the teacher's identity stays private. In its
place is a **spoken introduction** — for a language teacher the voice is the
more relevant proof anyway, and it identifies nobody.

- The line she says lives in `data/lessons.json` under `meta.intro`, in the same
  `{ar, translit, en, audio}` shape as a phrase, which is why it can be passed
  straight to `playPhrase()` and inherits the file-first, TTS-fallback path.
- Drop the recording at `public/audio/intro/hello.mp3` and it plays instead of
  the synthetic voice. Nothing else changes.
- The heading is "How I teach", not "Meet your teacher": it frames the section
  around the method, so the absent face stops being conspicuous.
- The copy stays **first person and singular**. Anonymous-but-specific earns
  more trust than a plural "our teachers have 8+ years of experience", which is
  unverifiable and is the register every low-quality tutoring site writes in.

### Testimonials

`about.testimonials` is an **array, empty on purpose**. The block renders only
when it holds real quotes; otherwise one line says they are coming. The
placeholder quotes that used to sit here read as fake, which costs more trust
than an absent section.

To add real ones, put matching objects in both bundles:

```json
"testimonials": [
  { "quote": "I called my grandmother and held a whole conversation.", "name": "First name, city" }
]
```

---

## The learning journey

`js/journey.js` is the model behind every "what next?" on the site. It holds:

- **`STAGES`** — the five stages a learner moves through. A unit joins one by
  declaring `stage` in `lessons.json`. Stages with no units yet are still named,
  so the path is visible without pretending the material is there — collapsed
  into one closing "Still to come" row on the home page, and listed under
  "Coming soon" on the Lessons page. Writing units for a stage promotes it to a
  full row automatically; no code changes.
- **`GOALS`** — the five reasons on the home page, each pointing at a unit that
  exists today and the game that drills it.
- **`recommend({goal, level, first})`** — the single rule that turns the Start
  Here answers into one destination. A complete beginner always lands on unit 1
  whatever their goal; "practise listening" and "prepare for conversation" go to
  a game rather than a page of text.
- **`usageLabel(phrase)`** — the register chip, derived from the phrase's own
  `tags`. A phrase with no matching tag gets no label rather than a guessed one.

### Start Here

`start.html` asks three questions, one screen at a time, and ends on a single
button. Every question can be skipped, the answers are stored on the device
under `hkeeli.prefs.v1` (see `prefs` in `js/storage.js`), and the page carries a
link straight to Unit 1 for anyone who would rather not answer at all. There is
no account and nothing is sent anywhere.

`prefs` is deliberately separate from `progress`: clearing one should never
clear the other.

Start Here is reached from the hero's quiet "Not sure where to begin?" link and
from the footer, not from the primary nav. The home page already answers the
same question in place with the goal picker, and a nav item pointing away from
the free mini-lesson was sending first-time visitors in the wrong direction.

### The mini-lesson

The home page runs a real three-phrase lesson (`js/mini-lesson.js`) on the same
phrase bank, the same `playPhrase()` path and the same progress store as the
course. Answers are recorded under the id `mini-lesson`, so trying it out never
distorts a game's statistics. Change the phrases it teaches by editing
`LESSON_PHRASE_IDS` at the top of the module.

---

## Daily Practice

`js/daily.js` is the primary practice experience: one guided sequence rather
than seven equal choices. It **duplicates no game logic** — each step mounts a
real game in a `StepShell`, a subclass of `GameShell` whose only difference is
that finishing a round hands control back to the session instead of offering
"play again".

The sequence lives in `CONFIG.daily.steps` (`js/config.js`):

```js
{ kind: 'game', game: 'cards', length: 3, labelKey: 'daily.stepReview' }
```

`length` is passed to the shell as `roundLength`; games ask
`shell.roundSize(preferred, available)` instead of reading `CONFIG` directly, so
the same game runs an 8-question round on its own and a 3-question one inside a
session. The one non-game step, `kind: 'teach'`, presents the most overdue card
with its audio, literal meaning and usage note — being shown a phrase moves it
through the schedule but never counts toward the score.

Steps whose game has nothing to work with (a unit filter can leave "What Do You
Reply?" with no dialogue) are dropped from the plan rather than shown empty.

The seven games stay available below, grouped by skill in `GAME_GROUPS`
(`js/games/index.js`). A game added to `GAMES` but not to a group would vanish
from the catalogue, so `ungroupedGames()` collects the strays into a final
"More practice" group.

---

## Practice games

They all read from the same phrase bank, so content added to `lessons.json`
flows into every game automatically.

| Game | What it does |
|---|---|
| **Listen & Choose** | Plays a phrase, offers four English meanings, checks the pick. |
| **Match the Phrase** | Five Lebanese vs five English, shuffled; tap one then the other to pair. |
| **Fill the Blank** | Type the missing word, or switch to multiple choice; lenient checking. |
| **Sentence Builder** | Tap scrambled word chips into the right order from the English meaning and the audio. |
| **Order the Conversation** | A unit's dialogue, shuffled — tap the lines back into sequence. |
| **What Do You Reply?** | Plays a line from a dialogue; pick the reply that actually follows it. |
| **Daily Flashcards** | Show answer (or tap the card) to flip Lebanese ↔ English, then "Got it" / "Still learning". |

### Scoping practice to one unit

`practice.html?unit=unit-2` narrows every game to that unit's phrases, and the
Learn page's "Practice these words" button links this way. The unit dropdown on
the Practice page writes the same parameter, so any drill can be bookmarked or
shared. Without the parameter, games draw from the whole course.

Note the local dev server needs `serve.json` (`"cleanUrls": false`) — otherwise
`serve` redirects `/practice.html?unit=…` to `/practice` and **drops the query
string**, silently unscoping the drill. Vercel with our `vercel.json` does not
rewrite URLs, so production is unaffected.

Order the Conversation, What Do You Reply? and Sentence Builder read whole
units rather than loose phrases (they need the `dialogue` arrays), which is what
`GameShell`'s `context` argument carries. The first two deliberately do **not**
call `shell.record()`:
dialogue lines aren't phrases, and writing their ids into the spaced-repetition
store would schedule reviews for cards that no flashcard will ever show. They
call `shell.addScore()` instead, so the round still scores.

Sentence Builder is the mixed case: it draws on both phrases and dialogue
lines (anything three words or longer, skipping transliterations that carry a
`/`, which is an editorial "or" rather than a word). Only the phrase items go
through `shell.record()`; the dialogue items just score. Its prompt shows the
English and the audio and *not* the transliteration — otherwise the answer
would be sitting there to copy.

What Do You Reply? draws its three wrong answers from *other* units. Lines from
the same conversation are the tempting distractor, but with four lines per
dialogue several of them could genuinely follow, and an ambiguous question
teaches nothing. If the course is ever down to one unit with dialogue, it falls
back to the whole bank.

Match uses **tap-to-pair rather than drag-and-drop** on purpose: it behaves
identically with a finger and a mouse and stays keyboard-reachable, where drag
would be a pointer-only path.

**Keyboard:** in the multiple-choice games, `A`–`D` (or `1`–`4`) pick an answer
and `Enter` advances. `js/games/keyboard.js` stands down whenever a text field
has focus, so typing in Fill the Blank is never intercepted.

**Flashcards deliberately show no score.** The first three games have right and
wrong answers, so score and streak are meaningful. Flashcards are self-graded
review: a visible score rewards pressing "Got it", and that judgement is the
input the spaced-repetition scheduler runs on — inflate it and the scheduling
degrades. The card HUD counts *Known* and *To review* instead. A game opts into
this by setting `hudMode: 'review'` (see `js/games/flashcards.js`); everything
else defaults to the quiz HUD.

Round length, option count, pair count and SRS intervals are all in
`CONFIG.games`.

---

## Progress tracking

Games never touch `localStorage`. They call the adapter in `js/storage.js`:

```js
progress.getPhraseState(id)
progress.setPhraseState(id, patch)
progress.recordAnswer(gameId, phraseId, correct)
progress.getDueCards(phrases, limit)
progress.getGameStats(gameId)
progress.recordSession(gameId, score, total)
progress.getUnitProgress(unit)      // { total, seen, learned, ratio, status }
```

Scheduling is Leitner boxes 0–4 with 0/1/3/7/21-day intervals: a correct answer
promotes a card, a wrong one sends it back to box 0. Flashcard sessions pull
overdue cards first, then cards never seen.

**To move progress to a real backend**, write an `ApiProgress` class with those
six methods and export it in place of `LocalStorageProgress` at the bottom of
`js/storage.js`. No game logic changes. The storage key is versioned
(`hkeeli.progress.v1`) so a schema change can migrate rather than clobber, and
corrupt or absent data always falls back to a fresh object instead of throwing.

---

## Booking

The form on the home page is a **placeholder**: it composes a prefilled
`mailto:` draft. To wire it to a real service, set one value in `js/config.js`:

```js
formEndpoint: 'https://formspree.io/f/xxxxxxx'
```

`js/booking.js` then POSTs the form as JSON instead. Update `bookingEmail` to
the teacher's real address before launch — it currently points at
`hello@hkeeli.example`.

---

## Mobile

Mobile is the full product, not a reduced one. Base CSS *is* the phone layout;
media queries only enhance upward (600 / 860 / 1000px).

- The hero postcard stack is a swipeable scroll-snap rail with dots on phones,
  and the mock's scattered rotated stack from 860px up.
- Nav links move into a drawer below 860px — including the Book a Class link,
  so nothing is lost. The four items are Lessons, Practice, About and Book a
  Class; the two that are home-page sections are marked current only while their
  hash is the target. Start Here is deliberately *not* in the primary nav — see
  "Start Here" above.
- Every game is tap-first, with the check/next actions in a sticky bar within
  thumb reach.
- Hover lifts are wrapped in `@media (hover: hover)` so touch devices get press
  states instead, and all motion respects `prefers-reduced-motion`.

---

## Deploying

There is nothing to build. Point any static host at the repository root.

**Vercel** needs one piece of configuration, supplied by `vercel.json`:

```json
{ "outputDirectory": "." }
```

Vercel's "Other" framework preset sets the output directory to `public` when
that folder exists, and only that folder gets served. Our `public/` holds the
audio files, not the site, so without this override Vercel publishes a folder
with no `index.html` and every URL returns `404: NOT_FOUND`. Equivalent project
settings: Framework Preset "Other", Build Command overridden and left empty,
Output Directory `.`.

**Netlify** — publish directory `.`, no build command.
**GitHub Pages** — serve from the branch root; add an empty `.nojekyll` file so
paths are left alone.

If you ever move the audio out of `public/` (say to `media/`), this override
stops being necessary — update `CONFIG.audioBase` in `js/config.js` to match.

## What the owner still has to supply

Nothing on the site invents a fact. Where a business detail isn't known, the
page says so in neutral wording instead of guessing — these are the gaps:

| Gap | Where to fill it |
|---|---|
| **Class length, price, trial-class policy** | `classes.facts` in `data/en.json` + `data/ar.json`. Any row whose `value` is the literal string `"tbc"` renders as "Ask when you book — this isn't set in stone yet." Replace the value and the italic note disappears. |
| **Real recordings** | Drop mp3s at the paths already named in `lessons.json`; everything falls back to speech synthesis until then. Add `audioSlow` per phrase to unlock the slow-audio control. |
| **Testimonials** | `about.testimonials` is an empty array on purpose — see above. |
| **Teacher's real name / photo / credentials** | Not published anywhere, and no `Person` structured data exists. If they are ever added, add them to `data/*.json` and the JSON-LD together. |
| **Booking address** | `CONFIG.bookingEmail` still points at `hello@hkeeli.example`. |
| **A real booking backend** | Set `CONFIG.formEndpoint`; the form POSTs JSON instead of composing an email. |
| **Units 4–12** | Not in `lessons.json` yet; units 1–3 are complete. Stages 4 and 5 of the journey show as "being written" until units declare those `stage` ids. |
| **Domain** | `https://hkeeli.com` is hardcoded in the four pages, `robots.txt` and `sitemap.xml` — see [Domain](#domain). |

The claims in `about.tag2` / `about.tag3` ("8+ years of teaching", "students in
14 countries") predate this build and were left as they were found. If they
can't be substantiated, they are the first thing to cut.
