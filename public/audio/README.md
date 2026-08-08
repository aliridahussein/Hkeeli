# Audio

Recordings live here, one folder per unit:

```
public/audio/lessons/unit-1/marhaba.mp3
public/audio/lessons/unit-2/ahwe-3al-riha.mp3
```

The path stored on each phrase in `data/lessons.json` is **relative to
`CONFIG.audioBase`** (`js/config.js`), which is `public/audio/` by default:

```json
{ "id": "u1-p1", "ar": "مرحبا", "audio": "lessons/unit-1/marhaba.mp3" }
```

## TODO — real recordings

No files are committed yet. Until an `.mp3` exists at the referenced path,
`js/audio.js` falls back to the browser's speech synthesis in an Arabic voice
and shows a one-time "synthetic voice" notice. Dropping the real file in at the
path already named in `lessons.json` is all that's needed — no code change, no
data change.

Recording notes:

- Mono, 44.1 kHz, MP3 ~96–128 kbps is plenty for single words and short phrases.
- Trim leading/trailing silence; learners tap these buttons repeatedly.
- Name files after the transliteration, lowercase, hyphens instead of spaces,
  digits from the chat alphabet spelled out where awkward (`3al` → `3al` is fine,
  but avoid characters that need URL-escaping).

## Moving to hosted audio later

Change one line in `js/config.js`:

```js
audioBase: 'https://cdn.example.com/hkeeli/audio/'
```

Every phrase path resolves against the new base. Absolute URLs in a phrase's
`audio` field are used as-is, so a partial migration also works.
