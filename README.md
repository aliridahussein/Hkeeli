# Hkeeli — إحكيلي

A bilingual (English / Arabic) site for a Lebanese Arabic dialect teacher. It is
two things at once:

1. a **guided learning journey** — a free mini-lesson, a curriculum with stated
   outcomes, and a daily practice session, for people who don't read Arabic yet;
2. a **portfolio and booking page** — how she teaches, what a class is, how to
   book one.

The promise the whole site is arranged around: *speak useful Lebanese Arabic
from your first lesson, even if you can't read Arabic.*

Static HTML, CSS and ES modules. **No build step and no backend**; the one
library, three.js (for the courtyard), is vendored as a single file. Deploy the
folder as-is to Netlify, Vercel, GitHub Pages or any static host.

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
index.html          Home — the courtyard (hero), mini-lesson, goals, method,
                    journey, teacher, classes + booking, FAQ
start.html          Start Here — three-question onboarding and a recommendation
learn.html          The curriculum: units grouped by stage, expandable
practice.html       The practice hub: scenes, Daily Practice, seven drills.
                    Everything played opens in the play stage over it

css/
  tokens.css        Design tokens: colour, type, spacing, radii, shadows, motion
  base.css          Reset, typography, Arabic/transliteration rules, utilities
  components.css    Nav, buttons, postcard, lesson card, forms, footer
  layout.css        Page grids and breakpoints (mobile-first)
  courtyard.css     The home page's courtyard: stage, labels, place content
  courtyard-experience.css  A place opened full screen: bar, dock, drawer
  games.css         The practice hub and the play stage (practice.html only)
  zee-chat.css      Zee's launcher and chat panel

worker/             Cloudflare Worker — Zee's API only (see "Zee" below)
  index.js          /api/zee/chat, everything else falls through to assets
  zee/              chat handler, prompt assembly, limits, rate limiting

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
  stage.js          The play stage: full-screen layer, top bar, history/Back
  icons.js          The drawn icon set (replaces the emoji the games used)
  motion.js         Hand-offs, FLIP tile travel, count-ups, the score token
  sfx.js            Synthesised feedback tones + the per-device mute
  analytics.js      track(), the site-wide seam for a future provider
  session.js        StepSession — runs a sequence of real games as one thing
  scenes.js         The scenes (data) + SceneSession and its transcript ending
  daily.js          Daily Practice — StepSession configured from CONFIG.daily
  cta.js            The bridge from a finished round to booking
  main.js           Home page
  courtyard/        The courtyard — see "The courtyard" below
  start.js          Start Here onboarding
  learn.js          Lessons page
  practice.js       Practice hub + routing: what's playing, URLs, Back button
  booking.js        Booking form submission
  zee-chat.js       Zee's launcher (every page); loads the panel on demand
  zee-panel.js      Zee's chat UI — streaming, transcript, controls
  zee-analytics.js  trackZeeEvent(), the seam for a future provider
  games/
    index.js        Game registry + shared shell (verdict bar, scoring, summary)
    chat.js         Conversation pieces: chat bubbles, who-is-speaking, and
                    phraseLine() for mixed-script text in the verdict bar
    shared.js       Shuffling, answer normalisation, option building
    keyboard.js       A-D / 1-9 / Enter for the multiple-choice games
    listen-choose.js  match.js  fill-blank.js
    sentence-builder.js  order-dialogue.js  reply.js  flashcards.js

data/
  zee/              Zee's server-side reference — NOT served publicly
  lessons.json      All course content — units, dialogues, phrases, exercises
  en.json           English UI strings
  ar.json           Arabic UI strings

public/audio/       Recordings, one folder per unit (see public/audio/README.md)
assets/images/      Photography and logo assets; courtyard/ holds the still
                    images rendered from the 3D scene
vendor/three/       three.js, tree-shaken to what the courtyard uses
tools/              Courtyard development tools (not deployed)
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

**The bundles always have to match the scripts.** A browser or proxy cache
that hands a page yesterday's `en.json` under today's scripts renders raw keys
("practice.heroTitle") in place of headlines — this happened during
development. Three defences in `js/i18n.js`:

- Bundles (and `lessons.json`, in `js/data.js`) are fetched with
  `cache: 'no-cache'`: always checked with the server, a 304 when unchanged.
- If the code asks for a key no loaded bundle has, the page re-fetches the
  bundles **once**, bypassing every cache, and re-renders through the
  `hkeeli:langchange` event if that copy has the key. A key missing from the
  server's copy too is a genuine typo: it stays visible (as the key, plus a
  console warning) and never loops.
- A missing key never replaces text an element already carries in the HTML.
  Most elements are empty in the markup, but some ship an English default (the
  nav, the practice page's headings); for those, a missing key shows the
  default instead of the raw key.

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
  `{ar, translit, en, audio}` shape as a phrase, so it goes through
  `playPhrase()` — but with `{ tts: false }`: it is the teacher introducing
  herself, and a synthetic voice saying "I'm your teacher" would pass for hers.
  Until the file exists the card shows the line in writing and says the
  recording is on its way.
- Drop the recording at `public/audio/intro/hello.mp3` and the play button
  appears — here and in the courtyard's teacher's corner. Nothing else changes.
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

## The courtyard

*"A little Lebanon, one conversation at a time."* The home page's hero is a
Lebanese courtyard — drawn in 3D where the device can draw it well, and as a
still image everywhere else. Each place in it opens the lessons that belong
there:

| Place | Opens | Built from |
|---|---|---|
| Courtyard entrance | First conversations | Unit 1: outcome, dialogue, four key phrases, tip, progress |
| Café table | Ordering like a local — **a café conversation you take part in** | Unit 2's dialogue and phrases (below) |
| Balcony phone | Talking with family | Unit 3, and the "Teta on the Phone" scene |
| Teacher's corner | Meet your teacher | `meta.intro`, `about.*`, and the Preply handover from `js/booking.js` |

### Files

```
js/courtyard/
  index.js        the controller: what is open, history, focus, motion toggle,
                  and the handover from the still image to the 3D scene
  places.js       the four places: links, label anchors, camera views, and
                  where they sit on the still images — read by both views
  panels.js       what each place opens (HTML, from lessons.json + bundles)
  cafe-story.js   the café encounter: its turns, state machine and dialogue dock
  storyboard.js   the café without 3D: frames rendered from the scene, layered
  audio-manifest.js  recording paths for the encounter's dialogue lines
  ambience.js     optional café sounds, synthesised, off by default
  listen.js       recording-only playback (see "Audio in the courtyard")
  poster.js       the still-image presentation
  scene/          the 3D presentation (three.js)
    presentation.js  renderer, frame loop, camera, labels, adaptive resolution
    rig.js           the camera rig (quintic, retargetable — see below)
    world.js         assembles the scene; merges static meshes by material
    architecture.js  the house, walls, gate, balcony, roof, pergola
    props.js         café table, telephone, teacher's desk, pots
    story.js         the café's waiter, his gestures, and everything on the table
    plants.js        lemon tree, vine, bougainvillea, geraniums, basil, trees
    atmosphere.js    sky, environment light, sun, steam
    library.js       materials, and the wind shader
    forge.js         procedural textures, drawn on the GPU at load
    canvas-art.js    the menu, notebook, slate, plaque and Hkeeli sign
    quality.js       device tiers and the WebGL probe
css/courtyard.css           hero, stage, labels, place content
css/courtyard-experience.css  a place opened: full screen, bar, dock, drawer
assets/images/courtyard/    the still images and the café storyboard (rendered from the scene)
vendor/three/               three.js, tree-shaken — see vendor/three/README.md
tools/                      scene preview, stills server, bundle script (not deployed)
```

Everything in the scene is modelled and textured in code — no downloaded
models, photographs or texture files, so there is nothing else to license.
Surfaces are procedural (GLSL, rendered once into render targets at load);
the printed things are drawn on canvases in the site's own typefaces, from
words already in `lessons.json`: the café menu (Unit 2's sugar levels), the
teacher's notebook and slate (Unit 1), the welcome plaque (the teacher's own
*ahla w sahla*). The only third-party code is three.js (MIT).

**Two presentations, one interface.** The still image (`poster.js`) is there
immediately, for everyone, and it is the whole courtyard on devices that
can't draw 3D well — no WebGL 2, or Save-Data. A software renderer gets the
3D scene built on the `minimal` tier, and timed during warm-up, before the
canvas is ever shown (a one-pixel read waits for each test frame to finish):
over 85 ms a frame — SwiftShader measured ~500 ms here — and the still view
stays, without a flash of 3D. If frames later turn that slow, the still
takes over mid-story, exactly where the scene was. `?courtyard=3d` keeps the
scene however slow, for testing. Labels sit
on it in the same places; choosing a place eases the image towards it and
opens the same panel. The 3D scene loads once the page is idle, warms up every
view (shaders, textures, buffers) behind the still, and fades in over it —
same composition, same camera, so nothing jumps. If the GPU goes away, the
still takes over where the scene was.

**Opening a place is an experience, not a panel.** The stage becomes the whole
screen below the site navigation; the page behind it is inert and doesn't
scroll. A slim bar sits at the top (back to the courtyard, where you are,
progress, tools) and the content sits in a dock at the foot, which scrolls on
its own only when it must (larger text, the teacher's corner). Leaving — the
button, Escape, or the browser's Back — puts the page back exactly as it was
and focus on the place's label. Zee's launcher steps aside while a place is
open. Phones get the same experience, with the replies stacked.

**The panels are the content.** The lessons and the booking live in HTML
panels built from `lessons.json` and the bundles; the scene is a way in, never
the only one. Every place is a real link (`learn.html#unit-1` …) in a
labelled list, so without JavaScript the courtyard is four links into the
course.

**Addresses.** `index.html#visit-cafe` (and `-entrance`, `-balcony`,
`-teacher`) opens a place directly, and the browser's Back button returns to
the courtyard. The hero's *Try a Free Mini-Lesson* opens the café
encounter; its `href` still points at `#mini-lesson`, the three-phrase
lesson further down, for anyone without JavaScript.

### The café encounter

About a minute at the café table (`js/courtyard/cafe-story.js`), one turn at
a time, with the courtyard answering each choice:

| Turn | The waiter / the scene | Your replies |
|---|---|---|
| arrive | the table, the waiter by the door | *Take a seat* — the camera sits you down; your chair fades as you sit in it |
| order | walks over, hand on heart: *ahla w sahla, shu bt7eb?*; you pick up the menu | *baddi 2ahwe wasat* · *2ahwe 3al ri7a* · *baddi 2ahwe sada* — you hand him the menu, he writes on his pad and leaves the slip by your hand (the ticket shows it) |
| thanks | brings the coffee on a tray, a hand towards it: *tfaddal… sa77tein* | *shukran* · *Allah ykhallik* · ~~*b khatrak*~~ |
| more | an open hand: *shi tene?* | *baddi man2ushe za3tar* (he brings one, still warm) · *kifeye* (a nod) |
| bill | your cup is empty | *el 7seb law sama7t* · *2addesh sar* · ~~*tikram 3ainak*~~ — he brings the bill on a saucer and takes the slip |
| bye | your money appears on the saucer | *b khatrak* · ~~*mar7aba*~~ — he waves you off |

Struck-through replies are real phrases in the wrong moment; choosing one says
what it actually means and why it doesn't fit, and the reply stays visible but
spent. The finish lists the phrases you used, a phrase to keep, Unit 2's
progress, and the way on: the unit, again, or a class.

Every Lebanese line comes from `lessons.json` (Unit 2's dialogue and phrases;
four phrases from Units 1 and 3) except one: *baddi 2ahwe sada, min fadlak*,
composed from Unit 2's own words for the no-sugar order (`AUTHORED` in
`cafe-story.js`). It needs a native speaker's check, and it doesn't count
towards any phrase's progress.

**State.** The turns are an explicit list; `phase` is `ready` (choices up),
`busy` (the scene is answering) or `done`. Every asynchronous step runs under
a token, so leaving, starting again or a presentation handover can never be
advanced by a stale callback; a second tap mid-answer does nothing; the waiter
never queues (an event in progress lands before the next starts). A language
switch re-renders the same moment, focus included. When the 3D scene takes
over from the still mid-conversation, `sync()` rebuilds the table from the log
of events played. *Transcript* and *Hint* open a drawer (Escape closes it
first); *Start again* resets the table.

**The waiter** (`scene/story.js`) is modelled in code like everything else:
he walks from the house door, turns to face where he's going, and serves with
one arm solved by two-bone IK, bowing to reach across the table — the slip,
the tray with the rakweh and cup, the manoushe, the bill. His other arm holds
his order pad while he writes. Each object is its own, placed where his hand
puts it. He speaks with gestures (hand on heart, an open hand, a hand towards
the coffee, a nod) that never interrupt what he's doing; between events he
breathes, shifts his weight and turns his head to you, unless motion is
paused. Seated, the camera frames him from the chest down, his hands doing
the work. What *you* do — pick up the menu, finish the coffee, leave the
money — moves only your things, so it never waits for him.

**Without 3D.** The same story plays over frames rendered from the scene
(`storyboard.js`): the approach, your seat, and each thing that arrives on a
transparent layer drawn against the courtyard's depth, so the table still
hides the waiter's legs. About 600 KB for both framings, fetched only when
the café opens without the 3D scene. Re-render them with **Render café
storyboard** in the preview harness whenever the table or the seat cameras
change.

**Progress.** A right reply records its phrase with
`progress.recordAnswer('courtyard-cafe', id, firstTry)`, and the finish
records `recordSession('courtyard-cafe', right, total)` — the same store and
rules as the mini-lesson, under its own id.

### Audio in the courtyard

Lines in the courtyard play the teacher's **recording or nothing**
(`playPhrase(item, null, { tts: false })`). They sit in the teacher's corner
and inside "your first conversation", where a synthetic voice would pass for
hers — and would read Lebanese as Modern Standard Arabic. `listen.js` checks
once whether the file named in `lessons.json` exists: if it does, the line
gets Listen / Stop / Listen again; if not, the Arabic, transliteration and
meaning are the experience, and the panel says so plainly.

Dialogue lines don't name audio files in `lessons.json`; the encounter's
are named in `js/courtyard/audio-manifest.js`, and
`public/audio/RECORDING-SCRIPT.md` lists every line still to record, in order,
with its path. Until a file exists, its line carries a small "Text only" mark.
When it does, the waiter's lines play as he says them and every line gets a
Listen button. One line plays at a time; leaving stops it.

**Sound** in the encounter's bar opens two settings: *Voices* — recorded
lines play as they're said, or, until recordings exist, a plain note that the
lines are text only — and *Café ambience (synthesised)*: room tone and the odd
cup on a saucer, made in the browser with Web Audio (`ambience.js`), off
until turned on, dipping under any recorded line, never a voice.

The rest of the site keeps its existing behaviour (recording, else the
browser's voice with a "synthetic voice" notice) — except the About section's
spoken introduction, which now also plays only the real recording, for the
same reason.

### Camera motion

`scene/rig.js` moves eight numbers together — position, look-at target, field
of view, and a vertical frame shift — along quintic Hermite curves that start
from the camera's current velocity *and* acceleration and end at rest. From
rest that is smootherstep: gentle in, gentle out, no linear section. Mid-move,
a new destination bends the path instead of jerking it, and nothing queues.
Time comes from the frame delta, so a move is identical at 30, 60 or 144 fps
(checked: same peak speed and acceleration at all three; a retarget changes
velocity by under 0.01 m/s). Moves take 0.95–1.6 s by distance — about a
second across the courtyard. Between two close-ups the path bows gently back
towards the open middle; every straight path between views is clear of the
pergola, the tree and the table.

Idle motion is small: leaves and the linen on the balcony sway in the shader
(their shadows move with them), steam rises from the cups only once you sit
down, and with a mouse the view parallaxes a few centimetres with the pointer.
**Pause motion** (top corner of the scene) stops all of it and is remembered on
the device (`hkeeli.courtyard.motion`). With *reduce motion* set in the OS
there is no idle motion, and the camera cuts to a place instead of flying.

### Performance

Three tiers (`scene/quality.js`), chosen from the device and the GPU's name,
then corrected by measurement: the frame loop watches real frame times and
lowers the drawing resolution (to 0.8× at the lowest) if frames are being
dropped — never during a camera move. While the camera moves, the shadow map
holds still, which makes the frames that must not drop the cheapest ones. The
loop stops when the scene is scrolled out of view or the tab is hidden.

The café encounter, measured end to end in headless Chrome on this
development machine's GPU (ANGLE/D3D11): 1366 × 900, high tier — p50 16.7 ms,
p95 16.9 ms (vsync-bound), about 170 draw calls; 390 × 844 and 360 × 800 at
2× device pixels, medium tier at 0.8× resolution — the same. Under SwiftShader
(software) warm-up measured ~500 ms a frame, so that browser keeps the still
view and the storyboard. Real phones have not been measured.

Measured earlier on an Intel UHD integrated GPU — the weak end of desktop hardware —
with the GPU forced to finish every frame, so slightly pessimistic: medium
tier, 650 × 720 CSS px at 1×, camera moves 11–13 ms a frame and the idle
overview ~16.5 ms; at 1.25×, 14–20 ms. About 110 draw calls on the high tier,
60 on medium. Faster GPUs get the high tier (resolution up to 2×, 2048
shadows, and the lamp and room lights).

### Regenerating the still images

The stills have to match the scene's opening cameras, so they are rendered
from it:

```bash
node tools/courtyard-stills.mjs
```

Open <http://localhost:4323/tools/courtyard-preview.html> and press **Render
stills**. It renders both framings at 2× and downsamples, saves
`assets/images/courtyard/courtyard-{wide,tall}.webp` through that local
server, and prints where each label and close-up sits on the images — paste
those into `POSTER` in `js/courtyard/places.js`. Do this whenever the scene or
the overview cameras change. The harness also has a button per view and a
frame-time readout. On the site, `index.html?courtyard-debug` exposes the live
scene as `window.__hkeeliCourtyard`, and `?courtyard=still` / `?courtyard=3d`
force either presentation.

### Two framings

`wide` (the desktop column, composed at 0.93) and `tall` (phones, composed at
0.5) are separate compositions, not one picture cropped. `framingQuery` in
`places.js` is the one media query both presentations and the `<picture>`
element use, so they always agree. Each is composed at the narrowest shape it
is shown at and drawn with `object-fit: cover`, so a wider stage only loses sky
and paving, never a place. With a place open, the dock covers the lower part of
the screen, so every place view (and the still's zoom) frames its subject above
it.

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

## The practice page and the play stage

`practice.html` is a hub, and **nothing is played inside it.** It offers three
ways in, in the order it recommends them:

1. **Scenes** — one situation, played start to finish (see [Scenes](#scenes)).
2. **Daily Practice** — a short mix across the whole course.
3. **Drills** — the seven games, grouped by the skill they train.

The hero carries one button that starts the next scene you haven't played, by
name ("Start with The Café"). On a phone the scene cards sit two screens down,
and the page's whole job is getting someone to try it — so the first action is
above the fold, and the explanation follows it.

Choosing anything opens the **play stage** (`js/stage.js`): a full-viewport
layer over the hub with a slim top bar (close, progress, streak, sound), a
scrolling stage, and the [verdict bar](#the-verdict-bar) pinned to the bottom.
It replaced games that mounted as a card in the middle of the scrolling page,
which kept the scene picker above you and Daily Practice and seven game tiles
below you while you played — the opposite of what committing to a situation
should feel like.

What the stage owns:

- **The page behind it.** Everything outside the stage is `inert` while it is
  open — no focus, no clicks, nothing announced — and page scroll is locked.
  Zee's launcher is hidden: a floating button would sit on the verdict bar.
- **The way out.** The ×, Escape, and the browser's **Back** button all close it
  — the last because on a phone, Back is how people leave things. Opening the
  stage from the hub pushes a history entry; arriving on a deep link opens it
  without one, so Back from there behaves as expected too.
- **Where focus goes after.** Closing returns focus to the control you started
  from. The hub re-renders as the stage closes (so the card you played already
  shows its new score), which replaces the original button — so
  `returnFocus()` in `js/practice.js` finds its equivalent on the fresh hub.
- **Two themes.** Scenes play on the deep sea (`data-theme="dark"`), drills and
  Daily Practice on sand. **Colour inside the stage is never inherited from a
  wrapper**: the stage sets its own `--stage-*` properties, and every surface
  inside it — an option, a tile, a card, a bubble — sets its own background
  *and* its own text colour. Option text once rendered sand-on-sand because a
  dark wrapper's `color` leaked into a light card; this structure makes that
  class of bug impossible rather than fixed once.

### URLs

| Hash | What it opens |
|---|---|
| *(none)*, `#scenes`, `#daily`, `#drills` | the hub (the last three are section anchors) |
| `#scene-cafe`, `#scene-teta` | that scene |
| `#daily-session` | Daily Practice |
| `#listen`, `#match`, `#blank`, `#build`, `#order`, `#reply`, `#cards` | that drill |

`#daily` used to mean "the hub, scrolled to Daily Practice" and was written into
the URL on every visit, so it stays the hub — an old bookmark never starts a
session unasked. `?unit=` still scopes Daily Practice and the drills; scenes
ignore it.

### The verdict bar

The verdict and the button that acts on it are one element, pinned to the
bottom of the screen, on both themes. Idle, it holds whatever the game needs
(Check, Show answer). Answered, it turns green or red, says what happened —
the answer in all three scripts — and offers the way forward. It used to be a
banner at the *top* of the board, four hundred pixels from the option you had
just tapped and off-screen on a phone.

It opens and closes on its own: a `MutationObserver` watches the action row,
so a game that reveals its Next button with `button.hidden = false` opens the
bar without knowing it exists, and tap-to-answer games have no bar at all
until there is something to say. It animates its real height
(`grid-template-rows: 0fr → 1fr`).

Its buttons size to their labels and the row **wraps by row, not by text**: on
a phone "Play it again" and "Next: Teta on the Phone" stack, each one line tall,
with the primary on the bottom row nearest the thumb. A zero flex-basis
(`flex: 1 1 0`) here once crushed both labels onto three lines each.

---

## Scenes

A scene is **not an eighth game.** It is the seven that already exist, scoped to
one unit and framed as one situation — with a start, a cast, and an ending that
is the conversation you just had.

Daily Practice already chained real games together, but it drew from the whole
course — step three asked about coffee and step four about your grandmother,
five sealed boxes in a row — and its steps were named by skill, which says which
muscle is being trained, not where you are. What makes a scene a scene:

1. **One unit, start to finish**, so step four follows from step three.
2. **A cast.** The other person has a name ("Waiter", "Teta") and a face in every
   bubble, and the learner is always "You".
3. **An arc.** An intro that sets the scene, names the cast and shows the six
   steps; a beat of narration at the top of each step ("He says something.
   Catch it."); and at the end, the dialogue written out as the conversation you
   held — every line playable, your lines in gold.
4. **Somewhere to go next.** The end of a scene offers the next scene you
   haven't played, by name. Once every scene has been played, it offers the one
   thing a website can't do: a lesson with a person. (The hero button and the
   "Start here" badge point at the *first* scene you haven't played; this
   button at the next unplayed one *after* the scene you just finished.)

Adding a scene is a data edit — one entry in `SCENES` (`js/scenes.js`) plus the
`scene.<id>.*` strings in **both** language bundles. No new game code, ever:

```js
{ id: 'cafe', unitId: 'unit-2', you: 'B', icon: 'cup', steps: ARC('cafe') }
```

- `unitId` is the whole scoping mechanism.
- `you` says which dialogue speaker is the learner. It differs per scene — in the
  café someone serves you; on the phone you are the one who called — and three
  things depend on it: the transcript marks the right side as "You", **What Do
  You Reply?** only asks for the learner's own lines, and **Sentence Builder**
  only builds the learner's own dialogue lines. (Without that filter, half the
  questions in a four-line dialogue asked the learner to say the waiter's lines.)
- `icon` names an icon in `js/icons.js`, not an emoji.
- `ARC(id)` is the shared six-step shape — meet the words, learn the one that
  matters, hear it, answer it, say it, then do the whole thing. A learner on
  their second scene should recognise the shape, not learn a new one.

A scene whose `unitId` isn't in `lessons.json` is simply not offered. Scenes keep
**all** units in `shell.units`, because What Do You Reply? draws its wrong
answers from *other* units.

---

## Daily Practice

Both Daily Practice and scenes run on `StepSession` (`js/session.js`), the one
implementation of "run some games in order and keep score". It **duplicates no
game logic**: each step mounts a real game in a `StepShell`, a subclass of
`GameShell` with no heading of its own (the step header replaces it) whose
`finish()` hands straight back to the session. There is no "step complete"
screen between steps — the last answer's verdict bar already said how it went,
and an interstitial would cost a tap per step to say nothing the progress bar
doesn't.

In the stage, a session splits the progress bar into one segment per step, and
the current segment fills as its questions are answered. The streak belongs to
the stage, so a run of right answers carries from one step into the next.

`js/daily.js` is only configuration. `SceneSession` subclasses the same engine
and overrides `intro()`, `summary()` and `summaryActions()`; none of
`StepSession`'s methods are `#private`, precisely so they can be.

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

---

## Practice games

They all read from the same phrase bank, so content added to `lessons.json`
flows into every game automatically.

| Game | What it does |
|---|---|
| **Listen & Choose** | A big play button that ripples while it speaks; one tap on one of four English meanings answers. |
| **Match the Phrase** | Five Lebanese vs five English; tap one then the other. A right pair flashes and steps back; only a wrong pair raises the verdict bar. |
| **Fill the Blank** | Type the missing word, or switch to multiple choice; lenient checking. |
| **Sentence Builder** | The English and the audio; word tiles that travel from the bank onto the sentence line and back. |
| **Order the Conversation** | A unit's dialogue as cards; each one tapped flies up into a chat thread on its speaker's side. |
| **What Do You Reply?** | A line arrives as a bubble; the reply you pick flies up into the thread as your answer. |
| **Daily Flashcards** | Flip Lebanese ↔ English, then "Got it" / "Still learning". |

### Scoping practice to one unit

`practice.html?unit=unit-2` narrows Daily Practice and every drill to that
unit's phrases, and the Lessons page's "Practice these words" button links this
way. The unit dropdown on the practice page writes the same parameter, so any
drill can be bookmarked or shared. Without the parameter, games draw from the
whole course.

Note the local dev server needs `serve.json` (`"cleanUrls": false`) — otherwise
`serve` redirects `/practice.html?unit=…` to `/practice` and **drops the query
string**, silently unscoping the drill. Vercel with our `vercel.json` does not
rewrite URLs, so production is unaffected.

Order the Conversation, What Do You Reply? and Sentence Builder read whole
units rather than loose phrases (they need the `dialogue` arrays), which is what
`GameShell`'s `context` argument carries. The first two deliberately do **not**
call `shell.record()`: dialogue lines aren't phrases, and writing their ids into
the spaced-repetition store would schedule reviews for cards no flashcard will
ever show. They call `shell.addScore()` instead, so the round still scores.

Sentence Builder is the mixed case: it draws on both phrases and dialogue lines
(anything three words or longer, skipping transliterations that carry a `/`,
which is an editorial "or" rather than a word). Only the phrase items go through
`shell.record()`. Its prompt shows the English and the audio and *not* the
transliteration — otherwise the answer would be sitting there to copy.

What Do You Reply? draws its three wrong answers from *other* units. Lines from
the same conversation are the tempting distractor, but with four lines per
dialogue several could genuinely follow, and an ambiguous question teaches
nothing. If the course is ever down to one unit with dialogue, it falls back to
the whole bank.

Match uses **tap-to-pair rather than drag-and-drop** on purpose: it behaves
identically with a finger and a mouse and stays keyboard-reachable, where drag
would be a pointer-only path.

**Dialogue lines are compared by object identity, not by `id`.** Lines in
`lessons.json` carry no `id`, so `line.id === correctOrder[slot].id` was
comparing `undefined` with `undefined` — which is `true`. Order the Conversation
scored a perfect round whatever order you placed the lines in, and What Do You
Reply? marked all four options correct. Both now compare the objects themselves
(Order the Conversation wraps each line in a per-round token, and compares
those). Don't "fix" this back to an id comparison without giving every dialogue
line a unique id first.

**Keyboard:** in the multiple-choice games, `A`–`D` (or `1`–`4`) pick an answer
and `Enter` advances. `js/games/keyboard.js` stands down whenever a text field
has focus, so typing in Fill the Blank is never intercepted.

**Flashcards deliberately show no streak.** The other games have right and wrong
answers, so a streak means something. Flashcards are self-graded: rewarding
"Got it" would reward exactly the judgement the spaced-repetition scheduler
depends on being honest. A game opts out with `hudMode: 'review'`; the stage
then hides its streak, and the summary counts what you knew and what's coming
back instead of a score.

Round length, option count, pair count and SRS intervals are all in
`CONFIG.games`.

### Motion

- **Questions hand over.** `shell.transitionTo(render)` runs the old board out
  and the new one in (`js/motion.js`), and the new board's children stagger in.
  The stagger is keyed off `data-entering`, set only for the length of the
  hand-off: every other render — a tile placed, a card flipped — is instant,
  because an entrance that replayed on every tap made the whole board blink.
- **Things you tap travel.** `flip(root, mutate)` in `js/motion.js` is FLIP
  (First, Last, Invert, Play): it measures every element carrying `data-flip`,
  lets the game re-render the board from state, then animates each element from
  where it was to where it is now. A brand-new element can name its origin with
  `data-flip-from` — that's how the reply you picked flies out of the option
  list into the chat. Games keep their simple render-everything-from-state model
  and get motion for free.
- **A right answer is an event**: a "+1" flies from the answer to the streak,
  the streak lights up, and a tone plays.

Three rules that are easy to break:

1. **Read `shell.transitioning` before moving an index.** For the first half of a
   hand-off the *outgoing* board is still live. `pointer-events` stops a second
   tap, but a programmatic activation — Enter on the focused Next button,
   assistive tech — still reaches the handler. Every `advance()` starts with
   `if (shell.transitioning) return;`, **before** `index += 1`.
2. **Every animation must end, with or without its timeline.** A backgrounded
   tab pauses the document timeline, so an animation started just before the
   learner switched away fires neither `finish` nor `cancel` — and a paused
   entrance keeps painting its first frame, opacity 0. `run()` in
   `js/motion.js` races a timer against both events and calls `finish()` when
   it fires, so callers sequenced behind it always proceed and content is never
   left invisible.
3. **FLIP keys are unique per question**, not just per tile (`w-<question>-<i>`),
   so a tile can never match a tile from the previous sentence mid-hand-off.

### Mixed scripts in one line

The verdict bar's detail often holds a phrase in all three scripts
("بدي قهوة وسط — baddi 2ahwe wasat — I want a medium-sweet coffee") and sometimes
translated copy ("0 of 4 lines in the right place"). One plain string can't do
both: forced LTR scrambles the reading order on the Arabic page, and left to the
page's direction an English sentence ending in "?" renders as "?How's your
health" there.

So `phraseLine(line, options)` in `js/games/chat.js` returns each script as its
own `<bdi>` with its own `dir`, and lets the *sequence* follow the page;
`latin(text)` does the same for a transliteration quoted inside translated copy
("The answer was “law”"). `shell.showFeedback()` accepts either a string or
those nodes. `.verdict-detail` is deliberately **not** in the isolation list at
the top of `css/base.css`, because it can hold translated copy — but any new
element that holds *only* a phrase's English must join that list
(`.chat-en` and `.say-this-en` did).

### Contrast

The brand olive is 3.4:1 on sand — under the 4.5:1 that small text needs — and
it is the colour of every transliteration on the site, the line a learner who
can't read Arabic reads first. `--olive-ink` is the same hue, deeper, used for
olive *text*; fills and borders keep `--olive`. `--ok-ink` and `--bad-ink` do the
same for text on the green and red tints, and the "Got it" button sits on
`--ok-ink` because white on the brand green is 3.9:1.

Every screen of both scenes, Daily Practice and all seven drills was audited
against WCAG AA (4.5:1 for small text, 3:1 for large) in both languages and at
phone width, after their animations had settled.

### Icons

`js/icons.js` is one small stroke set — 24×24, 2px round strokes,
`currentColor` — drawn for this site. The games used to carry emoji, which
render differently on every platform and can't take the brand colours. A game
module names its icon (`icon: 'headphones'`), and icons are decorative
(`aria-hidden`) unless given a `label`.

### Sound

`js/sfx.js` synthesises four short tones with WebAudio rather than shipping
files (four assets to host and 404-handle is a poor trade for four sine waves).
Every tone ramps its gain in and out: a square edge on a 100ms tone is audible
as a tick and sounds cheap.

Sound is **on by default** — the site already plays pronunciation unprompted, so
a feedback tone is not a surprise — and the speaker button in the stage's top
bar toggles it, remembered per device under `hkeeli.sound.v1`. Games play cues
through `shell.cue('place')`; right and wrong answers are automatic.

### The booking bridge

`js/cta.js` renders a card at the end of a standalone drill, of Daily Practice,
and of a scene. It was the missing step: every route to the teacher lived in the
nav or the footer, so the highest-intent moment in the product — someone who
has just proved to themselves they can learn this — was answered with "play
again".

Three rules it follows, which are the reason it can be there at all:

- **It states what just happened, accurately.** The copy is chosen from the
  actual round (`band()`), so a bad round never gets told it went well.
- **It names the limit of the thing they just used.** Recognising a phrase is
  not saying it to a person. That is true, it is the reason a teacher exists,
  and saying it plainly beats any adjective.
- **It never blocks.** No modal, no interstitial; the way forward in the footer
  stays the primary action.

Once every other scene has been played, the footer's main button at the end of
a scene *is* the booking link, so the card is rendered with `withCta: false`
rather than showing the same button twice. It states no price, duration or availability — `js/booking.js`
has the same rule and the same reason.

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

- The hero is the courtyard: copy first, then the stage at full height, and a
  place opens as a sheet over the stage's lower half (see "The courtyard").
- Nav links move into a drawer below 860px — including the Book a Class link,
  so nothing is lost. The four items are Lessons, Practice, About and Book a
  Class; the two that are home-page sections are marked current only while their
  hash is the target. Start Here is deliberately *not* in the primary nav — see
  "Start Here" above.
- Every game is tap-first and plays full-screen in the play stage, with the
  verdict and the next action pinned to the bottom of the screen, within thumb
  reach. The practice hub's first action — start a scene — is above the fold.
- Hover lifts are wrapped in `@media (hover: hover)` so touch devices get press
  states instead, and all motion respects `prefers-reduced-motion`.

---

## Zee — the AI Lebanese instructor

Zee is the chat launcher in the corner of every page. She answers in Lebanese,
explains words using Hkeeli's own glossary, and points learners at real pages of
the site. She is the only part of Hkeeli with a server behind it.

```
browser  ──POST /api/zee/chat──>  Cloudflare Worker  ──>  Azure OpenAI
                                        │                     │
   validated request, capped   <────────┘   <─── streamed SSE ─┘
   history, no secrets                       relayed as it arrives
```

**The Azure key never leaves the Worker.** The browser posts a message to
`/api/zee/chat` and receives a stream of text; it has no endpoint, no deployment
name and no key, and nothing it sends can change any of them.

### Files

```
worker/
  index.js              Worker entry: /api/zee/chat, everything else -> assets
  zee/chat.js           the endpoint — validation, Azure call, SSE relay
  zee/context.js        glossary + site lookup, prompt assembly
  zee/config.js         every limit, in one object
  zee/ratelimit.js      per-IP throttling (KV if bound, memory otherwise)

data/zee/
  lebanese-lexicon.json  canonical Lebanese reference (seeded from lessons.json)
  site-context.json      the only pages Zee may link to
  zee-instructions.txt   Zee's system prompt, in prose

js/
  zee-chat.js           the launcher (loaded on every page, ~2 KB)
  zee-panel.js          the chat UI (fetched on first open, never before)
  zee-analytics.js      one function, so a provider can be added later

css/zee-chat.css        all of Zee's styling, on the site's own tokens
```

`worker/` and `data/zee/` are in `.assetsignore`: the Worker imports them at
build time, so they ship inside the script. Serving them as public files as well
would put the system prompt one guessed URL away from anyone.

### Cloudflare configuration

One secret has to exist before Zee will answer:

```bash
npx wrangler secret put AZURE_OPENAI_API_KEY
# paste the key from the Azure Foundry deployment page when prompted
```

The other two values are not secret and live in `wrangler.jsonc` under `vars`:

| Name | Value | Where |
|---|---|---|
| `AZURE_OPENAI_API_KEY` | the key | **secret** — `wrangler secret put`, never in Git |
| `AZURE_OPENAI_ENDPOINT` | `https://ali-ne.services.ai.azure.com/openai/v1` | `vars` in wrangler.jsonc |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-5.4-nano` | `vars` in wrangler.jsonc |

Optional, and recommended once Zee gets real traffic — a KV namespace makes the
rate limits count across every colo instead of per isolate:

```bash
npx wrangler kv namespace create ZEE_KV
# then add the returned id to wrangler.jsonc:
#   "kv_namespaces": [{ "binding": "ZEE_KV", "id": "…" }]
```

Without it Zee still deploys and still throttles, just more loosely — see the
comment at the top of `worker/zee/ratelimit.js`.

**Which Azure API.** The deployment page shows the endpoint as
`…/openai/v1/responses`, but the Responses API is not enabled in this resource's
region (it answers `NotFound: Azure OpenAI Responses API is not enabled in this
region`). Zee therefore calls Chat Completions on the same v1 surface, and
`azureUrl()` in `worker/zee/chat.js` normalises either form of the value. If the
Responses API is enabled there later, nothing has to change.

### Running it locally

`npx serve .` serves the pages but has no Worker, so Zee's launcher opens and
then every message gets "Zee is offline for a moment." (It used to get
nothing: the panel parsed the static server's 404 page as an empty stream and
showed neither an answer nor an error. It now only reads an actual
`text/event-stream`, and treats anything else as offline.) To work on Zee:

```bash
npx wrangler dev
```

and put the key in a **git-ignored** `.dev.vars` beside `wrangler.jsonc`:

```
AZURE_OPENAI_API_KEY = "…"
```

> Wrangler writes its own state into `.wrangler/` inside the asset directory,
> which its file watcher then notices — on some machines that becomes a reload
> loop and the dev server stops answering. `.wrangler/` is in `.gitignore` and
> `.assetsignore`; if the loop still happens, run `wrangler dev` from a copy of
> the repo outside a syncing folder (OneDrive, Dropbox).

### Limits

All of them are in `worker/zee/config.js`, all enforced server-side:

| Limit | Default | Why |
|---|---|---|
| message length | 1000 chars | rejected, not truncated |
| history sent to Azure | last 8 turns | a long session never grows the prompt |
| request body | 24 KB | |
| output | 400 tokens | includes any reasoning tokens |
| per IP | 5 / minute | stops a burst |
| per IP | 50 / day | stops a slow drip |
| glossary entries per turn | 6 | beyond this it's a dictionary dump |

The client has its own copies for the character counter and the disabled send
button. They are courtesy; the Worker never trusts them.

### How a turn is built

Only what is relevant goes to Azure. A typical turn is a system message, the
recent history, a small context block and the learner's message:

1. **system** — `data/zee/zee-instructions.txt`, verbatim.
2. **history** — the last 8 turns, rebuilt from scratch so only `user` and
   `assistant` roles survive. A client cannot smuggle in a `system` turn.
3. **developer** — the compact page index, the site facts, the glossary entries
   whose words appear in *this* message, and which page the learner is on.
4. **user** — the message.
5. **developer** — a short style reminder. It is repeated every turn and sits
   last on purpose: a small model drifts away from a long system prompt within a
   couple of turns and starts mixing Latin and Arabic script mid-sentence.

The glossary lookup normalises the Arabic chat alphabet the same way the
practice games normalise typed answers, so `mar7aba`, `marhaba` and `marhabaa`
all find the same entry. When an entry exists, **its** spelling and meaning are
what Zee is told to use — Hkeeli's vocabulary is the canonical source, not the
model's recollection.

### Navigation actions

Zee cannot write a link. She ends a reply with a marker — `<<nav:start>>` — and
the Worker strips it from the text, looks the id up in `site-context.json`, and
sends the client a separate `action` event with the real URL. An id that isn't
in the file produces no button at all. That is what makes it impossible for a
hallucinated or injected URL to become something a learner clicks.

To add a destination, add a page to `data/zee/site-context.json` with an `id`,
`title`, `url` and `purpose`. **Check the anchor exists first** — nothing
validates that the URL resolves.

### Adding vocabulary

`data/zee/lebanese-lexicon.json` was seeded from `data/lessons.json`; entries
carrying a `phraseId` came from there and should stay in step with it. Entries
without one were added by hand for words learners type constantly (`shu`, `wen`,
`baddi`, `khalas`, `merci`). To add one:

```json
{
  "canonical": "ma3le",
  "arabic": "معلش",
  "meaning": "never mind / it's fine",
  "variants": ["ma3lesh", "maalesh"],
  "synonyms": [],
  "notes": "Softens a refusal or an apology.",
  "category": "everyday"
}
```

`variants` matter more than they look — they are what a learner's own spelling
gets matched against.

### Analytics

`trackZeeEvent(name)` still fires `zee:event` for anything already listening to
it, and now also routes through the site-wide seam in `js/analytics.js` — so one
provider hookup covers the chat and the practice games alike. See
[Analytics](#analytics-1) below.

Zee's events: `zee_opened`, `zee_message_sent`, `zee_navigation_clicked`,
`zee_booking_clicked`, `zee_cleared`, `zee_expanded`. No message text, no
identifier, no page-by-page trail.

### What Zee will not do

- She never sees the key, the endpoint or the deployment name in anything the
  browser can read.
- Model output is placed with `textContent` only. A reply containing markup is
  shown as markup, never executed.
- Conversation lives in `sessionStorage` for the tab and is sent to Azure with
  `store: false`. There is no account, no database and no long-term memory.
- The learner's message is conversation, never instruction: attempts to override
  her role or extract the prompt are ignored, and the roles a client may send
  are filtered server-side.

---

## Analytics

There is still **no analytics provider on the site**, and adding one is a
decision about sending visitor data to a third party — not one a practice game
should make. So every notable interaction calls `track()` (`js/analytics.js`),
which fires a DOM event and does nothing else. Wiring a provider is one
listener, added once, anywhere:

```js
document.addEventListener('hkeeli:event', (e) =>
  plausible(e.detail.name, { props: e.detail.props }));
```

Until that listener exists the events are inert. The point is that the call
sites are already correct, so the day a provider is chosen the questions that
matter are answerable immediately rather than after another pass over the code:

| Event | Props |
|---|---|
| `game_round_started` / `game_round_completed` | `game`, `score`, `total` — standalone drills only |
| `session_started` / `session_step_completed` / `session_completed` | `session` (`daily` or `scene-<id>`), `step`, `score`, `total` |
| `booking_cta_shown` / `booking_cta_clicked` | `from` (`game` \| `daily` \| `scene` \| `scene-end`), `scene` |

A game played *inside* a session reports nothing of its own — the session
reports its start, each step and its finish — so a "rounds played" figure never
counts every scene step twice.

Plus Zee's own six, listed above. Event names and small integer counts only —
no message text, no phrase anyone got wrong, no identifier, no page-by-page
trail.

**Nothing currently measures whether any of this works.** Until a provider is
listening, how many people start a scene, finish one, or go on to the booking
page are all unknown — which makes every further change to the practice section
a guess. A privacy-friendly, cookie-banner-free provider (Plausible, Umami) is
one script tag and matters most for the EU traffic the site is aimed at.

## Deploying

There is nothing to build. Point any static host at the repository root.

Zee needs one extra step the static pages don't: the Azure key has to exist as a
Worker secret (`npx wrangler secret put AZURE_OPENAI_API_KEY`). Without it the
pages all work and Zee answers "Zee is offline for a moment."

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
page says so in neutral wording instead of guessing — these are the gaps.

**Two of them cap the quality of everything else, and neither is a code
change:**

- **The recordings.** There are zero mp3s today, so every play button falls
  through to speech synthesis — which reads Arabic script as *Modern Standard
  Arabic*. `قهوة على الريحة` comes out "qahwa 3ala al-riiha", not *ahwe 3al
  riha*. Listen & Choose, the flagship listening game, is currently teaching
  the wrong pronunciation, and the site says so to the visitor in a toast. A
  Lebanese dialect course where you never hear a Lebanese voice is not a
  Lebanese course. ~50 clips covers units 1–3.
- **The content pool.** 36 phrases, 12 dialogue lines, 3 units — and seven
  games plus two scenes all drawing from it. One round of "What Do You Reply?"
  is 8 of the 9 questions that exist; Order the Conversation has 3 playable
  dialogues and a round length of 3, so one round is the whole game. The SRS
  scheduler is sound, but it is scheduling a deck that can be memorised in a
  sitting. No amount of motion fixes that.

The rest:

| Gap | Where to fill it |
|---|---|
| **Class length, price, trial-class policy** | `classes.facts` in `data/en.json` + `data/ar.json`. Any row whose `value` is the literal string `"tbc"` renders as "Ask when you book — this isn't set in stone yet." Replace the value and the italic note disappears. |
| **Real recordings** | Drop mp3s at the paths already named in `lessons.json`; everything falls back to speech synthesis until then. Add `audioSlow` per phrase to unlock the slow-audio control. The courtyard and the About introduction never use the synthetic voice: their lines become playable as their files land. Dialogue lines need an `audio` path added to be playable in the café. |
| **Arabic review of the courtyard copy** | The `courtyard.*` strings in `data/ar.json` were written for this build and need a native speaker's read. No Lebanese lesson content was added: every line a visitor learns in the courtyard comes from `lessons.json`. |
| **Testimonials** | `about.testimonials` is an empty array on purpose — see above. |
| **Teacher's real name / photo / credentials** | Not published anywhere, and no `Person` structured data exists. If they are ever added, add them to `data/*.json` and the JSON-LD together. |
| **Booking address** | `CONFIG.bookingEmail` still points at `hello@hkeeli.example`. |
| **Zee's Azure key** | Must be set as a Worker secret before Zee can answer — see [Zee](#zee--the-ai-lebanese-instructor). |
| **A real booking backend** | Set `CONFIG.formEndpoint`; the form POSTs JSON instead of composing an email. |
| **Units 4–12** | Not in `lessons.json` yet; units 1–3 are complete. Stages 4 and 5 of the journey show as "being written" until units declare those `stage` ids. Each new unit with a dialogue is also a candidate scene — see [Scenes](#scenes). |
| **An analytics provider** | One listener on `hkeeli:event` — see [Analytics](#analytics-1). Without it, nothing measures whether the practice section leads anyone to book. |
| **Domain** | `https://hkeeli.com` is hardcoded in the four pages, `robots.txt` and `sitemap.xml` — see [Domain](#domain). |

The claims in `about.tag2` / `about.tag3` ("8+ years of teaching", "students in
14 countries") predate this build and were left as they were found. If they
can't be substantiated, they are the first thing to cut.
