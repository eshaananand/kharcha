// Kharcha mailbox — a tiny Cloudflare Worker.
//
// The iPhone Shortcut POSTs each bank SMS here. The Worker immediately
// encrypts it with the PUBLIC key the Kharcha app uploaded, and stores only
// the encrypted blob. Only the app (which holds the PRIVATE key) can read it.
// When the app has picked messages up, it asks the Worker to delete them.
//
// Endpoints (all except GET / need "Authorization: Bearer <TOKEN>"):
//   POST /key   {publicKey: JWK}   app uploads its public key (turning on auto-sync)
//   POST /sms   {text: "..."}      Shortcut drops in one SMS
//   GET  /sms                      app fetches encrypted messages
//   POST /ack   {ids: [...]}       app says "got these, delete them"

const MAX_TEXT = 2000;          // characters per SMS
const KEEP_SECONDS = 60 * 60 * 24 * 30;   // unsynced messages auto-expire after 30 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && url.pathname === '/') return text('Kharcha mailbox is running.', 200, cors);

    if (!(await authorized(request, env))) return json({ error: 'Wrong or missing secret code' }, 401, cors);

    try {
      if (request.method === 'POST' && url.pathname === '/key') return await saveKey(request, env, cors);
      if (request.method === 'POST' && url.pathname === '/sms') return await receiveSms(request, env, cors);
      if (request.method === 'GET' && url.pathname === '/sms') return await listSms(env, cors);
      if (request.method === 'POST' && url.pathname === '/ack') return await ackSms(request, env, cors);
    } catch (e) {
      return json({ error: 'Server error: ' + (e && e.message || e) }, 500, cors);
    }
    return json({ error: 'Not found' }, 404, cors);
  },
};

/* ---------- handlers ---------- */

async function saveKey(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const jwk = body.publicKey;
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e || jwk.d) return json({ error: 'Expected an RSA public key' }, 400, cors);
  await importPublicKey(jwk); // throws if invalid
  await env.INBOX.put('pubkey', JSON.stringify({ kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256', ext: true }));
  return json({ ok: true }, 200, cors);
}

async function receiveSms(request, env, cors) {
  const smsText = (await readText(request)).trim().slice(0, MAX_TEXT);
  if (!smsText) return json({ error: 'No message text received' }, 400, cors);

  const jwkStr = await env.INBOX.get('pubkey');
  if (!jwkStr) return json({ error: 'Auto-sync is not turned on in the Kharcha app yet' }, 409, cors);
  const pub = await importPublicKey(JSON.parse(jwkStr));

  // Hybrid encryption: a fresh AES-256-GCM key per message, itself encrypted with RSA-OAEP.
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(smsText));
  const wk = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);

  const id = 'm:' + Date.now().toString().padStart(15, '0') + ':' + b64(crypto.getRandomValues(new Uint8Array(6)));
  await env.INBOX.put(id, JSON.stringify({ iv: b64(iv), ct: b64(ct), wk: b64(wk), at: Date.now() }), { expirationTtl: KEEP_SECONDS });
  return json({ ok: true }, 200, cors);
}

async function listSms(env, cors) {
  const out = [];
  let cursor;
  do {
    const page = await env.INBOX.list({ prefix: 'm:', cursor });
    for (const k of page.keys) {
      const v = await env.INBOX.get(k.name);
      if (v) out.push({ id: k.name, ...JSON.parse(v) });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && out.length < 500);
  return json({ messages: out }, 200, cors);
}

async function ackSms(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter(i => typeof i === 'string' && i.startsWith('m:')).slice(0, 500) : [];
  await Promise.all(ids.map(id => env.INBOX.delete(id)));
  return json({ ok: true, deleted: ids.length }, 200, cors);
}

/* ---------- helpers ---------- */

async function readText(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const b = await request.json().catch(() => ({}));
    return String(b.text ?? b.message ?? b.sms ?? '');
  }
  if (type.includes('form')) {
    const f = await request.formData();
    return String(f.get('text') ?? f.get('message') ?? '');
  }
  return await request.text();
}

async function authorized(request, env) {
  const h = request.headers.get('authorization') || '';
  const given = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!env.TOKEN || !given) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(env.TOKEN);
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

function importPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const text = (t, status, headers) => new Response(t, { status, headers: { ...headers, 'Content-Type': 'text/plain' } });
