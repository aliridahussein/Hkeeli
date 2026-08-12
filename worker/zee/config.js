/**
 * Zee — server-side limits.
 *
 * Every number here is a cost control. Azure's own TPM/RPM ceilings protect the
 * account; these protect the bill, and they are enforced on the Worker where a
 * visitor cannot edit them. The client has its own copies for the UI (character
 * counter, disabled send button) but they are advisory only — nothing the
 * browser sends is trusted.
 */

export const LIMITS = {
  /* One message from the learner. Anything longer is rejected outright rather
     than truncated: silently cutting someone's question off mid-sentence and
     answering the fragment is worse than saying it's too long. */
  maxMessageChars: 1000,

  /* Turns of history the client may send, and what we keep after capping.
     Eight is four exchanges — enough for "what does that mean?" to make sense,
     short enough that a long session never grows the prompt. */
  maxHistoryMessages: 8,

  /* Hard cap on the whole request body. A well-formed request is ~2-3 KB. */
  maxBodyBytes: 24 * 1024,

  /* Ceiling on what Azure may generate. Note this counts every output token,
     including any the model spends on internal reasoning, so it sits a little
     above the 200-250 tokens of visible answer we actually want — the system
     instructions are what keep replies short in practice. */
  maxOutputTokens: 400,

  /* Per-IP throttles. `perMinute` stops a burst, `perDay` stops a slow drip
     that would still add up to real money over a month. */
  perMinute: 5,
  perDay: 50,

  /* Glossary entries attached to a single turn. Beyond a handful the context
     stops being "the words they asked about" and becomes a dictionary dump. */
  maxGlossaryEntries: 6,

  /* How long we wait on Azure before giving up and telling the learner to try
     again. Streaming means first tokens arrive quickly; a long stall is a fault,
     not slowness. */
  upstreamTimeoutMs: 30_000
};

/**
 * Origins allowed to POST to the API. The deployed site is same-origin with the
 * Worker, so in production this is really "the browser says it came from us";
 * the localhost entries exist so the site can be developed against a local
 * `wrangler dev` without loosening anything in production.
 */
export function isAllowedOrigin(origin, requestUrl) {
  if (!origin) return false;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === new URL(requestUrl).hostname) return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return host === 'hkeeli.com' || host.endsWith('.hkeeli.com') || host.endsWith('.workers.dev');
}
