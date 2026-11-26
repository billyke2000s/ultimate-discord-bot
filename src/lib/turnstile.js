const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { challengePage, resultPage, styleHash } = require('./verification-page');

const sessions = new Map();
const lifetime = 5 * 60_000;
const action = 'discord_verify';
const enabled = () => process.env.TURNSTILE_ENABLED === 'true';

function config() {
  const origin = new URL(process.env.TURNSTILE_ORIGIN);
  const sitekey = process.env.TURNSTILE_SITE_KEY;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (
    origin.protocol !== 'https:' ||
    origin.href !== origin.origin + '/' ||
    !/^[a-zA-Z0-9_-]+$/.test(sitekey || '') ||
    !secret
  ) {
    throw new Error('Invalid Turnstile configuration');
  }
  return { origin, sitekey, secret };
}

function issue(guildId, userId, joinedAt) {
  const { origin } = config();
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expires <= now || (session.guildId === guildId && session.userId === userId)) sessions.delete(id);
  }
  if (sessions.size >= 2000) throw new Error('Turnstile queue is full');
  const id = randomBytes(24).toString('base64url');
  sessions.set(id, { guildId, userId, joinedAt, expires: now + lifetime, state: 'pending' });
  return new URL('/verify/' + id, origin).href;
}

function reply(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      `default-src 'none'; style-src 'sha256-${styleHash}'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  });
  res.end(body);
}

function showResult(res, status, message, retry = false) {
  return reply(res, status, resultPage(status, message, retry));
}

async function handle(req, res, settings, complete) {
  const id = /^\/verify\/([A-Za-z0-9_-]{32})$/.exec(req.url)?.[1];
  if (!id) return showResult(res, 404, 'Verification link not found.');
  const session = sessions.get(id);
  if (!session || session.expires <= Date.now()) return showResult(res, 410, 'Link expired. Start again in Discord.');
  if (session.state !== 'pending') return showResult(res, 409, 'Verification is already in progress.');
  if (req.method === 'GET') {
    return reply(res, 200, challengePage(settings.sitekey, action, id));
  }
  if (req.method !== 'POST') return showResult(res, 405, 'Method not allowed.');
  if (req.headers.origin !== settings.origin.origin) return showResult(res, 403, 'Invalid request origin.');
  if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') {
    return showResult(res, 415, 'Unsupported form format.');
  }
  session.state = 'checking';
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 4096) return showResult(res, 413, 'Verification form is too large.');
    }
    const response = new URLSearchParams(body).get('cf-turnstile-response');
    if (!response || response.length > 2048) {
      return showResult(res, 400, 'Complete the Cloudflare check first.', true);
    }
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: settings.secret, response }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!check.ok) return showResult(res, 503, 'Cloudflare verification is temporarily unavailable.', true);
    const result = await check.json();
    if (
      result.success !== true ||
      result.hostname !== settings.origin.hostname ||
      result.action !== action ||
      result.cdata !== id
    ) {
      return showResult(res, 403, 'Cloudflare could not verify this request. Try a fresh check.', true);
    }
    if (sessions.get(id) !== session || session.expires <= Date.now()) {
      return showResult(res, 410, 'Link expired. Start again in Discord.');
    }
    sessions.delete(id);
    await complete(session);
    return showResult(res, 200);
  } finally {
    if (sessions.get(id) === session) session.state = 'pending';
  }
}

function start(complete) {
  if (!enabled()) return;
  let settings;
  try {
    settings = config();
  } catch {
    console.error('[verification] Turnstile requires an HTTPS origin, site key and secret key');
    return;
  }
  const server = http.createServer({ requestTimeout: 10000, headersTimeout: 5000 }, (req, res) => {
    handle(req, res, settings, complete).catch(() => {
      if (!res.headersSent) showResult(res, 503, 'Verification could not finish. Start again in Discord.');
    });
  });
  server.on('error', () => console.error('[verification] Could not start the Turnstile web listener'));
  server.listen(8787, '0.0.0.0');
  server.unref();
}

module.exports = { enabled, issue, start };
