// Admin API za galeriju: login lozinkom, upload i brisanje slika.
// Slike i galerija.json se upisuju u GitHub repo, Netlify zatim sam objavi sajt.
// Tajne su samo u Netlify promenljivama: ADMIN_PASSWORD i GITHUB_TOKEN.
const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'damdej/topmontaza';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com/repos/' + REPO;
const SESSION_DAYS = 30;
const MAX_IMAGE_B64 = 5 * 1024 * 1024;
const MAX_BATCH = 30;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function reply(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

/* ---------- sesija ---------- */

function sessionKey() {
  return crypto.createHash('sha256')
    .update(process.env.ADMIN_PASSWORD + '\n' + process.env.GITHUB_TOKEN).digest();
}
function sign(exp) {
  return crypto.createHmac('sha256', sessionKey()).update(String(exp)).digest('hex');
}
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function newSession() {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return exp + '.' + sign(exp);
}
function validSession(token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  return Number(exp) > Date.now() && safeEqual(sig, sign(exp));
}

/* ---------- GitHub ---------- */

async function gh(path, options) {
  const o = options || {};
  const res = await fetch(API + path, {
    method: o.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
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
    const e = new HttpError(502, 'GitHub greška (' + res.status + '). Proverite GITHUB_TOKEN u Netlify podešavanjima.');
    e.github = res.status;
    throw e;
  }
  return o.raw ? res.text() : res.json();
}

async function head() {
  const ref = await gh('/git/ref/heads/' + BRANCH);
  const commit = await gh('/git/commits/' + ref.object.sha);
  return { commit: ref.object.sha, tree: commit.tree.sha };
}

async function readGallery(ref) {
  const text = await gh('/contents/galerija.json?ref=' + ref, { raw: true });
  const data = JSON.parse(text);
  if (!Array.isArray(data.kategorije)) data.kategorije = [];
  data.kategorije.forEach(function (k) { if (!Array.isArray(k.slike)) k.slike = []; });
  return data;
}

// Jedan commit za celu izmenu. Ako je grana u međuvremenu pomerena, pokušava ponovo.
async function commitChange(message, change) {
  for (let attempt = 0; ; attempt++) {
    const base = await head();
    const data = await readGallery(base.commit);
    const entries = await change(data, base);
    entries.push({ path: 'galerija.json', mode: '100644', type: 'blob', content: JSON.stringify(data, null, 1) + '\n' });
    const tree = await gh('/git/trees', { method: 'POST', body: { base_tree: base.tree, tree: entries } });
    const commit = await gh('/git/commits', { method: 'POST', body: { message: message, tree: tree.sha, parents: [base.commit] } });
    try {
      await gh('/git/refs/heads/' + BRANCH, { method: 'PATCH', body: { sha: commit.sha } });
      return data;
    } catch (e) {
      if (e.github !== 422 || attempt >= 2) throw e;
    }
  }
}

/* ---------- radnje ---------- */

function slug(text) {
  const map = { 'š': 's', 'đ': 'dj', 'č': 'c', 'ć': 'c', 'ž': 'z' };
  return String(text).toLowerCase().replace(/[šđčćž]/g, function (c) { return map[c]; })
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slika';
}

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

async function actionBlob(body) {
  const data = String(body.data || '');
  if (!data.startsWith('/9j/')) throw new HttpError(400, 'Slika mora biti JPEG.');
  if (data.length > MAX_IMAGE_B64) throw new HttpError(413, 'Slika je prevelika.');
  const blob = await gh('/git/blobs', { method: 'POST', body: { content: data, encoding: 'base64' } });
  return { sha: blob.sha };
}

async function actionCommit(body) {
  const slike = Array.isArray(body.slike) ? body.slike : [];
  if (!slike.length || slike.length > MAX_BATCH) throw new HttpError(400, 'Pošaljite od 1 do ' + MAX_BATCH + ' slika odjednom.');
  slike.forEach(function (s) {
    if (!/^[0-9a-f]{40}$/.test(String(s.sha))) throw new HttpError(400, 'Neispravna slika.');
  });
  const naziv = String(body.kategorija || '');
  const prefix = slug(naziv) + '-beograd-' + stamp() + '-';

  const data = await commitChange('Admin: ' + slike.length + ' novih slika (' + naziv + ')', function (galerija) {
    const kat = galerija.kategorije.find(function (k) { return k.naziv === naziv; });
    if (!kat) throw new HttpError(400, 'Nepoznata kategorija.');
    const entries = [];
    const nove = slike.map(function (s, i) {
      const file = prefix + (i + 1) + '.jpg';
      entries.push({ path: 'slike/' + file, mode: '100644', type: 'blob', sha: s.sha });
      const item = { slika: '/slike/' + file };
      const opis = String(s.opis || '').trim().slice(0, 200);
      if (opis) item.opis = opis;
      return item;
    });
    kat.slike = nove.concat(kat.slike);
    return entries;
  });
  return { kategorije: data.kategorije };
}

async function actionDelete(body) {
  const slika = String(body.slika || '');
  if (!/^\/slike\/[^\/\\]+$/.test(slika)) throw new HttpError(400, 'Neispravna putanja slike.');
  const path = slika.slice(1);

  const data = await commitChange('Admin: obrisana slika ' + path, async function (galerija, base) {
    let found = false;
    galerija.kategorije.forEach(function (k) {
      const before = k.slike.length;
      k.slike = k.slike.filter(function (s) { return s.slika !== slika; });
      if (k.slike.length !== before) found = true;
    });
    if (!found) throw new HttpError(404, 'Slika nije u galeriji.');
    const exists = await gh('/contents/' + encodeURI(path) + '?ref=' + base.commit, { allow: [404] });
    return exists ? [{ path: path, mode: '100644', type: 'blob', sha: null }] : [];
  });
  return { kategorije: data.kategorije };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Samo POST.' });
  if (!process.env.ADMIN_PASSWORD || !process.env.GITHUB_TOKEN) {
    return reply(500, { error: 'Nisu podešene promenljive ADMIN_PASSWORD i GITHUB_TOKEN u Netlify-u.' });
  }

  let body;
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch (e) {
    return reply(400, { error: 'Neispravan zahtev.' });
  }

  try {
    if (body.action === 'login') {
      if (!safeEqual(body.password, process.env.ADMIN_PASSWORD)) {
        await new Promise(function (r) { setTimeout(r, 800); });
        return reply(401, { error: 'Pogrešna lozinka.' });
      }
      return reply(200, { session: newSession() });
    }

    const h = event.headers || {};
    const auth = h.authorization || h.Authorization || '';
    if (!validSession(auth.replace(/^Bearer\s+/i, ''))) return reply(401, { error: 'Prijavite se ponovo.' });

    if (body.action === 'list') return reply(200, { kategorije: (await readGallery(BRANCH)).kategorije });
    if (body.action === 'blob') return reply(200, await actionBlob(body));
    if (body.action === 'commit') return reply(200, await actionCommit(body));
    if (body.action === 'delete') return reply(200, await actionDelete(body));
    return reply(400, { error: 'Nepoznata radnja.' });
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    console.error(e);
    return reply(500, { error: 'Greška na serveru.' });
  }
};
