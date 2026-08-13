/**
 * Zee — per-visitor throttling.
 *
 * Two backends, chosen by what the Worker is bound to:
 *
 *   KV (env.ZEE_KV)   counters shared across every isolate and colo. This is
 *                     the real limit. KV is eventually consistent, so a
 *                     determined attacker across many colos can overshoot
 *                     slightly before the counter catches up — acceptable for
 *                     a cost control, and cheap.
 *   memory            a per-isolate Map. Free, needs no setup, and stops the
 *                     ordinary case (one person holding the send key down),
 *                     but an isolate recycle resets it.
 *
 * The Worker runs either way: with no KV namespace bound, Zee still deploys and
 * still throttles, just less strictly. See README for the binding.
 */

import { LIMITS } from './config.js';

const memory = new Map();

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Prune anything already expired — the Map must not grow forever. */
function sweep(now) {
  if (memory.size < 500) return;
  for (const [key, record] of memory) {
    if (record.resetAt <= now) memory.delete(key);
  }
}

async function bump(env, key, windowSeconds) {
  const now = Date.now();

  if (env.ZEE_KV) {
    const raw = await env.ZEE_KV.get(key);
    const count = raw ? Number(raw) + 1 : 1;
    // The TTL is what expires the window; the value is only the count.
    await env.ZEE_KV.put(key, String(count), { expirationTtl: Math.max(60, windowSeconds) });
    return count;
  }

  sweep(now);
  const record = memory.get(key);
  if (!record || record.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  record.count += 1;
  return record.count;
}

/**
 * Count one request against a visitor.
 *
 * @returns {Promise<{ok: boolean, scope?: 'minute'|'day'}>}
 */
export async function checkRateLimit(env, ip) {
  const id = ip || 'unknown';
  const minuteWindow = Math.floor(Date.now() / 60_000);

  const perMinute = await bump(env, `zee:m:${id}:${minuteWindow}`, 120);
  if (perMinute > LIMITS.perMinute) return { ok: false, scope: 'minute' };

  const perDay = await bump(env, `zee:d:${id}:${today()}`, 60 * 60 * 26);
  if (perDay > LIMITS.perDay) return { ok: false, scope: 'day' };

  return { ok: true };
}
