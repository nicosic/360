// Zajedničke pomoćne funkcije skripti za upravljanje instancama.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KORIJEN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const POPIS = join(KORIJEN, 'instance');
const RADNA = join(KORIJEN, '.instance');

export function argumenti(argv = process.argv.slice(2)) {
  const izlaz = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Neočekivan argument: ${a}`);
    const ime = a.slice(2);
    const sljedeci = argv[i + 1];
    if (sljedeci === undefined || sljedeci.startsWith('--')) izlaz[ime] = true;
    else {
      izlaz[ime] = sljedeci;
      i++;
    }
  }
  return izlaz;
}

export function obvezno(arg, ime) {
  const v = arg[ime];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Nedostaje --${ime}`);
  return v.trim();
}

export function provjeriOznaku(oznaka) {
  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(oznaka)) {
    throw new Error('Oznaka: 3–32 znaka, mala slova, znamenke i crtica; počinje slovom.');
  }
  return oznaka;
}

export function verzijaKoda() {
  return JSON.parse(readFileSync(join(KORIJEN, 'package.json'), 'utf8')).version;
}

/** Pokreće naredbu. U probnom načinu je samo ispisuje. Vraća standardni izlaz. */
export function pokreni(naredba, argumentiNaredbe, { proba = false, ulaz, okolina, tiho = false } = {}) {
  const prikaz = [naredba, ...argumentiNaredbe].join(' ');
  if (proba) {
    console.log(`  [proba] ${prikaz}`);
    return '';
  }
  if (!tiho) console.log(`  $ ${prikaz}`);
  const ishod = spawnSync(naredba, argumentiNaredbe, {
    cwd: KORIJEN,
    input: ulaz,
    encoding: 'utf8',
    env: { ...process.env, ...okolina },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (ishod.status !== 0) {
    throw new Error(`Naredba nije uspjela (${ishod.status}): ${prikaz}\n${ishod.stdout ?? ''}`);
  }
  return ishod.stdout ?? '';
}

export const wrangler = (arg, opcije) => pokreni('npx', ['wrangler', ...arg], opcije);

export function putZapisa(oznaka) {
  return join(POPIS, `${oznaka}.json`);
}

export function ucitajZapis(oznaka) {
  const put = putZapisa(oznaka);
  if (!existsSync(put)) throw new Error(`Instanca '${oznaka}' nije u popisu (instance/${oznaka}.json).`);
  return JSON.parse(readFileSync(put, 'utf8'));
}

export function sviZapisi() {
  if (!existsSync(POPIS)) return [];
  return readdirSync(POPIS)
    .filter((d) => d.endsWith('.json'))
    .sort()
    .map((d) => JSON.parse(readFileSync(join(POPIS, d), 'utf8')));
}

export function spremiZapis(zapis) {
  mkdirSync(POPIS, { recursive: true });
  writeFileSync(putZapisa(zapis.oznaka), JSON.stringify(zapis, null, 2) + '\n');
}

/**
 * Izrađuje Wrangler konfiguraciju instance iz zapisa u popisu. Datoteka je izvedena
 * (mapa .instance/ nije u repozitoriju) i može se u svakom trenutku ponovno izraditi.
 */
export function napisiKonfiguraciju(zapis, { verzija = zapis.verzija } = {}) {
  const mapa = join(RADNA, zapis.oznaka);
  mkdirSync(mapa, { recursive: true });
  const put = join(mapa, 'wrangler.jsonc');
  const konfiguracija = {
    name: zapis.aplikacija,
    compatibility_date: '2026-11-01',
    compatibility_flags: ['nodejs_compat'],
    observability: { enabled: true },
    // Vlastita poddomena ako je zadana domena; inače adresa workers.dev (samo ispitne instance).
    ...(zapis.vlastitaDomena
      ? { routes: [{ pattern: zapis.adresa, custom_domain: true }], workers_dev: false }
      : { workers_dev: true }),
    d1_databases: [
      {
        binding: 'DB',
        database_name: zapis.baza.ime,
        database_id: zapis.baza.id,
        migrations_dir: '../../migrations',
      },
    ],
    r2_buckets: [{ binding: 'DOKUMENTI', bucket_name: zapis.spremiste, jurisdiction: 'eu' }],
    vars: {
      INSTANCA: zapis.oznaka,
      VERZIJA: verzija,
      EPOSTA_NACIN: zapis.epostaNacin,
      ISPITNA: zapis.ispitna ? 'da' : 'ne',
    },
  };
  writeFileSync(put, JSON.stringify(konfiguracija, null, 2) + '\n');
  return put;
}

/** Ključ: 10 znakova vremena + 16 nasumičnih, kao src/lib/id.ts. */
export function noviId() {
  const abeceda = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let vrijeme = Date.now();
  let prefiks = '';
  for (let i = 0; i < 10; i++) {
    prefiks = abeceda[vrijeme % 32] + prefiks;
    vrijeme = Math.floor(vrijeme / 32);
  }
  let sufiks = '';
  for (const b of crypto.getRandomValues(new Uint8Array(16))) sufiks += abeceda[b % 32];
  return prefiks + sufiks;
}

/** Naziv adrese workers.dev računa (npr. 'p360-hr'), preko Cloudflare API-ja. */
export async function poddomenaWorkersDev() {
  const racun = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!racun) throw new Error('CLOUDFLARE_ACCOUNT_ID nije postavljen.');
  const odgovor = await fetch(`https://api.cloudflare.com/client/v4/accounts/${racun}/workers/subdomain`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN ?? ''}` },
  });
  const naziv = (await odgovor.json())?.result?.subdomain;
  if (!naziv) throw new Error('Račun nema adresu workers.dev.');
  return naziv;
}

export function sqlTekst(vrijednost) {
  return `'${String(vrijednost).replace(/'/g, "''")}'`;
}
