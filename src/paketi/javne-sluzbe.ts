// Paket pravila za javne službe.
// Izvori: Uredba o postupku, kriterijima i načinu ocjenjivanja rada zaposlenih u javnim službama
// (NN 127/24) i Zakon o plaćama u državnoj službi i javnim službama (NN 155/23).
import type { z } from 'zod';
import { type Paket, PaketS } from './tipovi';

const U = (clanak: string) => ({ propis: 'NN 127/24-2099', clanak });
const Z = (clanak: string) => ({ propis: 'NN 155/23-2359', clanak });

const podaci: z.input<typeof PaketS> = {
  oznaka: 'hr-javne-sluzbe',
  verzija: '1.0.0',
  naziv: 'Ocjenjivanje rada zaposlenih u javnim službama',
  propisi: [
    { oznaka: 'NN 127/24-2099', naziv: 'Uredba o postupku, kriterijima i načinu ocjenjivanja rada zaposlenih u javnim službama' },
    { oznaka: 'NN 155/23-2359', naziv: 'Zakon o plaćama u državnoj službi i javnim službama' },
  ],
  // Ocjene: Zakon čl. 10. st. 2.; bodovi: Zakon čl. 19. st. 2.–5.
  ocjene: [
    { kljuc: 'izvrstan', naziv: 'izvrstan', rang: 5, bodovi: 6 },
    { kljuc: 'narocito-uspjesan', naziv: 'naročito uspješan', rang: 4, bodovi: 4 },
    { kljuc: 'uspjesan', naziv: 'uspješan', rang: 3, bodovi: 2 },
    { kljuc: 'zadovoljava', naziv: 'zadovoljava', rang: 2, bodovi: 0 },
    { kljuc: 'ne-zadovoljava', naziv: 'ne zadovoljava', rang: 1, bodovi: 0 },
  ],
  kriteriji: [
    { kljuc: 'ucinkovitost', naziv: 'Učinkovitost u obavljanju poslova', skupina: 'opci', izvor: U('19. st. 2.') },
    { kljuc: 'pouzdanost', naziv: 'Pouzdanost u obavljanju poslova', skupina: 'opci', izvor: U('19. st. 2.') },
    { kljuc: 'pravovremenost', naziv: 'Pravovremenost izvršavanja poslova', skupina: 'opci', izvor: U('19. st. 2.') },
    { kljuc: 'odnos-obveze', naziv: 'Odnos prema radnim obvezama', skupina: 'odnos-prema-radu', izvor: U('21.') },
    { kljuc: 'odnos-korisnici', naziv: 'Odnos prema korisnicima odnosno primateljima usluga', skupina: 'odnos-prema-radu', izvor: U('21.') },
    { kljuc: 'odnos-nadredeni', naziv: 'Odnos prema nadređenima', skupina: 'odnos-prema-radu', izvor: U('21.') },
    { kljuc: 'odnos-podredeni', naziv: 'Odnos prema podređenima', skupina: 'odnos-prema-radu', izvor: U('21.') },
    { kljuc: 'odnos-zaposlenici', naziv: 'Odnos prema drugim zaposlenicima', skupina: 'odnos-prema-radu', izvor: U('21.') },
    { kljuc: 'celnik-organizacija', naziv: 'Organizacija i upravljanje poslovima', skupina: 'celnik', izvor: U('23.') },
    { kljuc: 'celnik-odluke', naziv: 'Sposobnost u donošenju odluka', skupina: 'celnik', izvor: U('23.') },
    { kljuc: 'celnik-motiviranje', naziv: 'Sposobnost motiviranja zaposlenika', skupina: 'celnik', izvor: U('23.') },
    { kljuc: 'celnik-procedure', naziv: 'Sposobnost uspostave procedura rada i nadzora nad izvršenjem', skupina: 'celnik', izvor: U('23.') },
    { kljuc: 'celnik-djelotvornost', naziv: 'Djelotvornost rada', skupina: 'celnik', izvor: U('23.') },
  ],
  skupineZaSve: ['opci', 'odnos-prema-radu'],
  koraci: [
    {
      kljuc: 'samoprocjena',
      naziv: 'Samoprocjena',
      vrsta: 'obrazac',
      izvrsitelj: 'zaposlenik',
      rok: { vrsta: 'datum', mjesec: 1, dan: 15, godinaPomak: 1 },
      neobavezno: true,
      izvor: U('5. st. 2.'),
    },
    {
      kljuc: 'prijedlog',
      naziv: 'Izvješće i prijedlog ocjene',
      vrsta: 'prijedlog',
      izvrsitelj: 'nadredeni',
      rok: { vrsta: 'datum', mjesec: 1, dan: 31, godinaPomak: 1 },
      izvor: U('8. st. 1.'),
    },
    {
      kljuc: 'uvid',
      naziv: 'Uvid zaposlenika u prijedlog ocjene',
      vrsta: 'uvid',
      izvrsitelj: 'zaposlenik',
      rok: { vrsta: 'datum', mjesec: 1, dan: 31, godinaPomak: 1 },
      izvor: U('8. st. 2.'),
    },
    {
      kljuc: 'ocitovanje',
      naziv: 'Očitovanje zaposlenika',
      vrsta: 'odgovor-u-roku',
      izvrsitelj: 'zaposlenik',
      rok: { vrsta: 'od-koraka', korak: 'uvid', dana: 8 },
      neobavezno: true,
      izvor: U('8. st. 3.'),
    },
    {
      kljuc: 'konacni-prijedlog',
      naziv: 'Konačni prijedlog ocjene',
      vrsta: 'odluka-tijela',
      izvrsitelj: 'tijelo:povjerenstvo',
      rok: { vrsta: 'kraj-mjeseca', mjesec: 2, godinaPomak: 1 },
      izvor: U('9. st. 1. i 2.'),
    },
    {
      kljuc: 'uvid-konacnog',
      naziv: 'Uvid zaposlenika u konačni prijedlog',
      vrsta: 'uvid',
      izvrsitelj: 'zaposlenik',
      rok: { vrsta: 'kraj-mjeseca', mjesec: 2, godinaPomak: 1 },
      uvjet: { vrsta: 'razlikuje-se', korak: 'konacni-prijedlog', od: 'prijedlog' },
      izvor: U('9. st. 5.'),
    },
    {
      kljuc: 'misljenje-odbora',
      naziv: 'Obvezujuće mišljenje Odbora',
      vrsta: 'odluka-tijela',
      izvrsitelj: 'tijelo:odbor',
      rok: { vrsta: 'od-koraka', korak: 'konacni-prijedlog', dana: 8 },
      uvjet: { vrsta: 'ocjena-medu', korak: 'konacni-prijedlog', ocjene: ['izvrstan', 'narocito-uspjesan'] },
      izvor: U('15. st. 5. i 8.'),
    },
    {
      kljuc: 'odluka',
      naziv: 'Odluka o ocjeni',
      vrsta: 'odluka-pojedinca',
      izvrsitelj: 'odlucitelj',
      rok: { vrsta: 'datum', mjesec: 3, dan: 15, godinaPomak: 1 },
      izvor: U('16. st. 1. i 2.'),
    },
    { kljuc: 'dostava', naziv: 'Dostava odluke zaposleniku', vrsta: 'dostava', izvrsitelj: 'kadrovska', izvor: U('16. st. 5.') },
    {
      kljuc: 'unos-u-registar',
      naziv: 'Unos ocjene u Registar zaposlenih',
      vrsta: 'vanjska-radnja',
      izvrsitelj: 'kadrovska',
      izvor: U('16. st. 6.'),
    },
  ],
  tijela: [
    { kljuc: 'povjerenstvo', naziv: 'Povjerenstvo za predlaganje konačne ocjene', najmanjeClanova: 5, neparanBroj: true, predstavnikRadnika: true, izvor: U('7. st. 3.') },
    { kljuc: 'odbor', naziv: 'Odbor za preispitivanje prijedloga ocjene', najmanjeClanova: 3, neparanBroj: true, predstavnikRadnika: true, izvor: U('15. st. 2.') },
  ],
  kvote: [
    { ocjena: 'izvrstan', udio: 0.05, izvor: Z('29. st. 1.') },
    { ocjena: 'narocito-uspjesan', udio: 0.15, izvor: Z('29. st. 2.') },
  ],
  kvotaDan: { mjesec: 12, dan: 31, izvor: Z('29. st. 3.') },
  upozorenje: { ocjena: 'ne-zadovoljava', najkasnije: { mjesec: 9, dan: 30 }, izvor: U('14. st. 1.') },
  pravoNaOcjenu: { najmanjeMjeseci: 6, izvor: U('16. st. 3.') },
  odsutnost: { osnove: ['rodiljne-i-roditeljske-potpore'], duzeOdMjeseci: 6, ocjena: 'uspjesan', izvor: U('17. st. 2.') },
  odluka: { korak: 'odluka', temelj: ['misljenje-odbora', 'konacni-prijedlog'], izvor: U('16. st. 1.') },
};

export const javneSluzbe: Paket = PaketS.parse(podaci);
