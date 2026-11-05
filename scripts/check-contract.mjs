// 계약 검증: 콘텐츠 3벌(원본·번들·static)과 계약 샘플 7개가 contract/*.schema.json 을 통과하는지 +
// 스키마 밖 규칙(봉 길이·순서, 키 꼴, 중복, 금지 표현, 시장 목록 순서 — contract/scripts/validate.py 와 같은 규칙, 6단계에서 옮겨 와 Node 하나로 끝나요).
// 바꿀 땐 validate.py 도 같이. 실패하면 종료 코드 1. 사용: npm run contract (프로젝트 루트)
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

// ---- 스키마 밖 규칙 (validate.py extra_rules 와 같음) ----
const msg = (list) => list.map((m) => ({ instancePath: '', message: m }));
function barsRules(name, b) {
  const n = b.t.length;
  if (b.c.length !== n || b.l.length !== n) return [`${name}: t·c·l 길이가 다름`];
  const errs = [];
  for (let i = 0; i + 1 < n; i++) if (b.t[i] >= b.t[i + 1]) { errs.push(`${name}: t 가 오름차순이 아님`); break; }
  for (let i = 0; i < n; i++) if (b.l[i] > b.c[i] + 1e-9) { errs.push(`${name}: 저가가 종가보다 큰 봉이 있음`); break; }
  if (b.high5y < Math.max(...b.c) - 1e-9) errs.push(`${name}: high5y 가 종가 최댓값보다 작음`);
  return errs;
}
/** 유효숫자 개수(0.00001234 → 4, 144085 → 6, 86.93000030517578 → 16) */
function sigDigits(x) {
  const [mant] = String(Math.abs(x)).split('e');
  const d = mant.replace('.', '').replace(/^0+/, '');
  return (mant.includes('.') ? d : d.replace(/0+$/, '')).length;
}
/** 가격은 서버가 반올림해 저장해요(server.md '값 반올림'): 부동소수 꼬리가 남은 값(유효숫자 10자리 넘음)은 실패 */
function digitsRule(name, values) {
  const long = values.find((x) => typeof x === 'number' && sigDigits(x) > 10);
  return long === undefined ? [] : [`${name}: 반올림 안 된 값 ${long}(유효숫자 10자리 넘음)`];
}
// 행동 지시 금지(출시 불가 6번). '과매도·과매수'는 구간 이름이라 허용 — 빼고 봐요
const BANNED = ['매수', '매도', '사세요', '파세요', '사야', '팔아야', '반등 가능성', '하락 가능성', '!'];
function extraRules(kind, doc) {
  const errs = [];
  if (kind === 'bars') {
    const keys = doc.map((r) => r.key);
    if (new Set(keys).size !== keys.length) errs.push('key 중복');
    for (const r of doc) {
      if (r.key !== `${r.symbol}|${r.interval}`) errs.push(`key 꼴이 '<symbol>|<interval>' 이 아님: ${r.key}`);
      errs.push(...barsRules(r.key, r), ...digitsRule(r.key, [...r.c, ...r.l, r.high5y]));
    }
  }
  if (kind === 'quotes') {
    const syms = doc.map((r) => r.symbol);
    if (new Set(syms).size !== syms.length) errs.push('symbol 중복');
    for (const r of doc) {
      if ((r.ext_session === null) !== (r.ext_price === null) || (r.ext_price === null) !== (r.ext_change_pct === null))
        errs.push(`${r.symbol}: ext_session·ext_price·ext_change_pct 는 함께 있거나 함께 없어야 함`);
      if (Math.abs((r.price / r.prev_close - 1) * 100 - r.change_pct) > 0.05) errs.push(`${r.symbol}: change_pct 가 price·prev_close 와 맞지 않음`);
      errs.push(...digitsRule(r.symbol, [r.price, r.prev_close, r.ext_price]));
    }
  }
  if (kind === 'market') {
    const rsis = Object.fromEntries(['kr', 'us'].flatMap((side) => doc.universe[side].map((r) => [r.symbol, r.rsi])));
    for (const s of doc.low) if (!(s in rsis) || rsis[s] === null || rsis[s] > 30) errs.push(`low 에 RSI ≤ 30 이 아닌 ${s}`);
    const sorted = [...doc.low].sort((a, b) => rsis[a] - rsis[b]);
    if (sorted.some((s, i) => s !== doc.low[i])) errs.push('low 가 RSI 낮은 순이 아님');
    for (const side of ['kr', 'us']) {
      const ranks = doc.universe[side].map((r) => r.rank);
      if (ranks.some((r, i) => r !== i + 1)) errs.push(`${side} rank 가 1부터 이어지지 않음`);
    }
  }
  if (kind === 'symbols') {
    const seen = new Set();
    for (const it of doc.items) {
      if (seen.has(it.s)) errs.push(`심볼 중복 ${it.s}`);
      seen.add(it.s);
    }
  }
  if (kind === 'content') {
    const keys = new Set(Object.keys(doc.glossary));
    for (const [k, g] of Object.entries(doc.glossary)) for (const r of g.related) if (!keys.has(r)) errs.push(`glossary ${k} → 없는 키 ${r}`);
    if (doc.zones.map((z) => z.key).join() !== 'vlow,low,mid,high') errs.push('zones 순서는 vlow·low·mid·high');
    const texts = [
      ...doc.zones.map((z) => [`zones ${z.key}`, z.body]),
      ...Object.entries(doc.glossary).map(([k, g]) => [`glossary ${k}`, g.body + (g.caution ?? '')]),
      ...doc.faq.map((f) => ['faq', f.a]),
      ['disclaimer', doc.disclaimer],
    ];
    for (const [where, text] of texts) {
      const t = text.replaceAll('과매도', '').replaceAll('과매수', '');
      for (const bad of BANNED) if (t.includes(bad)) errs.push(`${where} 에 금지 표현 '${bad}'`);
    }
  }
  if (kind === 'state') {
    const w = doc['palsal.watch.v1'].items;
    const ids = w.map((x) => x.id);
    if (new Set(ids).size !== ids.length) errs.push('watch id 중복');
    for (const x of w) if (x.id !== `${x.symbol}|${x.interval}`) errs.push(`watch id 꼴이 '<symbol>|<interval>' 이 아님: ${x.id}`);
    const known = new Set(ids);
    for (const c of doc['palsal.changes.v1']?.items ?? []) if (!known.has(c.watchId)) errs.push(`changes 에 담지 않은 ${c.watchId}`);
    for (const [k, val] of Object.entries(doc)) {
      if (!k.startsWith('palsal.bars.v1:')) continue;
      if (!known.has(k.split(':').slice(1).join(':'))) errs.push(`봉 저장 키 ${k} 가 담지 않은 종목`);
      errs.push(...barsRules(k, val));
    }
  }
  return errs;
}

const check = (kind, label, json) => {
  const schemaOk = v[SCHEMA[kind]](json);
  if (!schemaOk) return fail(label, v[SCHEMA[kind]].errors);
  const extra = extraRules(kind, json);
  return extra.length ? fail(`${label} — 스키마 밖 규칙`, msg(extra)) : ok(label);
};

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
