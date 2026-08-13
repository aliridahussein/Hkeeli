/**
 * Zee — POST /api/zee/chat
 *
 * The browser never talks to Azure. It posts a message here, the Worker decides
 * everything that matters — who Zee is, what context she gets, how long she may
 * answer for, where she is allowed to send people — and relays Azure's stream
 * back as a small SSE feed of its own:
 *
 *   event: delta   {"t": "…"}    a piece of the answer
 *   event: action  {"label", "url"}  a validated internal link
 *   event: done    {}
 *   event: error   {"code": "…"}  never an Azure error verbatim
 *
 * The client's payload is treated as hostile throughout: roles, lengths, counts
 * and the page path are all re-checked here, and nothing it sends can reach the
 * model as instruction.
 */

import { LIMITS, isAllowedOrigin } from './config.js';
import { buildContextBlock, instructions, styleReminder, PAGES } from './context.js';
import { checkRateLimit } from './ratelimit.js';
import { createScriptGuard } from './sanitize.js';

const encoder = new TextEncoder();

/* --------------------------------------------------------------------------
   Small SSE helpers
   -------------------------------------------------------------------------- */

function sse(event, data) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function streamHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    // The reply is a live stream; a proxy buffering it would defeat the point.
    'X-Accel-Buffering': 'no'
  };
}

/** An error the learner can act on, delivered as a stream so the UI has one path. */
function errorStream(code, status = 200) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(sse('error', { code }));
      controller.close();
    }
  });
  return new Response(body, { status, headers: streamHeaders() });
}

/* --------------------------------------------------------------------------
   Request validation
   -------------------------------------------------------------------------- */

function validate(payload) {
  if (!payload || typeof payload !== 'object') return { error: 'bad_request' };

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return { error: 'bad_request' };
  if (message.length > LIMITS.maxMessageChars) return { error: 'too_long' };

  /* History is rebuilt from scratch rather than filtered in place: only the two
     roles we expect survive, so a client cannot smuggle in a `system` turn and
     rewrite Zee's instructions. The tail is kept — recent turns are the ones
     that make the next answer make sense. */
  const history = Array.isArray(payload.history) ? payload.history : [];
  const clean = history
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant'))
    .filter((turn) => typeof turn.content === 'string' && turn.content.trim())
    .slice(-LIMITS.maxHistoryMessages)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, LIMITS.maxMessageChars)
    }));

  // Path only — never a full URL, never a query string, so nothing identifying
  // rides along with it.
  const page = typeof payload.page === 'string' ? payload.page.slice(0, 120) : '';

  return { message, history: clean, page };
}

/* --------------------------------------------------------------------------
   Navigation markers
   --------------------------------------------------------------------------
   Zee ends a reply with `<<nav:id>>` when a page would help. The marker is
   stripped from the visible text and resolved against site-context.json here —
   the model proposes an id, the Worker decides whether it exists and what URL it
   maps to, so a hallucinated or injected link can never become a button.
   -------------------------------------------------------------------------- */

const MARKER = /<<nav:([a-z0-9-]{1,40})>>/;
const MARKER_START = '<<';

function createMarkerFilter() {
  let buffer = '';
  let navId = null;

  /** Text safe to emit now; anything that might still become a marker is held. */
  const drain = (final) => {
    let out = '';

    for (;;) {
      const start = buffer.indexOf(MARKER_START);

      if (start === -1) {
        // A chunk can end mid-"<<", so hold back a lone trailing '<'.
        const keep = !final && buffer.endsWith('<') ? 1 : 0;
        out += buffer.slice(0, buffer.length - keep);
        buffer = buffer.slice(buffer.length - keep);
        return out;
      }

      out += buffer.slice(0, start);
      buffer = buffer.slice(start);

      const match = MARKER.exec(buffer);
      if (match && match.index === 0) {
        if (!navId) navId = match[1];
        buffer = buffer.slice(match[0].length);
        continue;
      }

      // Not a marker (yet). Wait for more unless this is all we will ever get.
      if (!final && buffer.length < 48) return out;
      out += buffer.slice(0, MARKER_START.length);
      buffer = buffer.slice(MARKER_START.length);
    }
  };

  return {
    push: (text) => {
      buffer += text;
      return drain(false);
    },
    end: () => ({ text: drain(true), navId })
  };
}

function resolveAction(navId) {
  if (!navId) return null;
  const page = PAGES.get(navId);
  if (!page) return null;
  return { label: page.title, url: page.url, id: page.id };
}

/* --------------------------------------------------------------------------
   Azure
   -------------------------------------------------------------------------- */

/**
 * Where to POST.
 *
 * The portal shows the deployment's endpoint as `…/openai/v1/responses`, but
 * the Responses API is not enabled in this resource's region — it answers 404
 * with `Azure OpenAI Responses API is not enabled in this region`. Chat
 * Completions on the same v1 surface works, so the secret may hold either the
 * URL copied from the portal or the bare `…/openai/v1` base, and this
 * normalises both to the path that exists.
 */
function azureUrl(env) {
  const base = String(env.AZURE_OPENAI_ENDPOINT || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(responses|chat\/completions)$/, '');
  return `${base}/chat/completions`;
}

function azureRequest(env, { message, history, page }) {
  /* Counted from the history the client sent plus this one. It is capped at
     maxHistoryMessages, so a very long conversation reports the cap rather than
     the true total — which is fine: everything past the cap is "invested". */
  const userTurns = history.filter((turn) => turn.role === 'user').length + 1;

  const messages = [
    // Zee's identity is a server-side system message and nothing the client
    // sends can precede or replace it.
    { role: 'system', content: instructions },
    ...history,
    { role: 'developer', content: buildContextBlock({ message, page, userTurns }) },
    { role: 'user', content: message },
    // Last position, after the learner's turn: this is the one the model
    // actually obeys. See styleReminder().
    { role: 'developer', content: styleReminder() }
  ];

  return {
    model: env.AZURE_OPENAI_DEPLOYMENT,
    messages,
    // `max_completion_tokens`, not `max_tokens`: the gpt-5 family rejects the
    // older field outright.
    max_completion_tokens: LIMITS.maxOutputTokens,
    stream: true
  };
}

/**
 * Read Azure's SSE feed and hand back plain text deltas.
 * Yields strings; throws on a stream-level failure.
 */
async function* readAzureStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; anything after the last one is
    // an incomplete frame and waits for the next read.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          continue; // a malformed frame is not worth killing the answer over
        }

        if (event.error) throw new Error(`azure_stream: ${event.error.code || 'unknown'}`);

        const delta = event.choices?.[0]?.delta;
        if (typeof delta?.content === 'string' && delta.content) yield delta.content;
        // A refusal arrives in its own field; the learner should still see it.
        else if (typeof delta?.refusal === 'string' && delta.refusal) yield delta.refusal;
      }
    }
  }
}

/* --------------------------------------------------------------------------
   Handler
   -------------------------------------------------------------------------- */

export async function handleChat(request, env, ctx) {
  if (request.method !== 'POST') return errorStream('bad_request', 405);

  if (!isAllowedOrigin(request.headers.get('Origin'), request.url)) {
    return errorStream('forbidden', 403);
  }

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > LIMITS.maxBodyBytes) return errorStream('too_long', 413);

  let payload;
  try {
    const text = await request.text();
    if (text.length > LIMITS.maxBodyBytes) return errorStream('too_long', 413);
    payload = JSON.parse(text);
  } catch {
    return errorStream('bad_request', 400);
  }

  const valid = validate(payload);
  if (valid.error) return errorStream(valid.error, valid.error === 'too_long' ? 413 : 400);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const limit = await checkRateLimit(env, ip);
  if (!limit.ok) return errorStream(limit.scope === 'day' ? 'daily_limit' : 'rate_limited', 429);

  if (!env.AZURE_OPENAI_API_KEY || !env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_DEPLOYMENT) {
    console.error('zee: missing Azure configuration (key/endpoint/deployment secret not set)');
    return errorStream('unavailable', 500);
  }

  /* Two reasons to abort upstream: the learner pressed Stop (the client drops
     the connection) or Azure has stalled. Either way we stop paying for tokens
     nobody will read. */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIMITS.upstreamTimeoutMs);
  request.signal?.addEventListener('abort', () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(azureUrl(env), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.AZURE_OPENAI_API_KEY,
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(azureRequest(env, valid)),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('zee: upstream fetch failed', error.name, error.message);
    return errorStream('upstream');
  }

  if (!upstream.ok || !upstream.body) {
    // Read a little of the body for the log — it names the cause (bad
    // deployment, quota, malformed body) without containing the key.
    const detail = await upstream.text().catch(() => '');
    clearTimeout(timeout);
    console.error('zee: azure responded', upstream.status, detail.slice(0, 500));
    return errorStream(upstream.status === 429 ? 'rate_limited' : 'upstream');
  }

  const stream = new ReadableStream({
    async start(sink) {
      const filter = createMarkerFilter();
      /* Last thing before the learner sees it: no Arabic script may sit inside a
         sentence, whatever the model decided to write. See sanitize.js. */
      const guard = createScriptGuard();
      let produced = false;

      try {
        for await (const delta of readAzureStream(upstream)) {
          const text = guard.push(filter.push(delta));
          if (text) {
            produced = true;
            sink.enqueue(sse('delta', { t: text }));
          }
        }

        const { text: tail, navId } = filter.end();
        const text = guard.push(tail) + guard.end();
        if (text) {
          produced = true;
          sink.enqueue(sse('delta', { t: text }));
        }

        const action = resolveAction(navId);
        if (action) sink.enqueue(sse('action', action));

        // An empty answer usually means the output budget went entirely on
        // internal reasoning — a fault to the learner, not a blank bubble.
        sink.enqueue(produced ? sse('done', {}) : sse('error', { code: 'empty' }));
      } catch (error) {
        console.error('zee: stream failed', error.message);
        sink.enqueue(sse('error', { code: 'upstream' }));
      } finally {
        clearTimeout(timeout);
        sink.close();
      }
    },
    cancel() {
      // The learner closed the tab or pressed Stop.
      clearTimeout(timeout);
      controller.abort();
    }
  });

  return new Response(stream, { headers: streamHeaders() });
}
