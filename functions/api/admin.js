// Admin API za galeriju (Cloudflare Pages Function, adresa /api/admin): login lozinkom, upload i brisanje slika.
// Slike i galerija.json se upisuju u GitHub repo, Cloudflare Pages zatim sam objavi sajt.
// Tajne su samo u Cloudflare promenljivama: ADMIN_PASSWORD i GITHUB_TOKEN.

const SESSION_DAYS = 30;
const MAX_IMAGE_B64 = 5 * 1024 * 1024;
const MAX_BATCH = 30;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function config(env) {
  const repo = env.GITHUB_REPO || 'damdej/topmontaza';
  return {
    token: env.GITHUB_TOKEN,
    api: 'https://api.github.com/repos/' + repo,
    branch: env.GITHUB_BRANCH || 'main',
  };
}

/* ---------- sesija ---------- */

const enc = new TextEncoder();

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(text))));
}

function hex(bytes) {
  return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Potpis je isti kao u staroj Netlify funkciji (HMAC-SHA256, ključ je SHA-256 od lozinka\ntoken),
// pa sesije koje su već u telefonu ostaju važeće.
async function sign(env, exp) {
  const key = await crypto.subtle.importKey(
    'raw', await sha256(env.ADMIN_PASSWORD + '\n' + env.GITHUB_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(exp)))));
}

async function safeEqual(a, b) {
  const x = await sha256(a);
  const y = await sha256(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function newSession(env) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return exp + '.' + await sign(env, exp);
}

async function validSession(env, token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  return Number(exp) > Date.now() && await safeEqual(sig, await sign(env, exp));
}

/* ---------- GitHub ---------- */

async function gh(c, path, options) {
  const o = options || {};
  const res = await fetch(c.api + path, {
    method: o.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + c.token,
      Accept: o.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'topmontaza-admin',
      'Content-Type': 'application/json',
    },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  if (!res.ok) {
    if (o.allow && o.allow.includes(res.status)) return null;
    const text = await res.text();
    console.error('GitHub', o.method || 'GET', path, res.status, text.slice(0, 300));
    const e = new HttpError(502, 'GitHub greška (' + res.status + '). Proverite GITHUB_TOKEN u Cloudflare podešavanjima.');
    e.github = res.status;
    throw e;
  }
  return o.raw ? res.text() : res.json();
}

async function head(c) {
  const ref = await gh(c, '/git/ref/heads/' + c.branch);
  const commit = await gh(c, '/git/commits/' + ref.object.sha);
  return { commit: ref.object.sha, tree: commit.tree.sha };
}

async function readGallery(c, ref) {
  const text = await gh(c, '/contents/galerija.json?ref=' + ref, { raw: true });
  const data = JSON.parse(text);
  if (!Array.isArray(data.kategorije)) data.kategorije = [];
  data.kategorije.forEach(function (k) { if (!Array.isArray(k.slike)) k.slike = []; });
  return data;
}

// Jedan commit za celu izmenu. Ako je grana u međuvremenu pomerena, pokušava ponovo.
async function commitChange(c, message, change) {
  for (let attempt = 0; ; attempt++) {
    const base = await head(c);
    const data = await readGallery(c, base.commit);
    const entries = await change(data, base);
    entries.push({ path: 'galerija.json', mode: '100644', type: 'blob', content: JSON.stringify(data, null, 1) + '\n' });
    const tree = await gh(c, '/git/trees', { method: 'POST', body: { base_tree: base.tree, tree: entries } });
    const commit = await gh(c, '/git/commits', { method: 'POST', body: { message: message, tree: tree.sha, parents: [base.commit] } });
    try {
      await gh(c, '/git/refs/heads/' + c.branch, { method: 'PATCH', body: { sha: commit.sha } });
      return data;
    } catch (e) {
      if (e.github !== 422 || attempt >= 2) throw e;
    }
  }
}

/* ---------- radnje ---------- */

function slug(text) {
  const map = { 'š': 's', 'đ': 'dj', 'č': 'c', 'ć': 'c', 'ž': 'z' };
  return String(text).toLowerCase().replace(/[šđčćž]/g, function (ch) { return map[ch]; })
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slika';
}

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

async function actionBlob(c, body) {
  const data = String(body.data || '');
  if (!data.startsWith('/9j/')) throw new HttpError(400, 'Slika mora biti JPEG.');
  if (data.length > MAX_IMAGE_B64) throw new HttpError(413, 'Slika je prevelika.');
  const blob = await gh(c, '/git/blobs', { method: 'POST', body: { content: data, encoding: 'base64' } });
  return { sha: blob.sha };
}

async function actionCommit(c, body) {
  const slike = Array.isArray(body.slike) ? body.slike : [];
  if (!slike.length || slike.length > MAX_BATCH) throw new HttpError(400, 'Pošaljite od 1 do ' + MAX_BATCH + ' slika odjednom.');
  slike.forEach(function (s) {
    if (!/^[0-9a-f]{40}$/.test(String(s.sha))) throw new HttpError(400, 'Neispravna slika.');
  });
  const naziv = String(body.kategorija || '');
  const folder = slug(naziv);
  const prefix = folder + '-beograd-' + stamp() + '-';

  const data = await commitChange(c, 'Admin: ' + slike.length + ' novih slika (' + naziv + ')', function (galerija) {
    const kat = galerija.kategorije.find(function (k) { return k.naziv === naziv; });
    if (!kat) throw new HttpError(400, 'Nepoznata kategorija.');
    const entries = [];
    const nove = slike.map(function (s, i) {
      const file = prefix + (i + 1) + '.jpg';
      entries.push({ path: 'slike/' + folder + '/' + file, mode: '100644', type: 'blob', sha: s.sha });
      const item = { slika: '/slike/' + folder + '/' + file };
      const opis = String(s.opis || '').trim().slice(0, 200);
      if (opis) item.opis = opis;
      return item;
    });
    kat.slike = nove.concat(kat.slike);
    return entries;
  });
  return { kategorije: data.kategorije };
}

async function actionDelete(c, body) {
  const slika = String(body.slika || '');
  if (!/^\/slike\/[a-z0-9-]+\/[^\/\\]+$/.test(slika)) throw new HttpError(400, 'Neispravna putanja slike.');
  const path = slika.slice(1);

  const data = await commitChange(c, 'Admin: obrisana slika ' + path, async function (galerija, base) {
    let found = false;
    galerija.kategorije.forEach(function (k) {
      const before = k.slike.length;
      k.slike = k.slike.filter(function (s) { return s.slika !== slika; });
      if (k.slike.length !== before) found = true;
    });
    if (!found) throw new HttpError(404, 'Slika nije u galeriji.');
    const exists = await gh(c, '/contents/' + encodeURI(path) + '?ref=' + base.commit, { allow: [404] });
    return exists ? [{ path: path, mode: '100644', type: 'blob', sha: null }] : [];
  });
  return { kategorije: data.kategorije };
}

// Jedna funkcija za sve metode (provera metode je ovde), da ne zavisi od redosleda onRequest* izvoza.
export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  if (request.method !== 'POST') return reply(405, { error: 'Samo POST.' });
  if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) {
    return reply(500, { error: 'Nisu podešene promenljive ADMIN_PASSWORD i GITHUB_TOKEN u Cloudflare-u.' });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return reply(400, { error: 'Neispravan zahtev.' });
  }
  if (!body || typeof body !== 'object') return reply(400, { error: 'Neispravan zahtev.' });

  try {
    if (body.action === 'login') {
      if (!await safeEqual(body.password, env.ADMIN_PASSWORD)) {
        await new Promise(function (r) { setTimeout(r, 800); });
        return reply(401, { error: 'Pogrešna lozinka.' });
      }
      return reply(200, { session: await newSession(env) });
    }

    const auth = request.headers.get('Authorization') || '';
    if (!await validSession(env, auth.replace(/^Bearer\s+/i, ''))) return reply(401, { error: 'Prijavite se ponovo.' });

    const c = config(env);
    if (body.action === 'list') return reply(200, { kategorije: (await readGallery(c, c.branch)).kategorije });
    if (body.action === 'blob') return reply(200, await actionBlob(c, body));
    if (body.action === 'commit') return reply(200, await actionCommit(c, body));
    if (body.action === 'delete') return reply(200, await actionDelete(c, body));
    return reply(400, { error: 'Nepoznata radnja.' });
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    console.error(e);
    return reply(500, { error: 'Greška na serveru.' });
  }
}
