/**
 * Hkeeli — runtime configuration.
 *
 * This is the file you edit when infrastructure changes. Nothing else in the
 * codebase should know where audio lives, how many questions a round has, or
 * which storage backend is in use.
 */

export const CONFIG = {
  /* ---- Data ------------------------------------------------------------ */
  dataBase: 'data/',
  lessonsFile: 'lessons.json',

  /* ---- Audio ------------------------------------------------------------
   * Swapping local files for hosted audio (Cloudflare R2, S3, Stream…) is a
   * one-line change here. Phrase `audio` values in lessons.json are always
   * relative to this base, so nothing else has to move.
   *
   *   audioBase: 'https://cdn.hkeeli.com/audio/'
   */
  audioBase: 'public/audio/',

  /* Until real recordings exist, missing files fall back to speech synthesis
   * and the learner is told once per session that the voice is synthetic.
   * Flip to false the day the recordings land. */
  ttsFallback: true,
  showTtsNotice: true,
  ttsLocales: ['ar-LB', 'ar-SY', 'ar-EG', 'ar-SA', 'ar'],
  ttsRate: 0.85,

  /* ---- Language --------------------------------------------------------- */
  defaultLang: 'en',
  languages: ['en', 'ar'],
  langStorageKey: 'hkeeli.lang',

  /* ---- Progress ---------------------------------------------------------
   * `storageKey` is versioned so a future schema change can migrate cleanly.
   * To move progress to a real backend, implement the same interface as
   * LocalStorageProgress (see js/storage.js) and export that instead. */
  storageKey: 'hkeeli.progress.v1',

  /* Onboarding answers (why / level / what first). Separate from progress so
   * that resetting one never wipes the other. */
  prefsKey: 'hkeeli.prefs.v1',

  /* ---- Games ------------------------------------------------------------ */
  games: {
    roundLength: 8, // questions per round for Listen & Choose / Fill the Blank
    optionCount: 4, // total multiple-choice options (1 correct + distractors)
    matchPairs: 5, // pairs per Match the Phrase board
    flashcardSession: 10, // cards per flashcard session
    /* Leitner boxes: index = box, value = days until the card is due again. */
    srsIntervals: [0, 1, 3, 7, 21],
    fuzzyDistance: 1 // Levenshtein tolerance for typed answers
  },

  /* ---- Daily Practice ---------------------------------------------------
   * The guided session on practice.html. Each step reuses an existing game;
   * `length` is how many questions/cards that step asks for. Reorder, drop or
   * repeat steps here — js/daily.js needs no changes. A step whose game can't
   * run with the phrases in scope is skipped rather than shown empty. */
  daily: {
    steps: [
      { kind: 'game', game: 'cards', length: 3, labelKey: 'daily.stepReview' },
      { kind: 'teach', labelKey: 'daily.stepLearn' },
      { kind: 'game', game: 'listen', length: 3, labelKey: 'daily.stepListen' },
      { kind: 'game', game: 'reply', length: 2, labelKey: 'daily.stepReply' },
      { kind: 'game', game: 'build', length: 2, labelKey: 'daily.stepBuild' }
    ]
  },

  /* ---- Booking ----------------------------------------------------------
   * `formEndpoint: 'https://formspree.io/f/xxxx'` switches the booking form
   * from a mailto: draft to a real POST without touching the markup. */
  bookingEmail: 'hello@hkeeli.example',
  formEndpoint: null
};

export default CONFIG;
