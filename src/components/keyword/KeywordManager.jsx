// ─────────────────────────────────────────────
// KeywordManager.jsx — 키워드 / 제외 키워드 / 옵션 + 즉시 수집
// ─────────────────────────────────────────────

import { useState } from 'react';
import { PRESET_KEYWORDS } from '../../constants/config.js';

export default function KeywordManager({
  keywords = [], excludeKeywords = [], filterAds = true, requireAllInclude = false,
  onAdd, onRemove, onAddExclude, onRemoveExclude,
  onToggleFilterAds, onToggleRequireAll,
  onCollect, loading = false,
}) {
  const [input,    setInput]    = useState('');
  const [excInput, setExcInput] = useState('');

  function addKw()      { const k = input.trim();    if (k) { onAdd(k); setInput(''); } }
  function addExclude() { const k = excInput.trim(); if (k && onAddExclude) { onAddExclude(k); setExcInput(''); } }

  return (
    <div>
      {/* 포함 키워드 */}
      <div style={S.panel}>
        <div style={S.label}>🏷 검색(포함) 키워드</div>
        <div style={S.row}>
          <input style={S.inp} placeholder="키워드 입력 후 Enter"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addKw()} />
          <button style={S.btnDark} onClick={addKw}>추가</button>
        </div>

        {keywords.length > 0 && (
          <div style={S.tagWrap}>
            {keywords.map(k => (
              <span key={k} style={S.tag}>
                {k}
                <button style={S.rm} onClick={() => onRemove(k)}>×</button>
              </span>
            ))}
          </div>
        )}

        <div style={S.label2}>📌 빠른 추가</div>
        <div style={S.presetWrap}>
          {PRESET_KEYWORDS.map(k => (
            <button key={k}
              style={{ ...S.chip, ...(keywords.includes(k) ? S.chipOn : {}) }}
              onClick={() => keywords.includes(k) ? onRemove(k) : onAdd(k)}>
              {keywords.includes(k) ? '✓ ' : ''}{k}
            </button>
          ))}
        </div>

        {onToggleRequireAll && (
          <label style={S.toggle}>
            <input type="checkbox" checked={!!requireAllInclude}
              onChange={e => onToggleRequireAll(e.target.checked)} />
            <span>모든 키워드를 포함하는 기사만 (AND 검색)</span>
          </label>
        )}
      </div>

      {/* 제외 키워드 */}
      <div style={S.panel}>
        <div style={S.label}>🚫 제외 키워드</div>
        <div style={S.row}>
          <input style={S.inp} placeholder="제외할 키워드 입력 후 Enter (예: 광고, 부고)"
            value={excInput} onChange={e => setExcInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExclude()} />
          <button style={S.btnDark} onClick={addExclude}>추가</button>
        </div>
        {excludeKeywords.length > 0 && (
          <div style={S.tagWrap}>
            {excludeKeywords.map(k => (
              <span key={k} style={{ ...S.tag, background: '#7f1d1d' }}>
                {k}
                <button style={S.rm} onClick={() => onRemoveExclude && onRemoveExclude(k)}>×</button>
              </span>
            ))}
          </div>
        )}
        {onToggleFilterAds && (
          <label style={S.toggle}>
            <input type="checkbox" checked={!!filterAds}
              onChange={e => onToggleFilterAds(e.target.checked)} />
            <span>광고/홍보성 기사 자동 필터링</span>
          </label>
        )}
      </div>

      {/* 즉시 수집 */}
      <div style={S.actRow}>
        <button style={{ ...S.btnDark, flex: 1, padding: 13, fontSize: 13 }}
          onClick={onCollect} disabled={loading || keywords.length === 0}>
          {loading ? '⏳ 수집 중...'
                   : keywords.length === 0 ? '키워드를 먼저 추가하세요'
                                           : '🔍 지금 즉시 수집'}
        </button>
      </div>
      <div style={S.tip}>
        💡 자동 수집은 서버에서 매일 정해진 시각에 실행됩니다 (스케줄 탭 참고).
      </div>
    </div>
  );
}

const S = {
  panel:    { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:    { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },
  label2:   { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginTop: 14, marginBottom: 8 },
  row:      { display: 'flex', gap: 7, marginBottom: 10 },
  inp:      { flex: 1, border: '2px solid #e5e0d8', borderRadius: 8, padding: '8px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafaf8' },
  tagWrap:  { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  tag:      { display: 'flex', alignItems: 'center', gap: 4, background: '#0d1117', color: 'white', borderRadius: 20, padding: '3px 11px', fontSize: 12 },
  rm:       { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 13, padding: 0 },
  presetWrap: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip:     { padding: '3px 9px', borderRadius: 20, border: '1.5px solid #d5d0c8', background: '#f8f6f2', fontSize: 11, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  chipOn:   { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  toggle:   { display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, color: '#444', cursor: 'pointer' },
  actRow:   { display: 'flex', gap: 7, marginTop: 4 },
  btnDark:  { padding: '8px 13px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit' },
  tip:      { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: 11.5, color: '#92400e', lineHeight: 1.6, marginTop: 8 },
};
