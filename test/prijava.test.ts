import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { racun, revizija } from '../src/db/shema';
import { noviId } from '../src/lib/id';
import { potvrdiDrugiFaktor, potvrdiKod, pripremiDrugiFaktor, zatraziKod } from '../src/lib/prijava/prijava';
import { NEAKTIVNOST_MINUTA, ucitajSjednicu } from '../src/lib/prijava/sjednica';
import { kodZaKorak, vremenskiKorak } from '../src/lib/prijava/totp';
import { provjeriLanac } from '../src/lib/revizija';
import { testnaBaza, testnoOkruzenje } from './pomoc';

let t: Awaited<ReturnType<typeof testnaBaza>>;
let o: ReturnType<typeof testnoOkruzenje>;
const sada = new Date('2026-12-01T09:00:00Z');
const kasnije = (minuta: number) => new Date(sada.getTime() + minuta * 60_000);

async function noviRacun(eposta: string, stanje: 'pozvan' | 'blokiran' = 'pozvan'): Promise<string> {
  const id = noviId(sada);
  await t.db.insert(racun).values({ id, eposta, stanje, stvoreno: sada.toISOString() });
  return id;
}

beforeAll(async () => {
  t = await testnaBaza();
  o = testnoOkruzenje(t.db);
});
afterAll(() => t.zatvori());

describe('prijava', () => {
  it('cijeli tijek: kod e-poštom, upis drugog faktora, potpuna sjednica', async () => {
    const id = await noviRacun('ana@primjer.hr');
    expect(await zatraziKod(o, ' Ana@Primjer.hr ', '10.0.0.1', sada)).toBe('poslano');
    expect(o.eposta.poruke).toHaveLength(1);

    const tokenPrvi = await potvrdiKod(o, 'ana@primjer.hr', o.eposta.zadnjiKod(), kasnije(1));
    expect(tokenPrvi).toBeTruthy();
    const prva = await ucitajSjednicu(t.db, tokenPrvi!, kasnije(1));
    expect(prva).toMatchObject({ racunId: id, razina: 'kod' });

    const upis = await pripremiDrugiFaktor(o, id);
    expect(upis?.adresa).toContain('otpauth://totp/');
    expect((await pripremiDrugiFaktor(o, id))?.tajna).toBe(upis!.tajna);

    const kod = await kodZaKorak(upis!.tajna, vremenskiKorak(kasnije(2)));
    const ishod = await potvrdiDrugiFaktor(o, prva!, kod, kasnije(2));
    expect(ishod).toHaveProperty('token');
    const token = (ishod as { token: string }).token;

    expect(await ucitajSjednicu(t.db, token, kasnije(3))).toMatchObject({ razina: 'potpuna' });
    expect(await ucitajSjednicu(t.db, tokenPrvi!, kasnije(3))).toBeNull();
    expect(await pripremiDrugiFaktor(o, id)).toBeNull();
    const [r] = await t.db.select().from(racun).where(eq(racun.id, id));
    expect(r?.stanje).toBe('aktivan');
    expect(r?.totpTajnaSifrirano).not.toContain(upis!.tajna);

    // Isti kod iz aplikacije ne vrijedi dvaput.
    const drugiToken = await (async () => {
      await zatraziKod(o, 'ana@primjer.hr', '10.0.0.1', kasnije(2));
      return potvrdiKod(o, 'ana@primjer.hr', o.eposta.zadnjiKod(), kasnije(2));
    })();
    const druga = await ucitajSjednicu(t.db, drugiToken!, kasnije(2));
    expect(await potvrdiDrugiFaktor(o, druga!, kod, kasnije(2))).toBe('odbijeno');
  });

  it('sjednica ističe nakon neaktivnosti i nakon najduljeg trajanja', async () => {
    const id = await noviRacun('boris@primjer.hr');
    await zatraziKod(o, 'boris@primjer.hr', '10.0.0.2', sada);
    const prvi = await potvrdiKod(o, 'boris@primjer.hr', o.eposta.zadnjiKod(), sada);
    const upis = await pripremiDrugiFaktor(o, id);
    const ishod = await potvrdiDrugiFaktor(
      o,
      (await ucitajSjednicu(t.db, prvi!, sada))!,
      await kodZaKorak(upis!.tajna, vremenskiKorak(sada)),
      sada,
    );
    const token = (ishod as { token: string }).token;

    expect(await ucitajSjednicu(t.db, token, kasnije(NEAKTIVNOST_MINUTA - 1))).not.toBeNull();
    // Aktivnost produljuje sjednicu, ali ne preko 12 sati.
    expect(await ucitajSjednicu(t.db, token, kasnije(2 * NEAKTIVNOST_MINUTA - 2))).not.toBeNull();
    expect(await ucitajSjednicu(t.db, token, kasnije(3 * NEAKTIVNOST_MINUTA))).toBeNull();

    let vrijeme = kasnije(0);
    const novi = async () => {
      await zatraziKod(o, 'boris@primjer.hr', '10.0.0.9', vrijeme);
      const p = await potvrdiKod(o, 'boris@primjer.hr', o.eposta.zadnjiKod(), vrijeme);
      vrijeme = new Date(vrijeme.getTime() + 60_000);
      const i = await potvrdiDrugiFaktor(
        o,
        (await ucitajSjednicu(t.db, p!, vrijeme))!,
        await kodZaKorak(upis!.tajna, vremenskiKorak(vrijeme)),
        vrijeme,
      );
      return (i as { token: string }).token;
    };
    const dugi = await novi();
    for (let m = 20; m < 12 * 60; m += 20) {
      expect(await ucitajSjednicu(t.db, dugi, new Date(vrijeme.getTime() + m * 60_000))).not.toBeNull();
    }
    expect(await ucitajSjednicu(t.db, dugi, new Date(vrijeme.getTime() + 12 * 3600_000))).toBeNull();
  });

  it('pogrešan kod se odbija, a nakon pet pokušaja ni ispravan više ne vrijedi', async () => {
    await noviRacun('cvita@primjer.hr');
    await zatraziKod(o, 'cvita@primjer.hr', '10.0.0.3', sada);
    const ispravan = o.eposta.zadnjiKod();
    const pogresan = ispravan === '00000000' ? '00000001' : '00000000';
    for (let i = 0; i < 5; i++) expect(await potvrdiKod(o, 'cvita@primjer.hr', pogresan, sada)).toBeNull();
    expect(await potvrdiKod(o, 'cvita@primjer.hr', ispravan, sada)).toBeNull();
  });

  it('kod ne vrijedi nakon isteka ni drugi put', async () => {
    await noviRacun('dino@primjer.hr');
    await zatraziKod(o, 'dino@primjer.hr', '10.0.0.4', sada);
    expect(await potvrdiKod(o, 'dino@primjer.hr', o.eposta.zadnjiKod(), kasnije(11))).toBeNull();
    await zatraziKod(o, 'dino@primjer.hr', '10.0.0.4', kasnije(12));
    const kod = o.eposta.zadnjiKod();
    expect(await potvrdiKod(o, 'dino@primjer.hr', kod, kasnije(13))).toBeTruthy();
    expect(await potvrdiKod(o, 'dino@primjer.hr', kod, kasnije(13))).toBeNull();
  });

  it('nepoznata adresa i blokiran račun daju isti ishod, bez poruke', async () => {
    await noviRacun('eva@primjer.hr', 'blokiran');
    const prije = o.eposta.poruke.length;
    expect(await zatraziKod(o, 'nitko@primjer.hr', '10.0.0.5', sada)).toBe('poslano');
    expect(await zatraziKod(o, 'eva@primjer.hr', '10.0.0.5', sada)).toBe('poslano');
    expect(o.eposta.poruke).toHaveLength(prije);
  });

  it('broj zahtjeva za kod je ograničen po adresi e-pošte', async () => {
    await noviRacun('franjo@primjer.hr');
    for (let i = 0; i < 5; i++) expect(await zatraziKod(o, 'franjo@primjer.hr', '10.0.0.6', sada)).toBe('poslano');
    expect(await zatraziKod(o, 'franjo@primjer.hr', '10.0.0.6', sada)).toBe('ograniceno');
    expect(await zatraziKod(o, 'franjo@primjer.hr', '10.0.0.6', kasnije(16))).toBe('poslano');
  });

  it('svaki korak prijave je u revizijskom tragu i lanac je ispravan', async () => {
    const radnje = (await t.db.select({ radnja: revizija.radnja }).from(revizija)).map((r) => r.radnja);
    for (const ocekivana of [
      'prijava.kod_poslan',
      'prijava.kod_potvrden',
      'prijava.kod_odbijen',
      'prijava.drugi_faktor_upisan',
      'prijava.drugi_faktor_odbijen',
    ]) {
      expect(radnje).toContain(ocekivana);
    }
    expect((await provjeriLanac(t.db)).ispravno).toBe(true);
  });
});
