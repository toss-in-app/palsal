#!/usr/bin/env python3
"""종목 목록 만들기: 공개 상장 목록 3개 + 손으로 고른 목록 → content/symbols.source.json

받는 파일(사용자 허락 2026-11-05, 내용은 데이터로만 읽음 — 실행·평가하지 않음):
  --kind   KRX KIND 상장법인목록 https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13 (EUC-KR HTML 표)
  --nasdaq https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
  --other  https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt

규칙(apps/palsal.md 기획 · 2026-11-05):
  한국  유가증권(.KS) · 코스닥(.KQ) 전부. 코넥스 · 스팩은 뺌. 이름은 상장 이름 그대로(사실 정보).
  미국  나스닥 Global Select(Q) 보통주 + 뉴욕증권거래소(N) 보통주. 워런트 · 권리 · 유닛 · 우선주 · 채권형 · 폐쇄형 펀드 · 시험 종목 · 상장 요건 미달(D·E 등)은 뺌.
        ETF 와 그 밖의 시장(나스닥 G·S, NYSE American, Arca, Cboe)은 손으로 고른 목록(content/symbols.curated.json)에 있을 때만.
  이름  한국어 이름은 손으로 고른 목록이 이김(원본 표 사용 금지 — 새로 지은 것만). 없으면 영문 이름을 정리해 씀.
사용: python3 -I scripts/build-symbols.py --kind <파일> --nasdaq <파일> --other <파일> [--version 2026-11-05.3]
"""
import argparse
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYMBOL = re.compile(r'^\^?[A-Z0-9.=\-]{1,20}$')
MAX_ITEMS = 8000
BAD = re.compile(
    r'\b(warrants?|rights?|units?|preferred|preference|depositary shares,? each representing a (1/|fractional)|notes? due|debentures?|subordinated|perpetual|'
    r'trust preferred|fixed-to-floating|floating rate|senior notes|contingent value|escrow|when issued)\b|%',
    re.I,
)
FUND = re.compile(r'\bfund\b', re.I)
# 미국 스팩(기업 인수 목적 회사) — 한국 스팩처럼 뺌(손 목록에 있으면 넣음)
SPAC = re.compile(r'\b(acquisition (corp|corporation|company|co)|merger (corp|corporation)|blank check)\b', re.I)
TAIL = re.compile(
    r'(\s+|,\s*)(Class [A-Z]\s+)?(Common Stock|Common Shares|Ordinary Shares|Subordinate Voting Shares|Limited Voting Shares|Shares of Beneficial Interest|'
    r'American Depositary Shares.*|American Depository Shares.*|ADS.*|Sponsored ADR.*|each representing.*|New)$',
    re.I,
)
OTHER_EXCHANGE = {'N': 'NYSE', 'A': 'AMEX', 'P': 'NYSEARCA'}


def pipe_rows(path):
    lines = Path(path).read_text(encoding='utf-8', errors='replace').splitlines()
    head = lines[0].split('|')
    return [dict(zip(head, ln.split('|'))) for ln in lines[1:] if ln and not ln.startswith('File Creation Time')]


def kind_rows(path):
    raw = Path(path).read_bytes().decode('euc-kr', errors='replace')
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', raw, flags=re.S):
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, flags=re.S)]
        if len(cells) >= 3 and cells[0] != '회사명':
            out.append(cells)
    return out


def clean_us_name(raw):
    """'Alphabet Inc. - Class A Common Stock' → 'Alphabet Inc. Class A' · 'Alcoa Corporation Common Stock ' → 'Alcoa Corporation'"""
    s = ' '.join(raw.split())
    company, _, desc = s.partition(' - ')
    cls = re.search(r'\bClass ([A-Z])\b', s)
    while True:
        trimmed = TAIL.sub('', company).strip().rstrip(',')
        if trimmed == company:
            break
        company = trimmed
    if cls and f'Class {cls.group(1)}' not in company:
        company = f'{company} Class {cls.group(1)}'
    return company


def short(text, limit):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    return (cut[: cut.rfind(' ')] if ' ' in cut else cut).rstrip(' ,.-')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', required=True)
    ap.add_argument('--nasdaq', required=True)
    ap.add_argument('--other', required=True)
    ap.add_argument('--version', default=None)
    args = ap.parse_args()

    curated = json.loads((ROOT / 'content/symbols.curated.json').read_text(encoding='utf-8'))['items']
    cur = {c['s']: c for c in curated}
    items = {}
    stats = {}
    warn = []

    # ---- 한국 ----
    for cells in kind_rows(args.kind):
        name, market, code = cells[0], cells[1], cells[2].upper()
        suffix, x = {'유가': ('.KS', 'KOSPI'), '유가증권': ('.KS', 'KOSPI'), '코스닥': ('.KQ', 'KOSDAQ')}.get(market, (None, None))
        if not suffix or '스팩' in name:
            stats['kr_skip'] = stats.get('kr_skip', 0) + 1
            continue
        s = code + suffix
        if not SYMBOL.match(s) or not name:
            warn.append(f'한국 심볼 꼴이 이상해 뺌: {code} {name}')
            continue
        items[s] = {'s': s, 'n': short(name, 40), 'm': 'KR', 'x': x}
        stats['kr'] = stats.get('kr', 0) + 1

    # ---- 미국 ----
    def add_us(s, raw_name, x, is_etf, tier_ok):
        c = cur.get(s)
        if c is None and (is_etf or not tier_ok):
            return False
        if c is None and (BAD.search(raw_name) or FUND.search(raw_name) or SPAC.search(raw_name)):
            return False
        if not SYMBOL.match(s):
            return False
        en = clean_us_name(raw_name)
        items[s] = {'s': s, 'n': short(en, 40), 'e': short(en, 80), 'm': 'US', **({'x': x} if x else {})}
        return True

    for r in pipe_rows(args.nasdaq):
        if r.get('Test Issue') == 'Y':
            continue
        s = r['Symbol'].strip().upper()
        ok_status = r.get('Financial Status', 'N') in ('N', '')
        if add_us(s, r['Security Name'], 'NASDAQ', r.get('ETF') == 'Y', ok_status and r.get('Market Category') == 'Q'):
            stats['us_nasdaq'] = stats.get('us_nasdaq', 0) + 1
    for r in pipe_rows(args.other):
        if r.get('Test Issue') == 'Y':
            continue
        act = r['ACT Symbol'].strip().upper()
        if '$' in act or ' ' in act:
            continue
        s = act.replace('.', '-')
        ex = r.get('Exchange', '')
        if add_us(s, r['Security Name'], OTHER_EXCHANGE.get(ex), r.get('ETF') == 'Y', ex == 'N'):
            stats['us_other'] = stats.get('us_other', 0) + 1

    # ---- 손으로 고른 목록: 한국어 이름 · 별칭이 이김, 목록에 없는 시장(코인 · 환율 · 지수 · 한국 ETF)은 그대로 ----
    for c in curated:
        s = c['s']
        base = items.get(s)
        if base is None:
            if c['m'] == 'US' and not s.startswith('^'):
                warn.append(f'손 목록의 미국 종목이 상장 목록에 없어 뺌(상장 폐지·티커 변경?): {s} {c["n"]}')
                continue
            items[s] = {k: v for k, v in c.items() if k in ('s', 'n', 'e', 'a', 'm', 'x')}
            stats['curated_only'] = stats.get('curated_only', 0) + 1
            continue
        merged = dict(base)
        merged['n'] = c['n']
        if c.get('a'):
            merged['a'] = c['a']
        if c.get('e'):
            merged['e'] = c['e']
        if c.get('x'):
            merged['x'] = c['x']
        if merged.get('e') == merged['n']:
            merged.pop('e')
        items[s] = merged
        stats['curated_merged'] = stats.get('curated_merged', 0) + 1

    # 영문만 있는 미국 종목은 n == e 이니 e 를 뺌(크기)
    for it in items.values():
        if it.get('e') == it['n']:
            it.pop('e')

    order = {'KR': 0, 'US': 1, 'CRYPTO': 2, 'FX': 3}
    out_items = sorted(items.values(), key=lambda it: (order[it['m']], it['s']))
    if len(out_items) > MAX_ITEMS:
        sys.exit(f'종목 {len(out_items)}개 — 상한 {MAX_ITEMS} 를 넘어요')
    version = args.version or f'{datetime.date.today().isoformat()}.1'
    doc = {'kind': 'symbols', 'schema': 1, 'contentVersion': version, 'minClientVersion': '0.0.1', 'items': out_items}
    (ROOT / 'content/symbols.source.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    by_market = {}
    for it in out_items:
        by_market[it['m']] = by_market.get(it['m'], 0) + 1
    print(f'종목 {len(out_items)}개 {by_market} · {stats} · contentVersion {version}')
    print(f'JSON 크기(빌드 뒤 한 줄): 약 {len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()) // 1024} KB')
    for w in warn[:60]:
        print('  주의:', w)
    if len(warn) > 60:
        print(f'  주의 {len(warn) - 60}개 더')


if __name__ == '__main__':
    main()
