-- Revizijski trag se samo dodaje: izmjenu i brisanje odbija sama baza.
CREATE TRIGGER revizija_bez_izmjene
BEFORE UPDATE ON revizija
BEGIN
  SELECT RAISE(ABORT, 'revizija: zapisi se ne mogu mijenjati');
END;
--> statement-breakpoint
CREATE TRIGGER revizija_bez_brisanja
BEFORE DELETE ON revizija
BEGIN
  SELECT RAISE(ABORT, 'revizija: zapisi se ne mogu brisati');
END;
