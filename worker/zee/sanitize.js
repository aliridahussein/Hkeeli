/**
 * Zee — the script guard.
 *
 * The instructions tell Zee never to put Arabic script inside a sentence, and
 * she mostly obeys. Mostly is not good enough: gpt-5.4-nano drifts after a few
 * turns and emits things like
 *
 *   Shu بدك تدربي أول شي yala
 *
 * which is unreadable to the exact person this site exists for — someone who
 * does not read Arabic. A prompt cannot guarantee that never happens, so this
 * module makes it structurally impossible for such a line to reach the browser.
 *
 * The repair is transliteration, not deletion. Dropping the script would leave
 * "Shu  yala" — the meaning is IN the Arabic run, so removing it is worse than
 * the bug. Converting it to the Latin/internet spelling the whole site already
 * uses ("Shu baddak tdarrbe 2awwal shi yala") keeps the sentence intact and
 * readable, and matches how the phrases are written everywhere else.
 *
 * What is deliberately NOT touched: the middle line of a phrase block. A line
 * that is entirely Arabic is the taught script and must survive untouched —
 * that line is the whole point of the block.
 */

import lexicon from '../../data/zee/lebanese-lexicon.json';

const ARABIC_CHAR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const ARABIC_RUN = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿ً-ْ]+/g;
/** Harakat and friends — never transliterated, just dropped. */
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;

export function hasArabic(text) {
  return ARABIC_CHAR.test(text);
}

/* --------------------------------------------------------------------------
   Word-level knowledge, best first
   --------------------------------------------------------------------------
   Three tiers, tried in order. The first two are real spellings; the last is a
   mechanical fallback that is always a bit rough, because Arabic script omits
   the short vowels the Latin spelling needs. That roughness is acceptable for
   a word Zee should not have written in script in the first place — it is a
   safety net, not a translator.
   -------------------------------------------------------------------------- */

/** Tier 1: the site's own curated spellings. */
const FROM_LEXICON = new Map();

for (const entry of lexicon.entries) {
  if (!entry.arabic || !entry.canonical) continue;

  const arabic = String(entry.arabic).replace(DIACRITICS, '').trim();
  const latin = String(entry.canonical).trim();
  if (arabic) FROM_LEXICON.set(arabic, latin);

  /* Multi-word entries also map word by word, but only when the two sides line
     up one to one. "منيح، وإنت؟" / "mni7, w inte?" does; guessing when they do
     not would produce confident nonsense. */
  const arabicWords = arabic.split(/[\s،,]+/).filter(Boolean);
  const latinWords = latin.split(/[\s,]+/).filter(Boolean);
  if (arabicWords.length > 1 && arabicWords.length === latinWords.length) {
    for (let i = 0; i < arabicWords.length; i += 1) {
      const key = arabicWords[i].replace(/[؟?!.،,]/g, '');
      const value = latinWords[i].replace(/[?!.,]/g, '');
      if (key && value && !FROM_LEXICON.has(key)) FROM_LEXICON.set(key, value);
    }
  }
}

/**
 * Tier 2: the everyday words the lexicon does not teach but Zee keeps reaching
 * for mid-sentence — pronouns, question words, connectives. These are what
 * actually show up when she slips, so they are worth spelling properly.
 */
const COMMON = new Map(Object.entries({
  شو: 'shu', بدك: 'baddak', بدي: 'baddi', بدنا: 'baddna', بدها: 'badda',
  تدربي: 'tdarrbe', تدرب: 'tdarrab', ندرب: 'ndarreb', نبدا: 'nebda', نبدأ: 'nebda',
  أول: '2awwal', اول: '2awwal', شي: 'shi', يلا: 'yalla', يالله: 'yalla',
  هيك: 'heik', كتير: 'ktir', هلق: 'halla2', هلأ: 'halla2', بس: 'bas',
  كمان: 'kaman', ليش: 'leish', وين: 'wein', كيف: 'kif', مين: 'min',
  إيمتى: 'eimta', ايمتى: 'eimta', لأ: 'la2', لا: 'la', إيه: 'eh', ايه: 'eh',
  أنا: 'ana', انا: 'ana', إنت: 'inte', انت: 'inte', إنتي: 'inte', هو: 'huwe',
  هي: 'hiye', نحنا: 'ne7na', هنن: 'hinne', مع: 'ma3', من: 'min', عن: 'aan',
  على: '3a', ع: '3a', في: 'fi', فيك: 'fik', فيكي: 'fike', في_شي: 'fi shi',
  و: 'w', أو: 'aw', او: 'aw', بعدين: 'ba3dein', اليوم: 'lyom', لليوم: 'lyom',
  بكرا: 'bukra', مبارح: 'mbere7', دقيقة: 'da2i2a', تاني: 'tene',
  منيح: 'mni7', منيحة: 'mni7a', تمام: 'tamem', مزبوط: 'mazbout',
  حلو: '7elo', كلمة: 'kelme', جملة: 'jimle', درس: 'dars', لغة: 'lgha',
  عربي: '3arabe', لبناني: 'libnene', لبنانية: 'libnene', إنجليزي: 'inglize',
  قول: '2oul', قولي: '2ouleele', قوليلي: '2ouleele', جرب: 'jarrib',
  جربي: 'jarrbe', اسمع: 'sma3', اسمعي: 'sma3e', فهمت: 'fhimit',
  عم: '3am', رح: 'ra7', لازم: 'lezim', ممكن: 'mumken', أكيد: 'akid',
  طيب: 'tayyeb', خلص: 'khalas', شكرا: 'shukran', عفوا: '3afwan',
  أهلا: 'ahla', اهلا: 'ahla', سلام: 'salem', صباح: 'sabe7', مسا: 'masa',
  قهوة: '2ahwe', مي: 'mai', أكل: 'akl', بيت: 'beit', شغل: 'shighel'
}));

/** Tier 3: letter by letter. Short vowels are simply absent from the script. */
const LETTERS = new Map(Object.entries({
  ا: 'a', أ: '2a', إ: '2i', آ: '2a', ٱ: 'a',
  ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: '7', خ: 'kh',
  د: 'd', ذ: 'z', ر: 'r', ز: 'z', س: 's', ش: 'sh',
  ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: '3', غ: 'gh',
  ف: 'f', ق: '2', ك: 'k', ل: 'l', م: 'm', ن: 'n',
  ه: 'h', و: 'w', ي: 'y', ى: 'a', ة: 'e',
  ء: '2', ئ: '2', ؤ: '2', لا: 'la',
  '؟': '?', '،': ',', '؛': ';', '٠': '0', '١': '1', '٢': '2', '٣': '3',
  '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
}));

function letterwise(word) {
  let out = '';
  for (const char of word) out += LETTERS.has(char) ? LETTERS.get(char) : char;
  return out;
}

function transliterateWord(word) {
  const bare = word.replace(DIACRITICS, '');
  const stripped = bare.replace(/^[«"'(]+|[»"')؟?!.،,:;]+$/g, '');
  const tail = bare.slice(stripped.length);

  if (!stripped) return letterwise(bare);

  const known = FROM_LEXICON.get(stripped) || COMMON.get(stripped);
  return (known || letterwise(stripped)) + letterwise(tail);
}

/** Rewrite every Arabic run in a line as Latin, leaving the rest untouched. */
export function transliterate(text) {
  return String(text).replace(ARABIC_RUN, (run) =>
    run.split(/(\s+)/).map((part) => (part.trim() ? transliterateWord(part) : part)).join('')
  );
}

/**
 * Is this line the Arabic line of a phrase block?
 *
 * Mirrors the client's own test in js/zee-panel.js `classify()` — a line that is
 * almost entirely script, and short. Both sides have to agree, or the guard
 * would rewrite the very line the panel is waiting to render as the phrase.
 */
export function isScriptLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !hasArabic(trimmed)) return false;
  const letters = trimmed.replace(/[\s\p{P}\p{S}]/gu, '');
  if (!letters.length) return false;
  const arabic = (letters.match(/[؀-ۿ]/g) || []).length;
  return arabic / letters.length > 0.85 && trimmed.length <= 60;
}

/* --------------------------------------------------------------------------
   The streaming guard
   --------------------------------------------------------------------------
   A line cannot be judged until it ends: "بدك" alone might be the start of a
   phrase-block line (leave it) or sitting mid-sentence (rewrite it). So clean
   text streams straight through, and the moment a line turns out to contain
   script, the rest of that line is held back until the newline decides which
   it was. In practice that costs a few words of latency on the rare bad line
   and nothing at all on every good one.
   -------------------------------------------------------------------------- */

export function createScriptGuard() {
  let emitted = ''; // already sent for the current line
  let held = ''; // withheld tail of the current line
  let dirty = false; // current line contains script

  /** Decide what the finished line should look like and release it. */
  const finish = () => {
    if (!dirty) {
      const out = held;
      held = '';
      return out;
    }

    // Nothing Latin came before it and it reads as script — the phrase line.
    const out = emitted.trim() === '' && isScriptLine(emitted + held) ? held : transliterate(held);
    held = '';
    return out;
  };

  const newline = () => {
    emitted = '';
    dirty = false;
  };

  return {
    push(text) {
      let out = '';

      for (const char of String(text)) {
        if (char === '\n') {
          out += finish() + '\n';
          newline();
          continue;
        }
        held += char;
        if (!dirty && ARABIC_CHAR.test(char)) dirty = true;
      }

      // A clean line needs no decision — let it stream as it arrives.
      if (!dirty && held) {
        out += held;
        emitted += held;
        held = '';
      }

      return out;
    },

    end() {
      return finish();
    }
  };
}
