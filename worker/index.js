/**
 * Hkeeli — Cloudflare Worker entry point.
 *
 * The site itself is still plain static files: Workers Static Assets serves
 * every real file directly without ever waking this script. It exists for one
 * route — Zee's chat API — which needs a server because it holds the Azure key.
 *
 * Anything that is not /api/… is handed back to the asset server, so adding
 * this Worker changed nothing about how the pages are delivered.
 */

import { handleChat } from './zee/chat.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/zee/chat') {
      return handleChat(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
