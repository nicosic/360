import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';
import * as shema from './shema';

export type Baza = DrizzleD1Database<typeof shema>;

export function otvoriBazu(d1: D1Database): Baza {
  return drizzle(d1, { schema: shema });
}
