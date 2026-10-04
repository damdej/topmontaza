# Top Montaža: kontekst za agente

Sajt firme za montažu nameštaja u Beogradu (kuhinje po meri, plakari po meri, montaža nameštaja). Vlasnik komunicira na srpskom (latinica), pa i odgovori i tekstovi na sajtu idu na srpskom.

## Gde živi

- Repo: `github.com/damdej/topmontaza`, grana `main`. Push na `main` odmah objavljuje sajt (Netlify).
- Hosting: Netlify, `topmontaza.netlify.app`. Domen `topmontaza.rs` je kupljen kod Web Hosting Srbija, a nameserveri su prebačeni na Netlify DNS (`dns1-4.p09.nsone.net`). DNS zapisima se upravlja u Netlify-u, ne kod registra.
- Telefon firme: 060 347 33 06 (Viber, WhatsApp, Instagram `@topmontaza`).

## Struktura

```
index.html                 samo HTML, JSON-LD (SEO) ostaje ovde
css/style.css              svi stilovi javnog sajta
js/main.js                 galerija: čita galerija.json, tabovi, strelice
galerija.json              kategorije i slike (Kuhinje, Plakari, Montaža, Ostalo)
slike/<kategorija>/        fotografije radova (kuhinje, plakari, montaza, ostalo); u slike/ samo og.jpg
admin/                     index.html, admin.css, admin.js (prijava i upload sa telefona)
netlify/functions/admin.js API za admin: login, list, blob, commit, delete
netlify.toml               publish=".", functions="netlify/functions"
robots.txt, sitemap.xml    adresa je https://topmontaza.rs
```

Ikonice, `logo.png` i `googlefcb6c6167a1d5591.html` (Google verifikacija) moraju ostati u korenu.

## Kako radi admin

- `/admin` traži lozinku (`ADMIN_PASSWORD`). Funkcija vraća potpisanu sesiju (HMAC, 30 dana) koja se čuva u `localStorage` pod ključem `tm_admin`.
- Slike se u browseru smanje na najviše 1600px (JPEG), šalju se jedna po jedna kao GitHub blob, pa se jednim commit-om upišu u `slike/<kategorija>/` i `galerija.json`. Brisanje je takođe jedan commit.
- Funkcija piše u GitHub preko `GITHUB_TOKEN`. Ostale promenljive (opciono): `GITHUB_REPO`, `GITHUB_BRANCH`.
- `ADMIN_PASSWORD` i `GITHUB_TOKEN` postoje samo u Netlify podešavanjima (Environment variables). Nikad ih ne upisivati u repo, repo je javan.
- Nova slika se na sajtu pojavi tek posle Netlify deploy-a (oko minut). Admin to prikazuje kao „Objavljuje se“.

## Pravila

- Izgled javnog sajta (boje, fontovi, dugmad) ostaje isti. Boje i fontovi su u `:root` u `css/style.css`: akcenat `#ff6a13`, fontovi Barlow i Barlow Condensed.
- `galerija.json` ima format `{"kategorije":[{"naziv":"...","slike":[{"slika":"/slike/kuhinje/x.jpg","opis":"..."}]}]}`. Admin i `js/main.js` zavise od tog oblika i od tačnih naziva kategorija.
- Slike za sajt idu u `slike/<kategorija>/` sa imenima oblika `kategorija-beograd-opis-N.jpg` (SEO). Admin ih sam imenuje.
- `/admin/` je zabranjen u `robots.txt` i ima `noindex`. Tako treba da ostane.
- Commit i push radi samo na izričit zahtev vlasnika, jer push menja živi sajt.

## Lokalni test

Nema build koraka. Za brzu proveru: `python -m http.server 8765` u korenu (funkcija admin tada ne radi, pa se prijava ne može isprobati bez Netlify dev okruženja). Pun test prijave, uploada i brisanja je rađen protiv lažnog GitHub-a u memoriji, a pravi upis u repo nije probao nijedan agent dok vlasnik ne unese promenljive u Netlify.

## Otvoreno

- Sačekati propagaciju DNS-a za `topmontaza.rs` (do 48h), pa u Netlify-u proveriti HTTPS sertifikat.
- U Google Search Console dodati `topmontaza.rs` kao novi property.
- Opciono: u Netlify-u uključiti preusmeravanje `www.topmontaza.rs` na `topmontaza.rs`.
