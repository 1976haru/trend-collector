// ─────────────────────────────────────────────
// MediaCoverage.jsx — 전국 언론사 수집 현황
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react';
import { MEDIA_BY_CATEGORY, ALL_MEDIA_FLAT } from '../../constants/mediaList.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function MediaCoverage({ articles }) {
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('전체');

  // 수집된 언론사 통계
  const sourceStats = useMemo(() => {
    const map = {};
    articles.forEach(a => {
      if (!a.source) return;
      const cat = Object.entries(MEDIA_BY_CATEGORY).find(([, list]) =>
        list.some(m => a.source.includes(m) || m.includes(a.source))
      );
      const region = cat ? cat[0] : '기타';
      if (!map[a.source]) map[a.source] = { name: a.source, count: 0, keywords: [], region };
      map[a.source].count++;
      if (!map[a.source].keywords.includes(a.keyword)) map[a.source].keywords.push(a.keyword);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [articles]);

  const foundNames = sourceStats.map(s => s.name);

  const categories = ['전체', ...Object.keys(MEDIA_BY_CATEGORY), '기타'];

  // 카테고리별 필터
  const filteredStats = sourceStats.filter(s => {
    if (category !== '전체' && s.region !== category) return false;
    if (search && !s.name.includes(search)) return false;
    return true;
  });

  if (articles.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '44px 20px', color: '#aaa' }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>📡</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#666' }}>수집 후 언론사 현황이 표시됩니다</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>전국 {ALL_MEDIA_FLAT.length}+ 개 언론사 추적</div>
      </div>
    );
  }

  return (
    <div>
      {/* 요약 카드 */}
      <div style={S.statRow}>
        {[
          { label: '등록 언론사', value: `${ALL_MEDIA_FLAT.length}+`, color: '#0d1117' },
          { label: '수집 확인',   value: sourceStats.length,           color: '#22c55e' },
          { label: '미확인',      value: ALL_MEDIA_FLAT.length - sourceStats.length, color: '#ef4444' },
        ].map(c => (
          <div key={c.label} style={S.card}>
            <div style={{ ...S.num, color: c.color }}>{c.value}</div>
            <div style={S.cardLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* TOP 10 바 차트 */}
      <div style={S.panel}>
        <div style={S.label}>📊 수집 언론사 TOP 10</div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceStats.slice(0, 10).map(s => ({ name: s.name.length > 5 ? s.name.slice(0, 5) + '..' : s.name, 건수: s.count }))}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="건수" fill="#0d1117" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 언론사 전체 현황 */}
      <div style={S.panel}>
        <div style={S.label}>🗂 카테고리별 수집 현황</div>

        {/* 검색 */}
        <input style={S.search} placeholder="언론사 검색..."
          value={search} onChange={e => setSearch(e.target.value)} />

        {/* 지역 필터 */}
        <div style={S.catScroll}>
          {categories.map(c => (
            <button key={c} style={{ ...S.catBtn, ...(category === c ? S.catOn : {}) }}
              onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>

        {/* 범례 */}
        <div style={S.legend}>
          <span style={S.foundChip}>■ 수집됨</span>
          <span style={S.missedChip}>□ 미확인 (수동 확인 필요)</span>
        </div>

        {/* 카테고리별 언론사 */}
        {Object.entries(MEDIA_BY_CATEGORY)
          .filter(([cat]) => category === '전체' || category === cat)
          .map(([cat, list]) => {
            const fl = search ? list.filter(m => m.includes(search)) : list;
            if (!fl.length) return null;
            const foundCnt = fl.filter(m => foundNames.some(n => n.includes(m) || m.includes(n))).length;
            return (
              <div key={cat} style={S.catSection}>
                <div style={S.catTitle}>
                  <span>{cat}</span>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>
                    {foundCnt}/{fl.length} 확인
                  </span>
                </div>
                <div style={S.chipWrap}>
                  {fl.map((m, i) => {
                    const found = foundNames.some(n => n.includes(m) || m.includes(n));
                    return <span key={i} style={{ ...S.chip, ...(found ? S.chipFound : S.chipMissed) }}>{m}</span>;
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

const S = {
  statRow:  { display: 'flex', gap: 7, marginBottom: 11 },
  card:     { flex: 1, background: 'white', borderRadius: 10, padding: 11, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  num:      { fontSize: 24, fontWeight: 700 },
  cardLabel: { fontSize: 10, color: '#aaa', marginTop: 1 },
  panel:    { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:    { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },
  search:   { width: '100%', border: '2px solid #e5e0d8', borderRadius: 8, padding: '7px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 9, boxSizing: 'border-box' },
  catScroll: { display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 10, paddingBottom: 3 },
  catBtn:   { padding: '4px 10px', borderRadius: 20, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', color: '#555' },
  catOn:    { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  legend:   { display: 'flex', gap: 12, fontSize: 11, marginBottom: 10, color: '#555' },
  foundChip:  { color: '#0d1117', fontWeight: 600 },
  missedChip: { color: '#dc2626' },
  catSection: { marginBottom: 13 },
  catTitle:   { fontSize: 11.5, fontWeight: 700, color: '#0d1117', background: '#f0ede8', borderRadius: 6, padding: '4px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between' },
  chipWrap:   { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip:       { padding: '3px 9px', borderRadius: 5, fontSize: 11, border: '1px solid #e5e0d8' },
  chipFound:  { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  chipMissed: { background: '#fef2f2', color: '#dc2626', border: '1.5px dashed #fca5a5' },
};
