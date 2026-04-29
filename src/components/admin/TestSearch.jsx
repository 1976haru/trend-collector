// ─────────────────────────────────────────────
// TestSearch.jsx — 관리자 키워드 검색 테스트
// 필터 적용 이전 raw 결과를 source 별로 보여줘 어디서 결과가 사라지는지 진단.
// ─────────────────────────────────────────────

import { useState } from 'react';
import * as api from '../../services/api.js';

const QUICK = ['보호관찰', '보호관찰소', '법무부 보호관찰', '출입국', '교정', '검찰개혁', '전자감독'];

export default function TestSearch() {
  const [keyword,   setKeyword]   = useState('보호관찰');
  const [useGoogle, setUseGoogle] = useState(true);
  const [useNaver,  setUseNaver]  = useState(true);
  const [busy, setBusy] = useState(false);
  const [res,  setRes]  = useState(null);
  const [err,  setErr]  = useState('');

  async function run() {
    if (!keyword.trim()) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await api.testSearch({ keyword: keyword.trim(), useGoogle, useNaver });
      setRes(r);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={S.panel}>
        <div style={S.label}>🧪 검색 테스트 (raw 결과)</div>
        <div style={S.row}>
          <input style={S.inp} placeholder="키워드 입력 (예: 보호관찰)"
            value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()} />
          <button style={S.runBtn} onClick={run} disabled={busy || !keyword.trim()}>
            {busy ? '⏳ 검색 중…' : '🔍 검색'}
          </button>
        </div>

        <div style={S.toggleRow}>
          <label><input type="checkbox" checked={useGoogle} onChange={e => setUseGoogle(e.target.checked)} /> Google News</label>
          <label><input type="checkbox" checked={useNaver}  onChange={e => setUseNaver(e.target.checked)} /> Naver News</label>
        </div>

        <div style={S.quickRow}>
          {QUICK.map(k => (
            <button key={k} style={S.quickBtn} onClick={() => { setKeyword(k); }}>{k}</button>
          ))}
        </div>

        <div style={S.help}>
          💡 이 검색은 필터(기간, 광고, AND 옵션) 적용 <strong>이전</strong> 의 raw 결과를 보여줍니다.
          실제 수집 결과가 적을 때 어느 단계에서 사라지는지 진단할 수 있습니다.
        </div>
      </div>

      {err && <div style={S.errBox}>⚠️ {err}</div>}

      {res && (
        <div style={S.results}>
          <ResultPanel name="🌍 Google News" data={res.google} />
          <ResultPanel name="🇰🇷 Naver News"  data={res.naver} />
        </div>
      )}
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

  toggleRow: { display: 'flex', gap: 14, marginTop: 10, fontSize: 13, color: '#444' },
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
