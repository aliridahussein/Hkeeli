Drop the teacher's spoken introduction here as hello.mp3.

The line that plays is data/lessons.json -> meta.intro. Change the text there
and the card on the home page follows; the audio path is relative to
CONFIG.audioBase, exactly like every lesson phrase.

Until this file exists, the play button falls back to speech synthesis, and the
learner is told once per session that the voice is synthetic
(CONFIG.showTtsNotice in js/config.js).
