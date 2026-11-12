/**
 * Hkeeli — the analytics seam.
 *
 * There is no analytics provider on the site, and adding one is a decision
 * about sending visitor data to a third party — not something a practice game
 * should make on its own. So every notable interaction calls `track()`, which
 * fires a DOM event and does nothing else.
 *
 * Wiring a provider is one listener, added once, anywhere:
 *
 *   document.addEventListener('hkeeli:event', (e) =>
 *     plausible(e.detail.name, { props: e.detail.props }));
 *
 * Until that listener exists the events are inert. The point is that the call
 * sites are already correct, so the day a provider is chosen the questions
 * that matter — how many people start a scene, how many finish one, how many
 * go on to the booking page — are answerable immediately rather than after
 * another pass over the codebase.
 *
 * What is deliberately NOT sent: no message text, no phrase a learner got
 * wrong, no identifier, no page-by-page trail. Event names and small integer
 * counts only.
 */

export const EVENT = 'hkeeli:event';

/**
 * @param {string} name   e.g. 'scene_completed'
 * @param {object} [props] small, non-identifying values only
 */
export function track(name, props = {}) {
  if (!name) return;
  try {
    document.dispatchEvent(new CustomEvent(EVENT, { detail: { name, props } }));
  } catch {
    /* analytics must never break a round */
  }
}

/* The events this codebase fires today. Kept here as the one list a provider
   can be configured against, and so that a renamed event is a one-file change.

   practice
     game_round_started       { game }               a standalone drill
     game_round_completed     { game, score, total }
     session_started          { session }            'daily' or 'scene-<id>'
     session_step_completed   { session, step }
     session_completed        { session, score, total }

   conversion
     booking_cta_shown    { from, scene }  the bridge card was rendered
     booking_cta_clicked  { from, scene }  …and followed. `from` is 'game',
                                           'daily', 'scene', or 'scene-end'
                                           (the footer button once every
                                           scene has been played)

   zee  (see js/zee-analytics.js, which routes through this module)
     zee_opened, zee_message_sent, zee_navigation_clicked,
     zee_booking_clicked, zee_cleared, zee_expanded
*/

export default { track, EVENT };
