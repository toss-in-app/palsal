#!/usr/bin/env python3
"""palsal 계약 v1 검사 — samples/*.json 을 스키마로 확인하고, 스키마 밖 규칙도 본다.
사용: python3 -m pip install jsonschema  &&  python3 scripts/validate.py [파일...]
인자가 없으면 samples/ 전부. 4단계에서 projects/palsal/contract/ 로 옮겨 정적 JSON·Worker 응답 검사에도 쓴다.
같은 규칙이 ../../scripts/check-contract.mjs(npm run contract)에도 있다(2026-11-05 6단계에서 옮김) — 바꾸면 둘 다.
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

HERE = Path(__file__).resolve().parent.parent
SCHEMAS = {
    'quotes': 'quotes.schema.json',
    'bars': 'bars.schema.json',
    'market': 'market.schema.json',
    'symbols': 'content.schema.json',
    'universe': 'content.schema.json',
    'content': 'content.schema.json',
    'state': 'state.schema.json',
}


def kind_of(path: Path) -> str:
    return path.name.split('.')[0]


def bars_rules(name: str, b: dict) -> list[str]:
    errs = []
    n = len(b['t'])
    if len(b['c']) != n or len(b['l']) != n:
        return [f'{name}: t·c·l 길이가 다름']
    if any(b['t'][i] >= b['t'][i + 1] for i in range(n - 1)):
        errs.append(f'{name}: t 가 오름차순이 아님')
    if any(b['l'][i] > b['c'][i] + 1e-9 for i in range(n)):
        errs.append(f'{name}: 저가가 종가보다 큰 봉이 있음')
    if b['high5y'] < max(b['c']) - 1e-9:
        errs.append(f'{name}: high5y 가 종가 최댓값보다 작음')
    return errs


def extra_rules(kind: str, doc) -> list[str]:
    errs = []
    if kind == 'bars':
        keys = [r['key'] for r in doc]
        if len(keys) != len(set(keys)):
            errs.append('key 중복')
        for r in doc:
            if r['key'] != f"{r['symbol']}|{r['interval']}":
                errs.append(f"key 꼴이 '<symbol>|<interval>' 이 아님: {r['key']}")
            errs += bars_rules(r['key'], r)
    if kind == 'quotes':
        syms = [r['symbol'] for r in doc]
        if len(syms) != len(set(syms)):
            errs.append('symbol 중복')
        for r in doc:
            if (r['ext_session'] is None) != (r['ext_price'] is None) or (r['ext_price'] is None) != (r['ext_change_pct'] is None):
                errs.append(f"{r['symbol']}: ext_session·ext_price·ext_change_pct 는 함께 있거나 함께 없어야 함")
            if abs((r['price'] / r['prev_close'] - 1) * 100 - r['change_pct']) > 0.05:
                errs.append(f"{r['symbol']}: change_pct 가 price·prev_close 와 맞지 않음")
    if kind == 'market':
        rsis = {r['symbol']: r['rsi'] for side in ('kr', 'us') for r in doc['universe'][side]}
        for s in doc['low']:
            if s not in rsis or rsis[s] is None or rsis[s] > 30:
                errs.append(f'low 에 RSI ≤ 30 이 아닌 {s}')
        if [s for s in doc['low']] != sorted(doc['low'], key=lambda s: rsis[s]):
            errs.append('low 가 RSI 낮은 순이 아님')
        for side in ('kr', 'us'):
            ranks = [r['rank'] for r in doc['universe'][side]]
            if ranks != list(range(1, len(ranks) + 1)):
                errs.append(f'{side} rank 가 1부터 이어지지 않음')
    if kind == 'symbols':
        seen = set()
        for it in doc['items']:
            if it['s'] in seen:
                errs.append(f"심볼 중복 {it['s']}")
            seen.add(it['s'])
    if kind == 'content':
        keys = set(doc['glossary'])
        for k, v in doc['glossary'].items():
            for r in v['related']:
                if r not in keys:
                    errs.append(f'glossary {k} → 없는 키 {r}')
        if [z['key'] for z in doc['zones']] != ['vlow', 'low', 'mid', 'high']:
            errs.append('zones 순서는 vlow·low·mid·high')
        # 행동 지시 금지(출시 불가 6번). '과매도·과매수'는 구간 이름이라 허용 — 빼고 본다
        texts = [('zones ' + z['key'], z['body']) for z in doc['zones']]
        texts += [('glossary ' + k, v['body'] + v.get('caution', '')) for k, v in doc['glossary'].items()]
        texts += [('faq', f['a']) for f in doc['faq']] + [('disclaimer', doc['disclaimer'])]
        for where, text in texts:
            t = text.replace('과매도', '').replace('과매수', '')
            for bad in ('매수', '매도', '사세요', '파세요', '사야', '팔아야', '반등 가능성', '하락 가능성', '!'):
                if bad in t:
                    errs.append(f"{where} 에 금지 표현 '{bad}'")
    if kind == 'state':
        w = doc['palsal.watch.v1']['items']
        ids = [x['id'] for x in w]
        if len(ids) != len(set(ids)):
            errs.append('watch id 중복')
        for x in w:
            if x['id'] != f"{x['symbol']}|{x['interval']}":
                errs.append(f"watch id 꼴이 '<symbol>|<interval>' 이 아님: {x['id']}")
        known = set(ids)
        for c in doc.get('palsal.changes.v1', {}).get('items', []):
            if c['watchId'] not in known:
                errs.append(f"changes 에 담지 않은 {c['watchId']}")
        for k, v in doc.items():
            if k.startswith('palsal.bars.v1:'):
                wid = k.split(':', 1)[1]
                if wid not in known:
                    errs.append(f'봉 저장 키 {k} 가 담지 않은 종목')
                errs += bars_rules(k, v)
    return errs


def main(argv: list[str]) -> int:
    files = [Path(a) for a in argv] or sorted((HERE / 'samples').glob('*.json'))
    bad = 0
    for f in files:
        kind = kind_of(f)
        schema = json.loads((HERE / SCHEMAS[kind]).read_text())
        doc = json.loads(f.read_text())
        v = Draft202012Validator(schema, format_checker=FormatChecker())
        errs = [f"{'/'.join(map(str, e.absolute_path)) or '(맨 위)'}: {e.message}" for e in sorted(v.iter_errors(doc), key=str)]
        errs += extra_rules(kind, doc)
        print(f"{'OK ' if not errs else 'BAD'} {f.name}" + ('' if not errs else ''.join(f'\n    - {e}' for e in errs[:12])))
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
