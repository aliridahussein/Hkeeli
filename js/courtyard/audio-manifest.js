/**
 * Hkeeli courtyard — where each line of the café encounter will be heard.
 *
 * Phrases in data/lessons.json already name their recording (`audio`). The
 * dialogue lines and the one line written for the encounter don't, so this
 * manifest names a file for each, under the same folder scheme. Until a file
 * exists at its path, the line is text only (listen.js probes for it); the
 * day the mp3 lands, it plays. No synthetic voice is ever substituted.
 *
 * public/audio/RECORDING-SCRIPT.md lists every file still to record, in
 * order, with the text to read — keep the two in step.
 */

/** translit → path relative to CONFIG.audioBase. */
export const DIALOGUE_AUDIO = {
  'ahla w sahla, shu bt7eb?': 'lessons/unit-2/dialogue/ahla-w-sahla-shu-bt7eb.mp3',
  'baddi 2ahwe wasat, min fadlak.': 'lessons/unit-2/dialogue/baddi-ahwe-wasat-min-fadlak.mp3',
  'shi tene?': 'lessons/unit-2/dialogue/shi-tene.mp3',
  'man2ushe za3tar kamen. w el 7seb law sama7t.': 'lessons/unit-2/dialogue/manoushe-kamen-w-el-hseb.mp3',
  'baddi 2ahwe sada, min fadlak.': 'lessons/unit-2/cafe/baddi-ahwe-sada-min-fadlak.mp3'
};

/** The line, with its recording path filled in when the manifest names one. */
export function withAudio(line) {
  if (!line || line.audio) return line;
  const audio = DIALOGUE_AUDIO[line.translit];
  return audio ? { ...line, audio } : line;
}
