/**
 * Hkeeli — Daily Practice.
 *
 * A skills circuit across the whole course: review what you met before, learn
 * one new phrase, hear it, answer someone, build a sentence. It is what a
 * learner runs when they want to keep everything warm rather than live one
 * situation — scenes (js/scenes.js) are the other half of that pair.
 *
 * The engine lives in js/session.js and is shared with scenes. This file is
 * only the configuration: which steps, recorded under which id. Reordering or
 * dropping a step is a `CONFIG.daily.steps` edit and nothing else.
 */

import { CONFIG } from './config.js';
import { StepSession } from './session.js';

/** Sessions are recorded under their own id, alongside the individual games. */
export const DAILY_ID = 'daily';

export class DailySession extends StepSession {
  /**
   * @param {Stage} stage
   * @param {object} context  { units, phrases, unitId, onExit }
   */
  constructor(stage, context = {}) {
    super(stage, { ...context, sessionId: DAILY_ID, steps: CONFIG.daily.steps });
  }
}
