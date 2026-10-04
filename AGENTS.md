# Top Montaža: kontekst za agente

Sajt firme za montažu nameštaja u Beogradu (kuhinje po meri, plakari po meri, montaža nameštaja). Vlasnik komunicira na srpskom (latinica), pa i odgovori i tekstovi na sajtu idu na srpskom.

## Gde živi

- Repo: `github.com/damdej/topmontaza`, grana `main`. Push na `main` odmah objavljuje sajt.
- Hosting: **Cloudflare Pages** (besplatno, objave ne troše kredite), projekat povezan sa repoom, adresa `topmontaza.pages.dev`. Domen `topmontaza.rs` je kupljen kod Web Hosting Srbija. Registar nema uređivanje zapisa, pa su nameserveri kod registra prebačeni na Cloudflare, a DNS zapisima se upravlja u Cloudflare-u.
- **Selidba sa Netlify-a je u toku.** Dok vlasnik ne potvrdi da je gotova, sajt je još na Netlify-u (`topmontaza.netlify.app`, nameserveri `dns1-4.p09.nsone.net`), a admin radi samo na Cloudflare Pages (`/api/admin`). Stanje po fazama je u `CLAUDE.local.md`. Kad je selidba gotova, obrisati ovu tačku i `netlify/` i `netlify.toml`.
- Telefon firme: 060 347 33 06 (Viber, WhatsApp, Instagram `@topmontaza`).

## Struktura

```
index.html                 samo HTML, JSON-LD (SEO) ostaje ovde
css/style.css              svi stilovi javnog sajta
js/main.js                 galerija: čita galerija.json, tabovi, strelice
galerija.json              kategorije i slike (Kuhinje, Plakari, Montaža, Ostalo)
slike/<kategorija>/        fotografije radova (kuhinje, plakari, montaza, ostalo); u slike/ samo og.jpg
admin/                     index.html, admin.css, admin.js (prijava i upload sa telefona)
functions/api/admin.js     Cloudflare Pages Function, adresa /api/admin: login, list, blob, commit, delete
_headers                   zaglavlja za /admin/* (noindex, no-cache)
netlify/, netlify.toml     stara Netlify funkcija i podešavanje, brišu se kad selidba bude gotova
robots.txt, sitemap.xml    adresa je https://topmontaza.rs
```

Ikonice, `logo.png` i `googlefcb6c6167a1d5591.html` (Google verifikacija) moraju ostati u korenu.

## Kako radi admin

- `/admin` traži lozinku (`ADMIN_PASSWORD`). Funkcija vraća potpisanu sesiju (HMAC, 30 dana) koja se čuva u `localStorage` pod ključem `tm_admin`.
- Slike se u browseru smanje na najviše 1600px (JPEG), šalju se jedna po jedna kao GitHub blob, pa se jednim commit-om upišu u `slike/<kategorija>/` i `galerija.json`. Brisanje je takođe jedan commit.
- Funkcija piše u GitHub preko `GITHUB_TOKEN`. Ostale promenljive (opciono): `GITHUB_REPO`, `GITHUB_BRANCH`. Koristi samo Web Crypto i `fetch` (nema Node modula), jer radi u Cloudflare Workers okruženju. Izvozi jedan `onRequest` koji sam proverava da je metoda POST.
- `ADMIN_PASSWORD` i `GITHUB_TOKEN` postoje samo u Cloudflare podešavanjima (Pages, Settings, Variables and Secrets, kao Secret). Nikad ih ne upisivati u repo, repo je javan.
- Nova slika se na sajtu pojavi tek posle Cloudflare Pages objave (oko minut). Admin to prikazuje kao „Objavljuje se“.
- Slike se serviraju direktno iz `slike/` (već su smanjene na 1600px), bez servisa za promenu veličine.

## Pravila

- Izgled javnog sajta (boje, fontovi, dugmad) ostaje isti. Boje i fontovi su u `:root` u `css/style.css`: akcenat `#ff6a13`, fontovi Barlow i Barlow Condensed.
- `galerija.json` ima format `{"kategorije":[{"naziv":"...","slike":[{"slika":"/slike/kuhinje/x.jpg","opis":"..."}]}]}`. Admin i `js/main.js` zavise od tog oblika i od tačnih naziva kategorija.
- Slike za sajt idu u `slike/<kategorija>/` sa imenima oblika `kategorija-beograd-opis-N.jpg` (SEO). Admin ih sam imenuje.
- `/admin/` je zabranjen u `robots.txt` i ima `noindex`. Tako treba da ostane.
- Commit i push radi samo na izričit zahtev vlasnika, jer push menja živi sajt.

## Lokalni test

Nema build koraka. Za brzu proveru izgleda: `python -m http.server 8765` u korenu (funkcija admin tada ne radi). Za funkciju sa pravim Cloudflare runtime-om: iz kopije projekta (da `.wrangler/` ne uđe u repo) `npx wrangler pages dev . --binding ADMIN_PASSWORD=x GITHUB_TOKEN=y`, pa `POST http://127.0.0.1:8788/api/admin`. Pun test prijave, uploada i brisanja je rađen protiv lažnog GitHub-a u memoriji (Node skripta koja zamenjuje `fetch` ka `api.github.com`), a pravi upis u repo nije probao nijedan agent dok vlasnik ne unese promenljive u Cloudflare.

## Otvoreno

- Završiti selidbu: Cloudflare Pages projekat, promenljive, DNS (zona `topmontaza.rs` sa TXT zapisom `google-site-verification=71PK2rBT1Z890u-0y7kGUk36ghHw7YnM8ZZwPzTGbsY`, koji ne sme da nestane), preusmeravanje `www.topmontaza.rs` na `topmontaza.rs`.
- Google Search Console: Domain property `topmontaza.rs` je verifikovan preko tog TXT zapisa. Posle selidbe ponovo poslati `https://topmontaza.rs/sitemap.xml`.
