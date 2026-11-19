import { describe, expect, it } from 'vitest';
import { zbrojZapisa } from '../src/lib/revizija';
import { sqlZaAdministratora, zbrojZapisa as zbrojUSkripti } from '../scripts/prvi-administrator.mjs';

describe('skripte', () => {
  it('skripta računa kontrolni zbroj revizije jednako kao aplikacija', async () => {
    const zapis = {
      rb: 4,
      vrijeme: '2026-12-01T09:00:00.000Z',
      racunId: null,
      radnja: 'racun.stvoren_skriptom',
      predmetVrsta: 'racun',
      predmetId: 'ABC',
      prije: null,
      poslije: '{"uloga":"administrator"}',
      zbrojPrethodnog: 'f'.repeat(64),
    };
    expect(zbrojUSkripti(zapis)).toBe(await zbrojZapisa(zapis));
  });

  it('odbija adresu s navodnikom i uređuje velika slova', () => {
    expect(() => sqlZaAdministratora("a'b@primjer.hr")).toThrow();
    expect(sqlZaAdministratora(' Ana@Primjer.HR ')).toContain("'ana@primjer.hr'");
  });
});
