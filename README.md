# Hkeeli — إحكيلي

A bilingual (English / Arabic) site for a Lebanese Arabic dialect teacher. It is
two things at once:

1. a **portfolio and booking page** — who she is, what she teaches, how to book;
2. a **lightweight learning platform** — lessons and four playable games for
   people who don't read Arabic yet.

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
index.html          Home — hero, about, lesson preview, games preview, booking
learn.html          All lesson units, expanded
practice.html       The four games

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
  ui.js             Page chrome + shared renderers (lesson card, game tile, …)
  main.js           Home page
  learn.js          Learn page
  practice.js       Practice page — game picker and mounting
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
Learn page renders it, and every phrase in it immediately becomes playable in
all four games.

```jsonc
{
  "id": "unit-4",
  "order": 4,
  "slug": "directions",
  "featured": false,              // true = show on the home page preview
  "feature": "u4-p3",             // optional: which phrase shows on the card
  "level":       { "en": "Everyday", "ar": "يوميّات" },
  "title":       { "en": "Finding Your Way", "ar": "..." },
  "description": { "en": "...", "ar": "..." },
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
grep -rl "https://hkeeli.com" index.html learn.html practice.html robots.txt sitemap.xml   | xargs sed -i "s|https://hkeeli.com|https://YOUR-DOMAIN|g"
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
  so nothing is lost.
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

## Known placeholders

- **No real recordings** — everything falls back to speech synthesis.
- **Portrait** is a CSS gradient block; swap `.about-portrait` for an `<img>`.
- **Testimonials** are clearly-labelled placeholder text in `en.json`/`ar.json`.
- **Units 4–12** are not in `lessons.json` yet; units 1–3 are complete.
- **Booking** composes an email; there is no backend, login or payment.
