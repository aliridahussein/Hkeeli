# Recording script: the café encounter

These are the lines the courtyard's café conversation uses (`js/courtyard/cafe-story.js`), in the order a visitor hears them. None is recorded yet. Until a file exists at its path, that line shows a small "Text only" mark. Nothing synthetic plays in its place. Once you save an mp3 at the path shown, the line plays the next time the page loads. No code or data change is needed.

Paths are relative to `public/audio/` (`CONFIG.audioBase`). Phrase paths come from `data/lessons.json`. Dialogue and encounter paths come from `js/courtyard/audio-manifest.js`. Keep this file in step with that one.

Recording notes are the same as in `README.md` in this folder:

- mono, 44.1 kHz
- MP3 at about 96–128 kbps
- silence trimmed at both ends

Read each line the way it would be said across a café table: warm and unhurried.

## The waiter

| # | Lebanese | Transliteration | Meaning | File |
|---|---|---|---|---|
| 1 | أهلا وسهلا، شو بتحب؟ | ahla w sahla, shu bt7eb? | Welcome, what would you like? | `lessons/unit-2/dialogue/ahla-w-sahla-shu-bt7eb.mp3` |
| 2 | تفضّل | tfaddal | here you go | `lessons/unit-2/tfaddal.mp3` |
| 3 | صحتين | sa77tein | enjoy it / to your health | `lessons/unit-2/sahtein.mp3` |
| 4 | شي تاني؟ | shi tene? | Anything else? | `lessons/unit-2/dialogue/shi-tene.mp3` |

## The visitor's replies

| # | Lebanese | Transliteration | Meaning | File |
|---|---|---|---|---|
| 5 | بدي قهوة وسط، من فضلك. | baddi 2ahwe wasat, min fadlak. | I'd like a medium-sweet coffee, please. | `lessons/unit-2/dialogue/baddi-ahwe-wasat-min-fadlak.mp3` |
| 6 | قهوة عالريحة | 2ahwe 3al ri7a | coffee with barely any sugar | `lessons/unit-2/ahwe-3al-riha.mp3` |
| 7 | بدي قهوة سادة، من فضلك. ¹ | baddi 2ahwe sada, min fadlak. | I'd like a coffee with no sugar, please. | `lessons/unit-2/cafe/baddi-ahwe-sada-min-fadlak.mp3` |
| 8 | شكراً | shukran | thank you | `lessons/unit-1/shukran.mp3` |
| 9 | الله يخليك | Allah ykhallik | thank you / bless you | `lessons/unit-3/allah-ykhallik.mp3` |
| 10 | بدي منقوشة زعتر | baddi man2ushe za3tar | I want a zaatar manoushe | `lessons/unit-2/man2ushe-za3tar.mp3` |
| 11 | كفاية | kifeye | that's enough | `lessons/unit-2/kifeye.mp3` |
| 12 | الحساب لو سمحت | el 7seb law sama7t | the bill, please | `lessons/unit-2/el-hseb-law-samaht.mp3` |
| 13 | قديش صار؟ | 2addesh sar | how much is it? | `lessons/unit-2/addesh-sar.mp3` |
| 14 | بخاطرك | b khatrak | goodbye | `lessons/unit-1/b-khatrak.mp3` |

¹ This line was written for the encounter from Unit 2's own words. It is not in `lessons.json`. Please check it reads naturally before recording, and correct the text in `cafe-story.js` (`AUTHORED.sada`) if not.

## Wrong-answer choices

These are only heard if a visitor taps one to listen to it:

| # | Lebanese | Transliteration | Meaning | File |
|---|---|---|---|---|
| 15 | تكرم عينك | tikram 3ainak | you're welcome | `lessons/unit-1/tikram-3ainak.mp3` |
| 16 | مرحبا | mar7aba | hello | `lessons/unit-1/marhaba.mp3` |

## Also named in the manifest

This line is not used by the encounter yet. It completes Unit 2's dialogue:

| Lebanese | Transliteration | File |
|---|---|---|
| منقوشة زعتر كمان. والحساب لو سمحت. | man2ushe za3tar kamen. w el 7seb law sama7t. | `lessons/unit-2/dialogue/manoushe-kamen-w-el-hseb.mp3` |

## Who records

Lines 1–4 are the waiter: any native Lebanese voice works, and a second voice keeps the two parts distinct. Lines 5–16 are what the learner says, so they are best in the teacher's own voice, as the model to copy.
