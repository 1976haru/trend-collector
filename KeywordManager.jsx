// ─────────────────────────────────────────────
// KeywordManager.jsx — 키워드 추가·삭제·프리셋
// ─────────────────────────────────────────────

import { useState } from 'react';
import { PRESET_KEYWORDS } from '../../constants/config.js';

export default function KeywordManager({ keywords, onAdd, onRemove, intervalH, onIntervalChange, onCollect, onAutoToggle, autoMode, loading }) {
  const [input, setInput] = useState('');

  function handleAdd() {
    const k = input.trim();
    if (k) { onAdd(k); setInput(''); }
  }

  return (
    <div>
      {/* 키워드 입력 */}
      <div style={S.panel}>
        <div style={S.label}>🏷 검색 키워드</div>
        <div style={S.row}>
          <input
            style={S.inp}
            placeholder="키워드 입력 후 Enter"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button style={S.btnDark} onClick={handleAdd}>추가</button>
        </div>

        {/* 현재 키워드 태그 */}
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

        {/* 빠른 추가 프리셋 */}
        <div style={S.label2}>📌 빠른 추가</div>
        <div style={S.presetWrap}>
          {PRESET_KEYWORDS.map(k => (
            <button
              key={k}
              style={{ ...S.chip, ...(keywords.includes(k) ? S.chipOn : {}) }}
              onClick={() => keywords.includes(k) ? onRemove(k) : onAdd(k)}
            >
              {keywords.includes(k) ? '✓ ' : ''}{k}
            </button>
          ))}
        </div>
      </div>

      {/* 수집 주기 */}
      <div style={S.panel}>
        <div style={S.label}>⏱ 수집 주기 (간격)</div>
        <div style={S.intRow}>
          {['1','3','6','12','24'].map(h => (
            <button
              key={h}
              style={{ ...S.intBtn, ...(intervalH === h ? S.intOn : {}) }}
              onClick={() => onIntervalChange(h)}
            >{h}시간</button>
          ))}
        </div>
      </div>

      {/* 실행 버튼 */}
      <div style={S.actRow}>
        <button style={{ ...S.btnDark, flex: 2, padding: 13, fontSize: 13 }}
          onClick={onCollect} disabled={loading}>
          {loading ? '⏳ 수집 중...' : '🔍 지금 즉시 수집'}
        </button>
        <button
          style={{ ...S.btnDark, flex: 1, padding: 13, fontSize: 13, background: autoMode ? '#ef4444' : '#22c55e' }}
          onClick={onAutoToggle} disabled={loading}>
          {autoMode ? '⏹ 중지' : `▶ ${intervalH}h 자동`}
        </button>
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
  intRow:   { display: 'flex', gap: 6 },
  intBtn:   { flex: 1, padding: 8, borderRadius: 8, border: '2px solid #e5e0d8', background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  intOn:    { borderColor: '#0d1117', background: '#0d1117', color: 'white' },
  actRow:   { display: 'flex', gap: 7 },
  btnDark:  { padding: '8px 13px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit' },
};
