import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { provjeriLanac, zabiljezi } from '../src/lib/revizija';
import { testnaBaza } from './pomoc';

let t: Awaited<ReturnType<typeof testnaBaza>>;
beforeAll(async () => {
  t = await testnaBaza();
});
afterAll(() => t.zatvori());

describe('revizijski trag', () => {
  it('niže zapise u lanac koji prolazi provjeru', async () => {
    expect(await zabiljezi(t.db, { radnja: 'test.prvi' })).toBe(1);
    expect(await zabiljezi(t.db, { radnja: 'test.drugi', prije: { a: 1 }, poslije: { a: 2 } })).toBe(2);
    expect(await provjeriLanac(t.db)).toEqual({ ispravno: true, zapisa: 2 });
  });

  it('istodobni upisi dobivaju različite redne brojeve', async () => {
    const brojevi = await Promise.all(
      Array.from({ length: 6 }, (_, i) => zabiljezi(t.db, { radnja: `test.istodobno.${i}` })),
    );
    expect(new Set(brojevi).size).toBe(6);
    expect((await provjeriLanac(t.db)).ispravno).toBe(true);
  });

  it('baza odbija izmjenu i brisanje zapisa', async () => {
    await expect(t.d1.prepare("UPDATE revizija SET radnja = 'x' WHERE rb = 1").run()).rejects.toThrow(/ne mogu mijenjati/);
    await expect(t.d1.prepare('DELETE FROM revizija WHERE rb = 1').run()).rejects.toThrow(/ne mogu brisati/);
  });

  it('provjera otkriva izmjenu učinjenu mimo zaštite', async () => {
    await t.d1.prepare('DROP TRIGGER revizija_bez_izmjene').run();
    await t.d1.prepare("UPDATE revizija SET radnja = 'krivotvoreno' WHERE rb = 2").run();
    expect(await provjeriLanac(t.db)).toMatchObject({ ispravno: false, prekidNa: 2 });
  });
});
