// ─────────────────────────────────────────────
// KeywordManager.jsx — 키워드 / 제외 / 즉시 수집 + 자동 수집 설정 (인라인)
// ─────────────────────────────────────────────

import { useState } from 'react';
import { PRESET_KEYWORDS } from '../../constants/config.js';
import ScheduleSettings    from '../schedule/ScheduleSettings.jsx';

export default function KeywordManager({
  // 키워드 / 제외
  keywords = [], excludeKeywords = [], filterAds = true, requireAllInclude = false,
  onAdd, onRemove, onAddExclude, onRemoveExclude,
  onToggleFilterAds, onToggleRequireAll,
  // 수집
  onCollect, loading = false,
  // 인라인 스케줄용
  config, health, onUpdateConfig,
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

      {/* 즉시 수집 — 강조 */}
      <button style={S.collect} onClick={onCollect}
        disabled={loading || keywords.length === 0}>
        {loading ? '⏳ 수집 + 본문 추출 중... (10~30초 소요)'
                 : keywords.length === 0 ? '키워드를 먼저 추가하세요'
                                         : '🔍 지금 즉시 수집'}
      </button>

      {/* 자동 수집 설정 (인라인) */}
      {config && (
        <ScheduleSettings
          config={config}
          health={health}
          onUpdate={onUpdateConfig}
        />
      )}
    </div>
  );
}

const S = {
  panel:    { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:    { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },
  label2:   { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginTop: 14, marginBottom: 8 },
  row:      { display: 'flex', gap: 7, marginBottom: 10 },
  inp:      { flex: 1, border: '2px solid #e5e0d8', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafaf8', minHeight: 44 },
  tagWrap:  { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  tag:      { display: 'flex', alignItems: 'center', gap: 4, background: '#0d1117', color: 'white', borderRadius: 20, padding: '4px 11px', fontSize: 12.5 },
  rm:       { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, padding: 0, minWidth: 18, minHeight: 18 },
  presetWrap: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip:     { padding: '5px 11px', minHeight: 32, borderRadius: 20, border: '1.5px solid #d5d0c8', background: '#f8f6f2', fontSize: 11.5, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  chipOn:   { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  toggle:   { display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12.5, color: '#444', cursor: 'pointer', minHeight: 32 },
  btnDark:  { padding: '10px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit', minHeight: 44 },
  collect:  { width: '100%', minHeight: 56, padding: 16, borderRadius: 12, border: 'none',
              background: 'linear-gradient(180deg, #0d1117 0%, #1f2937 100%)',
              color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 10px rgba(13,17,23,.18)', marginBottom: 12 },
};
