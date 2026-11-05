// 정적 콘텐츠 빌드: content/*.source.json → 계약 검사 + 문구 검사 → static/*.json + client/src/content/*.bundled.json
// 사용: npm run content (프로젝트 루트). 실패하면 종료 코드 1, 아무것도 쓰지 않아요.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const FEEDS = ['symbols', 'universe', 'content'];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(read('contract/content.schema.json'));

// 출시 불가 6번(종목 추천·투자 전략 안내) — 행동 지시·예측·과장 금지. '과매도·과매수'는 구간 이름이라 허용.
const BANNED = ['매수', '매도', '사세요', '파세요', '사야', '팔아야', '반등 가능성', '하락 가능성', '급등', '대박', '확실', '보장', '!'];
const EMOJI = /\p{Extended_Pictographic}/u;

function texts(feed, json) {
  if (feed !== 'content') return [];
  const out = [];
  if (json.notice) out.push(['notice', json.notice.text]);
  for (const z of json.zones) out.push([`zones.${z.key}`, z.body]);
  for (const h of json.howToRead) out.push([`howToRead.${h.title}`, `${h.title} ${h.body}`]);
  out.push(['fearGreed', `${json.fearGreed.title} ${json.fearGreed.body}`]);
  for (const f of json.faq) out.push([`faq.${f.q}`, `${f.q} ${f.a}`]);
  for (const [k, g] of Object.entries(json.glossary)) out.push([`glossary.${k}`, `${g.title} ${g.body} ${g.caution ?? ''}`]);
  out.push(['disclaimer', json.disclaimer]);
  return out;
}

const problems = [];
const built = {};
for (const feed of FEEDS) {
  const json = read(`content/${feed}.source.json`);
  if (json.kind !== feed) problems.push(`${feed}: kind 가 '${feed}' 가 아님`);
  if (!validate(json)) {
    for (const e of (validate.errors ?? []).slice(0, 8)) problems.push(`${feed}: ${e.instancePath || '/'} ${e.message}`);
  }
  for (const [where, text] of texts(feed, json)) {
    const t = text.replaceAll('과매도', '').replaceAll('과매수', '');
    for (const bad of BANNED) if (t.includes(bad)) problems.push(`${feed}.${where}: 금지 표현 '${bad}'`);
    if (EMOJI.test(text)) problems.push(`${feed}.${where}: 이모지`);
  }
  if (feed === 'content') {
    const keys = new Set(Object.keys(json.glossary));
    for (const [k, g] of Object.entries(json.glossary)) for (const r of g.related) if (!keys.has(r)) problems.push(`content.glossary.${k}: 없는 키 ${r}`);
  }
  if (feed === 'symbols') {
    const seen = new Set();
    for (const it of json.items) {
      if (seen.has(it.s)) problems.push(`symbols: 중복 ${it.s}`);
      seen.add(it.s);
    }
  }
  built[feed] = json;
}
if (!problems.length) {
  const known = new Set(built.symbols.items.map((it) => it.s));
  for (const side of ['kr', 'us']) for (const s of built.universe[side]) if (!known.has(s)) problems.push(`universe.${side}: symbols.json 에 없는 ${s}`);
}

if (problems.length) {
  console.error(`콘텐츠 검사 실패 ${problems.length}건`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

mkdirSync(resolve(root, 'static'), { recursive: true });
mkdirSync(resolve(root, 'client/src/content'), { recursive: true });
for (const feed of FEEDS) {
  const text = `${JSON.stringify(built[feed], null, 1)}\n`;
  writeFileSync(resolve(root, `static/${feed}.json`), text);
  writeFileSync(resolve(root, `client/src/content/${feed}.bundled.json`), text);
  console.log(`  ok  ${feed} (contentVersion ${built[feed].contentVersion}) → static/${feed}.json · client/src/content/${feed}.bundled.json`);
}
