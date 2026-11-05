// 서버 표 채우기 SQL 만들기: static/symbols.json → palsal_symbols(palsal_track 이 받는 심볼), static/universe.json → palsal_universe.
// 종목 목록·시총 목록을 바꿀 때마다 다시: node scripts/server-seed.mjs > /tmp/palsal-seed.sql && supabase db query --remote --yes -f /tmp/palsal-seed.sql
// 목록에서 빠진 심볼은 지우지 않아요(이미 쌓인 현재가·봉·지켜봐 줘가 참조할 수 있어서).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const SYMBOL = /^\^?[A-Z0-9.=-]{1,20}$/;
const q = (s) => {
  if (!SYMBOL.test(s) && !/^[0-9.-]+$/.test(s) && !/^[a-z]+$/.test(s)) throw new Error(`SQL 에 넣을 수 없는 값: ${s}`);
  return `'${s}'`;
};

const symbols = read('static/symbols.json');
const universe = read('static/universe.json');
const out = ['begin;'];
for (let i = 0; i < symbols.items.length; i += 1000) {
  const rows = symbols.items.slice(i, i + 1000).map((it) => `(${q(it.s)},${q(it.m === 'CRYPTO' ? 'CRYPTO' : it.m)})`);
  out.push(`insert into public.palsal_symbols (symbol, market) values ${rows.join(',')} on conflict (symbol) do update set market = excluded.market;`);
}
const known = new Set(symbols.items.map((it) => it.s));
const uni = [];
for (const side of ['kr', 'us']) {
  universe[side].forEach((s, i) => {
    if (!known.has(s)) throw new Error(`universe 의 ${s} 가 종목 목록에 없어요`);
    uni.push(`('${side}',${i + 1},${q(s)},'${universe.contentVersion.replace(/[^0-9.-]/g, '')}')`);
  });
}
out.push('delete from public.palsal_universe;');
out.push(`insert into public.palsal_universe (side, rank, symbol, version) values ${uni.join(',')};`);
out.push('commit;');
out.push(`select (select count(*) from public.palsal_symbols) as symbols, (select count(*) from public.palsal_universe) as universe;`);
process.stdout.write(out.join('\n') + '\n');
