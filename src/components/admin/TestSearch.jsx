// ─────────────────────────────────────────────
// TestSearch.jsx — 관리자 키워드 검색 테스트
// 필터 적용 이전 raw 결과를 source 별로 보여줘 어디서 결과가 사라지는지 진단.
// ─────────────────────────────────────────────

import { useState } from 'react';
import * as api from '../../services/api.js';

const QUICK = ['보호관찰', '보호관찰소', '보호관찰, 보호관찰소', '출입국', '교정', '검찰개혁', '전자감독'];
const PERIODS = [
  { v: '24h', l: '24시간' }, { v: '3d',  l: '3일' },
  { v: '7d',  l: '7일' },    { v: '14d', l: '14일' },
  { v: '30d', l: '30일' },
];

export default function TestSearch() {
  const [keyword,    setKeyword]    = useState('보호관찰');
  const [useGoogle,  setUseGoogle]  = useState(true);
  const [useNaver,   setUseNaver]   = useState(true);
  const [requireAll, setRequireAll] = useState(false);
  const [period,     setPeriod]     = useState('7d');
  const [busy, setBusy] = useState(false);
  const [res,  setRes]  = useState(null);
  const [err,  setErr]  = useState('');

  async function run() {
    if (!keyword.trim()) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const kws = keyword.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      // 시뮬레이션: 다중 키워드 + AND + 기간 필터 모두 반영
      const sim = await api.simulateSearch({
        keywords: kws, useGoogle, useNaver, requireAll, period,
      });
      // 첫 키워드의 raw sample 도 함께 보여주기 위해 testSearch 도 호출 (단일 키워드 모드)
      let raw = null;
      if (kws.length === 1) {
        raw = await api.testSearch({ keyword: kws[0], useGoogle, useNaver });
      }
      setRes({ sim, raw });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={S.panel}>
        <div style={S.label}>🧪 검색 테스트 (단계별 진단)</div>
        <div style={S.row}>
          <input style={S.inp} placeholder="키워드 입력 (쉼표로 다중: 보호관찰, 보호관찰소)"
            value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()} />
          <button style={S.runBtn} onClick={run} disabled={busy || !keyword.trim()}>
            {busy ? '⏳ 검색 중…' : '🔍 검색'}
          </button>
        </div>

        <div style={S.toggleRow}>
          <label><input type="checkbox" checked={useGoogle} onChange={e => setUseGoogle(e.target.checked)} /> Google News</label>
          <label><input type="checkbox" checked={useNaver}  onChange={e => setUseNaver(e.target.checked)} /> Naver News</label>
          <label><input type="checkbox" checked={requireAll} onChange={e => setRequireAll(e.target.checked)} /> 모든 키워드 포함 (AND)</label>
        </div>

        <div style={S.periodRow}>
          {PERIODS.map(o => (
            <button key={o.v}
              style={{ ...S.periodBtn, ...(period === o.v ? S.periodOn : {}) }}
              onClick={() => setPeriod(o.v)}>
              {o.l}
            </button>
          ))}
        </div>

        <div style={S.quickRow}>
          {QUICK.map(k => (
            <button key={k} style={S.quickBtn} onClick={() => { setKeyword(k); }}>{k}</button>
          ))}
        </div>

        <div style={S.help}>
          💡 다중 키워드는 <strong>쉼표</strong>로 구분합니다. AND 옵션을 켜면 모든 키워드가 본문/제목에 포함된 기사만 남깁니다.
          포함 관계 키워드(예: 보호관찰 ⊂ 보호관찰소)는 자동으로 더 긴 키워드 기준으로 축약됩니다.
        </div>
      </div>

      {err && <div style={S.errBox}>⚠️ {err}</div>}

      {res?.sim && <DiagPanel sim={res.sim} />}
      {res?.raw && (
        <div style={S.results}>
          <ResultPanel name="🌍 Google News (raw)" data={res.raw.google} />
          <ResultPanel name="🇰🇷 Naver News (raw)"  data={res.raw.naver} />
        </div>
      )}
    </div>
  );
}

function DiagPanel({ sim }) {
  const dropDate   = (sim.sourceCountsRaw.google + sim.sourceCountsRaw.naver) - sim.afterDateFilter;
  const dropDedupe = sim.afterDateFilter - sim.afterDedupe;
  return (
    <div style={S.panel}>
      <div style={S.label}>📊 단계별 진단</div>
      <div style={S.diagGrid}>
        <Cell label="Google raw"  v={sim.sourceCountsRaw.google} />
        <Cell label="Naver raw"   v={sim.sourceCountsRaw.naver} />
        <Cell label="날짜 필터 후" v={sim.afterDateFilter} sub={dropDate > 0 ? `−${dropDate}` : ''} />
        <Cell label="중복 제거 후" v={sim.afterDedupe}      sub={dropDedupe > 0 ? `−${dropDedupe}` : ''} />
        <Cell label={sim.requireAll ? 'AND 필터 후' : '최종'}
              v={sim.afterAllKeywordFilter}
              sub={sim.requireAll && sim.allKeywordFilteredOut > 0 ? `−${sim.allKeywordFilteredOut}` : ''} />
      </div>
      {sim.requireAll && (
        <div style={S.kwLine}>
          입력 키워드: <strong>{sim.keywords.join(', ')}</strong>
          {' / '}AND 적용: <strong>{sim.keywordsForAllMatch.join(', ')}</strong>
          {sim.keywordsForAllMatch.length < sim.keywords.length && (
            <span style={{ color: '#92400e', marginLeft: 8 }}>
              (포함 관계로 자동 축약)
            </span>
          )}
        </div>
      )}
      <div style={S.kwLine}>
        기간: <strong>{sim.period.label}</strong>
        {' '}({sim.period.from.slice(0, 10)} ~ {sim.period.to.slice(0, 10)})
      </div>
      {sim.afterAllKeywordFilter === 0 && (
        <div style={S.zeroNote}>
          ⚠️ 최종 0건. 기간을 늘리거나 AND 옵션을 끄거나 키워드를 단순화해 보세요.
        </div>
      )}
      {sim.sample?.length > 0 && (
        <>
          <div style={{ ...S.label, marginTop: 12 }}>최종 결과 샘플</div>
          <ol style={S.list}>
            {sim.sample.slice(0, 5).map((a, i) => (
              <li key={i} style={S.item}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" style={S.itemTitle}>{a.title}</a>
                <div style={S.itemMeta}>
                  [{a.source}] · {a.date || '날짜 없음'}
                  {' · '}<span style={{ color: '#888' }}>{a.sourceProvider}/{a.keyword}</span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function Cell({ label, v, sub }) {
  return (
    <div style={S.cell}>
      <div style={S.cellV}>{v}</div>
      <div style={S.cellL}>{label}</div>
      {sub && <div style={S.cellSub}>{sub}</div>}
    </div>
  );
}

function ResultPanel({ name, data }) {
  if (!data) return null;
  return (
    <div style={S.panel}>
      <div style={S.label}>{name} — <strong>{data.count}</strong>건 (raw)</div>
      {data.error && <div style={S.warn}>⚠️ {data.error}</div>}
      {data.count === 0 && !data.error && (
        <div style={S.empty}>결과 없음 — 다른 키워드로 시도하거나 환경변수/관리자 설정을 확인하세요.</div>
      )}
      <ol style={S.list}>
        {(data.sample || []).map((a, i) => (
          <li key={i} style={S.item}>
            <a href={a.url} target="_blank" rel="noopener noreferrer" style={S.itemTitle}>
              {a.title || '(제목 없음)'}
            </a>
            <div style={S.itemMeta}>
              [{a.source || '미상'}] · {a.date || '날짜 없음'}
              {a.rawDate ? <span style={S.raw}> · raw=<code>{a.rawDate}</code></span> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const S = {
  panel:   { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:   { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12 },
  row:     { display: 'flex', gap: 8 },
  inp:     { flex: 1, padding: '10px 12px', minHeight: 44, fontSize: 14, border: '1.5px solid #e5e0d8',
             borderRadius: 8, outline: 'none', background: '#fafaf8', fontFamily: 'inherit' },
  runBtn:  { padding: '10px 18px', minHeight: 44, borderRadius: 8, border: 'none',
             background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 700,
             cursor: 'pointer', fontFamily: 'inherit' },

  toggleRow: { display: 'flex', gap: 14, marginTop: 10, fontSize: 13, color: '#444', flexWrap: 'wrap' },
  periodRow: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  periodBtn: { padding: '6px 11px', minHeight: 32, borderRadius: 7, border: '1.5px solid #e5e0d8',
               background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
               color: '#555', fontFamily: 'inherit' },
  periodOn:  { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  diagGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 8 },
  cell:      { background: '#fafaf8', border: '1px solid #f0ede8', borderRadius: 8,
               padding: '10px 8px', textAlign: 'center' },
  cellV:     { fontSize: 22, fontWeight: 700, color: '#0d1117' },
  cellL:     { fontSize: 11, color: '#666', marginTop: 2 },
  cellSub:   { fontSize: 11, color: '#dc2626', marginTop: 2, fontWeight: 600 },
  kwLine:    { fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 1.6 },
  zeroNote:  { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
               padding: '8px 11px', borderRadius: 7, fontSize: 12, marginTop: 10 },
  quickRow:  { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  quickBtn:  { padding: '5px 10px', borderRadius: 16, border: '1.5px solid #d5d0c8',
               background: '#fafaf8', color: '#444', fontSize: 11.5,
               cursor: 'pointer', fontFamily: 'inherit' },

  help:    { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
             padding: '8px 11px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.6, marginTop: 10 },

  errBox:  { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
             padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },
  warn:    { background: '#fffbeb', color: '#92400e', padding: '6px 10px', borderRadius: 6,
             fontSize: 12, marginBottom: 8 },
  empty:   { color: '#888', fontSize: 13, padding: '14px 0', textAlign: 'center' },

  results: { display: 'flex', flexDirection: 'column', gap: 0 },
  list:    { listStyle: 'decimal', paddingLeft: 20, margin: 0 },
  item:    { padding: '7px 0', borderBottom: '1px solid #f0ede8' },
  itemTitle: { fontSize: 13, fontWeight: 600, color: '#0d1117', textDecoration: 'none' },
  itemMeta:  { fontSize: 11, color: '#666', marginTop: 3 },
  raw:       { color: '#888', fontFamily: 'ui-monospace, monospace' },
};
