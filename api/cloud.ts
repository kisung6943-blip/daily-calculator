import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { get, list, put } from '@vercel/blob';

export const config = { maxDuration: 60 };
const MAX_BYTES = 3.5 * 1024 * 1024, MAX_RAW = 40 * 1024 * 1024, MAX_MANIFEST = 4096;
const SESSION = '__Host-esliving-session', FLOW = '__Host-esliving-oauth';
const KEYS = ['seller_settlement_orders_v1', 'seller_settlement_costs_v1', 'seller_settlement_settings_v1'];
const PREFIX = 'esliving-daily/manifests/';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const text = new TextDecoder('utf-8', { fatal: true });
const obj = (v: any): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const uint = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const clock = () => Math.floor(Date.now() / 1000);
const manifestPath = (id: string) => PREFIX + id + '.json';
const dataPath = (id: string) => 'esliving-daily/snapshots/' + id + '/data.json.gz';
class Failure extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (n: number, m: string): never => { throw new Failure(n, m); };
function environment() {
  const { APP_ORIGIN: origin, GITHUB_CLIENT_ID: client, GITHUB_CLIENT_SECRET: secret, ALLOWED_GITHUB_ID: owner, BLOB_READ_WRITE_TOKEN: token } = process.env;
  if (!origin || !client?.trim() || !secret?.trim() || !owner || !/^[1-9]\d*$/.test(owner) || !token?.trim()) return null;
  try { const u = new URL(origin); if (u.protocol !== 'https:' || u.origin !== origin) return null; } catch { return null; }
  return { origin, client, secret, owner, token };
}
type Env = NonNullable<ReturnType<typeof environment>>;
function signed(name: string, value: string, env: Env) {
  return createHmac('sha256', env.secret).update(name + '\n' + env.origin + '\n' + value).digest('base64url');
}
function cookie(name: string, claim: Record<string, unknown> | null, ttl: number, env: Env) {
  const body = claim ? Buffer.from(JSON.stringify({ ...claim, exp: clock() + ttl })).toString('base64url') : '';
  const value = claim ? body + '.' + signed(name, body, env) : '';
  return name + '=' + value + '; Path=/; Max-Age=' + ttl + '; HttpOnly; Secure; SameSite=Lax';
}
function readCookie(req: any, name: string, env: Env) {
  const str = req.headers.cookie;
  if (typeof str !== 'string' || str.length > 32768) return null;
  const matches = str.split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const val = matches[0].slice(name.length + 1);
  if (!/^[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{43}$/.test(val)) return null;
  const [body, sig] = val.split('.');
  if (!eq(sig, signed(name, body, env))) return null;
  try { const claim = JSON.parse(Buffer.from(body, 'base64url').toString()); return obj(claim) && uint(claim.exp) && claim.exp > clock() ? claim : null; } catch { return null; }
}
const callbackURI = (env: Env) => env.origin + '/api/cloud?action=callback';
function redirect(res: any, url: string) { res.statusCode = 302; res.setHeader('Location', url); res.end(); }
function login(res: any, env: Env) {
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  const args = new URLSearchParams({ client_id: env.client, redirect_uri: callbackURI(env), state, scope: '',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  res.setHeader('Set-Cookie', cookie(FLOW, { state, verifier }, 600, env));
  redirect(res, 'https://github.com/login/oauth/authorize?' + args);
}
async function callback(req: any, res: any, url: URL, env: Env) {
  const clear = cookie(FLOW, null, 0, env);
  res.setHeader('Set-Cookie', clear);
  try {
    const claim = readCookie(req, FLOW, env), states = url.searchParams.getAll('state'), codes = url.searchParams.getAll('code');
    if (!claim || typeof claim.state !== 'string' || typeof claim.verifier !== 'string' || states.length !== 1 || states[0].length !== 43 || !eq(states[0], claim.state) || codes.length !== 1 || !codes[0] || codes[0].length > 512 || url.searchParams.has('error')) throw new Error();
    const tokenReply = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' }, body: new URLSearchParams({ client_id: env.client, client_secret: env.secret, code: codes[0], redirect_uri: callbackURI(env), code_verifier: claim.verifier }) });
    if (!tokenReply.ok) throw new Error();
    const result = await tokenReply.json();
    if (typeof result.access_token !== 'string' || !result.access_token || result.scope) throw new Error();
    const userReply = await fetch('https://api.github.com/user', { redirect: 'error', signal: AbortSignal.timeout(8000), headers: {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + result.access_token, 'User-Agent': 'esliving-daily-private-backup' } });
    if (!userReply.ok) throw new Error();
    const user = await userReply.json();
    if (!Number.isSafeInteger(user.id) || String(user.id) !== env.owner) throw new Error();
    res.setHeader('Set-Cookie', [clear, cookie(SESSION, { owner: env.owner }, 7 * 86400, env)]);
    redirect(res, env.origin + '/');
  } catch { redirect(res, env.origin + '/?cloud_error=auth_failed'); }
}

async function compressedBody(req: any): Promise<Buffer> {
  if (typeof req.headers['content-type'] !== 'string' || req.headers['content-type'].split(';')[0].trim().toLowerCase() !== 'application/octet-stream' || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) fail(415, 'octet_stream_required');
  if (Number(req.headers['content-length']) > MAX_BYTES) fail(413, 'backup_too_large');
  if (req.body instanceof Uint8Array) {
    if (req.body.byteLength > MAX_BYTES) fail(413, 'backup_too_large');
    return Buffer.from(req.body.buffer, req.body.byteOffset, req.body.byteLength);
  }
  if (req.body != null || typeof req[Symbol.asyncIterator] !== 'function') fail(400, 'invalid_upload');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    if (!(chunk instanceof Uint8Array)) fail(400, 'invalid_upload');
    size += chunk.byteLength; if (size > MAX_BYTES) fail(413, 'backup_too_large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}
function validate(bytes: Buffer) {
  const invalid = (): never => fail(422, 'invalid_backup');
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) return invalid();
  try {
    const envelope = JSON.parse(text.decode(gunzipSync(bytes, { maxOutputLength: MAX_RAW })));
    if (!obj(envelope) || envelope.format !== 'seller-settlement-raw-backup' || envelope.version !== 1 || typeof envelope.payload !== 'string' || typeof envelope.sha256 !== 'string' || !digest.test(envelope.sha256) || hash(envelope.payload) !== envelope.sha256) return invalid();
    const p = JSON.parse(envelope.payload);
    if (!obj(p) || typeof p.capturedAt !== 'string' || !Number.isFinite(Date.parse(p.capturedAt)) || typeof p.origin !== 'string' || !p.origin || !obj(p.counts) || !obj(p.raw)) return invalid();
    const { localStorage: ls, indexedDB: db } = p.raw;
    if (!obj(ls) || !obj(db) || typeof db.present !== 'boolean' || !Array.isArray(db.entries) || (!db.present && db.entries.length)) return invalid();
    if (!Object.values(ls).every(v => v === null || typeof v === 'string')) return invalid();
    const check = (idx: number, v: any) => {
      if (idx === 2) { if (!obj(v)) return invalid(); return 0; }
      if (!Array.isArray(v) || !v.every(obj)) return invalid();
      return v.length;
    };
    const local = KEYS.map((key, idx) => {
      if (!Object.hasOwn(ls, key)) return invalid();
      return ls[key] === null ? 0 : check(idx, JSON.parse(ls[key]));
    });
    const idb = [0, 0, 0], seen = new Set<number>();
    for (const e of db.entries) {
      if (!obj(e) || !Object.hasOwn(e, 'key') || e.key === null || !Object.hasOwn(e, 'value')) return invalid();
      const index = KEYS.indexOf(e.key); if (index < 0) continue;
      if (seen.has(index)) return invalid();
      seen.add(index); idb[index] = check(index, e.value);
    }
    const maximum = Math.max(local[0], idb[0]);
    if (!maximum || (Object.hasOwn(p.counts, 'displayedOrders') && (!uint(p.counts.displayedOrders) || p.counts.displayedOrders > maximum))) return invalid();
    return { originalPayloadSha256: envelope.sha256 as string, counts: { localStorageOrders: local[0], indexedDBOrders: idb[0], localStorageCosts: local[1], indexedDBCosts: idb[1] } };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE') fail(413, 'backup_too_large');
    return invalid();
  }
}

// All reads derive their path here, never from a client or a stored URL.
async function readPrivate(path: string, limit: number, env: Env) {
  const entry = await get(path, { access: 'private', token: env.token, useCache: false });
  if (!entry) throw new Failure(404, 'snapshot_not_found');
  if (entry.statusCode !== 200 || !entry.stream || entry.blob.pathname !== path) throw new Failure(502, 'storage_read_failed');
  const reader = entry.stream.getReader(); let size = 0;
  const chunks: Buffer[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Failure(502, 'storage_integrity_failed'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
async function readManifest(id: string, env: Env) {
  const bytes = await readPrivate(manifestPath(id), MAX_MANIFEST, env);
  const bad = (): never => fail(502, 'invalid_manifest');
  let m: any; try { m = JSON.parse(text.decode(bytes)); } catch { return bad(); }
  if (!obj(m) || m.id !== id || typeof m.createdAt !== 'string' || !Number.isFinite(Date.parse(m.createdAt)) || new Date(m.createdAt).toISOString() !== m.createdAt ||
      typeof m.sha256 !== 'string' || !digest.test(m.sha256) || typeof m.originalPayloadSha256 !== 'string' || !digest.test(m.originalPayloadSha256) ||
      !uint(m.size) || m.size === 0 || m.size > MAX_BYTES || !obj(m.counts)) return bad();
  const { localStorageOrders, indexedDBOrders, localStorageCosts, indexedDBCosts } = m.counts;
  if (![localStorageOrders, indexedDBOrders, localStorageCosts, indexedDBCosts].every(uint) || Math.max(localStorageOrders, indexedDBOrders) === 0) return bad();
  return { id, createdAt: m.createdAt, counts: { localStorageOrders, indexedDBOrders, localStorageCosts, indexedDBCosts }, sha256: m.sha256, size: m.size, originalPayloadSha256: m.originalPayloadSha256 };
}
async function upload(req: any, env: Env) {
  const bytes = await compressedBody(req), validated = validate(bytes), id = randomUUID();
  const manifest = { id, createdAt: new Date().toISOString(), ...validated, sha256: hash(bytes), size: bytes.length };
  const options = { access: 'private' as const, token: env.token, addRandomSuffix: false, allowOverwrite: false };
  await put(dataPath(id), bytes, { ...options, contentType: 'application/octet-stream' });
  // A payload without a published manifest is not a completed backup. Never delete it.
  try {
    const copy = await readPrivate(dataPath(id), bytes.length, env);
    if (copy.length !== bytes.length || hash(copy) !== manifest.sha256) throw new Error();
  } catch { throw new Failure(502, 'snapshot_unpublished'); }
  try {
    await put(manifestPath(id), JSON.stringify(manifest), { ...options, contentType: 'application/json' });
  } catch { throw new Failure(502, 'snapshot_publish_unconfirmed'); }
  return manifest;
}
async function recent(env: Env) {
  const candidates: { id: string; uploaded: number }[] = [];
  let cursor: string | undefined, seen = 0, pages = 0;
  do {
    if (++pages > 10) fail(503, 'manifest_scan_limit');
    const batch = await list({ prefix: PREFIX, limit: 1000, cursor, token: env.token });
    seen += batch.blobs.length; if (seen > 10000) fail(503, 'manifest_scan_limit');
    for (const blob of batch.blobs) {
      if (!blob.pathname.startsWith(PREFIX) || !blob.pathname.endsWith('.json')) continue;
      const id = blob.pathname.slice(PREFIX.length, -5);
      if (!uuid.test(id)) continue;
      const uploaded = new Date(blob.uploadedAt).getTime();
      if (!Number.isFinite(uploaded)) fail(502, 'invalid_manifest');
      candidates.push({ id, uploaded });
    }
    candidates.sort((a, b) => b.uploaded - a.uploaded || b.id.localeCompare(a.id));
    if (candidates.length > 20) candidates.length = 20;
    if (!batch.hasMore) break;
    if (!batch.cursor || batch.cursor === cursor) fail(502, 'storage_read_failed');
    cursor = batch.cursor;
  } while (cursor);
  const manifests = await Promise.all(candidates.map(({ id }) => readManifest(id, env)));
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
const methods = new Map([['login', 'GET'], ['callback', 'GET'], ['session', 'GET'], ['logout', 'POST'], ['list', 'GET'], ['upload', 'POST'], ['download', 'GET']]);
function json(res: any, status: number, data: unknown) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); }
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const url = new URL(req.url || '/', 'https://internal.invalid'), actions = url.searchParams.getAll('action');
    const action = actions.length === 1 ? actions[0] : '', method = methods.get(action);
    if (!method) return json(res, 404, { error: 'unknown_action' });
    if (req.method !== method) { res.setHeader('Allow', method); return json(res, 405, { error: 'method_not_allowed' }); }
    const env = environment();
    if (!env) return json(res, action === 'session' ? 200 : 503, { configured: false, authenticated: false, ...(action === 'session' ? {} : { error: 'not_configured' }) });
    if (action === 'login') return login(res, env);
    if (action === 'callback') return await callback(req, res, url, env);
    const authenticated = readCookie(req, SESSION, env)?.owner === env.owner;
    if (action === 'session') return json(res, 200, { configured: true, authenticated });
    if (!authenticated) return json(res, 401, { error: 'authentication_required' });
    if (method === 'POST' && req.headers.origin !== env.origin) return json(res, 403, { error: 'origin_denied' });
    if (action === 'logout') { res.setHeader('Set-Cookie', [cookie(SESSION, null, 0, env), cookie(FLOW, null, 0, env)]); return json(res, 200, { authenticated: false }); }
    if (action === 'upload') return json(res, 201, { snapshot: await upload(req, env) });
    if (action === 'list') return json(res, 200, { snapshots: await recent(env) });
    const ids = url.searchParams.getAll('id');
    if (ids.length !== 1 || !uuid.test(ids[0])) return json(res, 400, { error: 'invalid_snapshot_id' });
    const manifest = await readManifest(ids[0], env), bytes = await readPrivate(dataPath(manifest.id), manifest.size, env);
    if (bytes.length !== manifest.size || hash(bytes) !== manifest.sha256) fail(502, 'storage_integrity_failed');
    res.statusCode = 200; res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Content-Length', bytes.length); res.setHeader('x-backup-sha256', manifest.sha256); res.end(bytes);
  } catch (e) { return json(res, e instanceof Failure ? e.status : 502, { error: e instanceof Failure ? e.message : 'cloud_unavailable' }); }
}
