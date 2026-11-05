// 계약 검증: 콘텐츠 3벌(원본·번들·static)과 계약 샘플 7개가 contract/*.schema.json 을 통과하는지.
// 스키마 밖 규칙(봉 길이·순서, 금지 표현, 키 꼴)은 python3 contract/scripts/validate.py 가 같이 봐요.
// 실패하면 종료 코드 1. 사용: npm run contract (프로젝트 루트)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const problems = [];
const ok = (label) => console.log(`  ok  ${label}`);
const fail = (label, errors) => {
  problems.push(label);
  console.error(`  FAIL ${label}`);
  for (const e of (errors ?? []).slice(0, 10)) console.error(`       ${e.instancePath || '/'} ${e.message}`);
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const SCHEMA = { content: 'content', symbols: 'content', universe: 'content', quotes: 'quotes', bars: 'bars', market: 'market', state: 'state' };
const v = {};
for (const name of new Set(Object.values(SCHEMA))) v[name] = ajv.compile(read(`contract/${name}.schema.json`));
const check = (kind, label, json) => (v[SCHEMA[kind]](json) ? ok(label) : fail(label, v[SCHEMA[kind]].errors));

console.log('정적 콘텐츠 (원본 · 번들 · static)');
for (const feed of ['symbols', 'universe', 'content']) {
  const copies = { [`content/${feed}.source.json`]: read(`content/${feed}.source.json`) };
  for (const p of [`client/src/content/${feed}.bundled.json`, `static/${feed}.json`]) {
    if (existsSync(resolve(root, p))) copies[p] = read(p);
    else fail(`${p} 없음 — npm run content`);
  }
  for (const [label, json] of Object.entries(copies)) check(feed, `${label} (contentVersion ${json.contentVersion})`, json);
  const texts = Object.values(copies).map((j) => JSON.stringify(j));
  if (texts.every((t) => t === texts[0])) ok(`${feed}: 원본·번들·static 이 같음`);
  else fail(`${feed}: 원본·번들·static 이 다름 — npm run content 로 다시 만들기`);
}

console.log('계약 샘플');
for (const kind of ['symbols', 'universe', 'content', 'quotes', 'bars', 'market', 'state']) {
  check(kind, `contract/samples/${kind}.sample.json`, read(`contract/samples/${kind}.sample.json`));
}

if (problems.length) {
  console.error(`\n계약 검증 실패 ${problems.length}건`);
  process.exit(1);
}
console.log('\n계약 검증 통과');
