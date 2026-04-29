// ─────────────────────────────────────────────
// KeywordManager.jsx — 법무부 빠른 키워드(카테고리) + 기간 선택 + 즉시 수집 + 자동 수집 설정
// ─────────────────────────────────────────────

import { useState } from 'react';
import { PRESET_CATEGORIES, PERIOD_OPTIONS } from '../../constants/config.js';
import ScheduleSettings from '../schedule/ScheduleSettings.jsx';

export default function KeywordManager({
  keywords = [], excludeKeywords = [], filterAds = true, requireAllInclude = false,
  onAdd, onRemove, onAddExclude, onRemoveExclude,
  onToggleFilterAds, onToggleRequireAll,
  onCollect, loading = false,
  config, health, onUpdateConfig,
}) {
  const [input,    setInput]    = useState('');
  const [excInput, setExcInput] = useState('');
  // 카테고리 접기/펼치기 상태 — 기본 첫 번째(보호관찰류)만 펼침
  const [open, setOpen] = useState({ protection: true });

  function addKw()      { const k = input.trim();    if (k) { onAdd(k); setInput(''); } }
  function addExclude() { const k = excInput.trim(); if (k && onAddExclude) { onAddExclude(k); setExcInput(''); } }

  const period = config?.collectPeriod || '7d';

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

        {/* 법무부 빠른 키워드 — 카테고리 접기/펼치기 */}
        <div style={S.label2}>📌 법무부 빠른 키워드</div>
        {PRESET_CATEGORIES.map(cat => {
          const expanded = !!open[cat.id];
          return (
            <div key={cat.id} style={S.catBox}>
              <button style={S.catHead} onClick={() => setOpen(o => ({ ...o, [cat.id]: !o[cat.id] }))}>
                <span>{expanded ? '▾' : '▸'} {cat.name}</span>
                <span style={S.catCount}>{cat.keywords.length}개</span>
              </button>
              {expanded && (
                <div style={S.presetWrap}>
                  {cat.keywords.map(k => (
                    <button key={k}
                      style={{ ...S.chip, ...(keywords.includes(k) ? S.chipOn : {}) }}
                      onClick={() => keywords.includes(k) ? onRemove(k) : onAdd(k)}>
                      {keywords.includes(k) ? '✓ ' : ''}{k}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

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

      {/* 수집 기간 */}
      {config && (
        <div style={S.panel}>
          <div style={S.label}>📆 수집 기간</div>
          <div style={S.periodRow}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.v}
                style={{ ...S.periodBtn, ...(period === o.v ? S.periodOn : {}) }}
                onClick={() => onUpdateConfig({ collectPeriod: o.v })}>
                {o.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div style={S.dateRow}>
              <label style={S.dateLabel}>시작
                <input type="date" style={S.dateInp}
                  value={config.collectFromDate || ''}
                  onChange={e => onUpdateConfig({ collectFromDate: e.target.value })} />
              </label>
              <label style={S.dateLabel}>종료
                <input type="date" style={S.dateInp}
                  value={config.collectToDate || ''}
                  onChange={e => onUpdateConfig({ collectToDate: e.target.value })} />
              </label>
            </div>
          )}
          <label style={{ ...S.toggle, marginTop: 6 }}>
            <input type="checkbox" checked={config.includeImages !== false}
              onChange={e => onUpdateConfig({ includeImages: e.target.checked })} />
            <span>PDF 에 본문 이미지 포함</span>
          </label>
        </div>
      )}

      {/* 검색 인식 분석 (Google Trends) */}
      {config && (
        <div style={S.panel}>
          <div style={S.label}>🔎 검색 인식 분석 (Google Trends)</div>
          <label style={S.toggle}>
            <input type="checkbox" checked={!!config.googleTrendsEnabled}
              onChange={e => onUpdateConfig({ googleTrendsEnabled: e.target.checked })}
              disabled={!health?.trends?.configured} />
            <span>
              검색 관심도 + 관련/급상승 검색어 비교 분석 사용
              {!health?.trends?.configured && <span style={S.warn}> ⚠️ GOOGLE_TRENDS_ENABLED 환경변수 미설정</span>}
              {health?.trends?.configured && health?.trends?.provider && (
                <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>(provider: {health.trends.provider})</span>
              )}
            </span>
          </label>
          {config.googleTrendsEnabled && (
            <>
              <div style={{ ...S.fieldLabel, marginTop: 10 }}>비교 기간</div>
              <div style={S.intRow}>
                {[
                  { v: '7d',  l: '최근 7일' },
                  { v: '30d', l: '최근 30일' },
                  { v: '90d', l: '최근 90일' },
                  { v: '12m', l: '최근 12개월' },
                ].map(o => (
                  <button key={o.v}
                    style={{ ...S.intBtn, ...(config.trendsTimeframe === o.v ? S.intOn : {}) }}
                    onClick={() => onUpdateConfig({ trendsTimeframe: o.v })}>
                    {o.l}
                  </button>
                ))}
              </div>
              <div style={S.tipNote}>
                💡 Google Trends 정식 API 는 alpha 단계로 일반 운영 환경에서 호출이 제한됩니다.
                현재는 연동 구조만 준비되어 있으며, provider 가 활성화되면 자동으로 보고서에 반영됩니다.
              </div>
            </>
          )}
        </div>
      )}

      {/* 뉴스 소스 */}
      {config && (
        <div style={S.panel}>
          <div style={S.label}>📰 뉴스 소스 (병합 수집)</div>
          <label style={S.toggle}>
            <input type="checkbox" checked={config.useGoogleNews !== false}
              onChange={e => onUpdateConfig({ useGoogleNews: e.target.checked })} />
            <span><strong>Google News</strong> RSS 사용 (전 세계 매체, 추천)</span>
          </label>
          <label style={S.toggle}>
            <input type="checkbox" checked={!!config.useNaverNews}
              onChange={e => onUpdateConfig({ useNaverNews: e.target.checked })}
              disabled={!health?.sources?.naverConfigured} />
            <span>
              <strong>Naver News</strong> 검색 API 사용 (국내 매체 커버리지)
              {!health?.sources?.naverConfigured && (
                <span style={S.warn}>
                  {' '}⚠️ Naver API 미설정 — <strong>관리 탭 → 📰 뉴스 소스 설정</strong> 에서 입력하세요.
                </span>
              )}
            </span>
          </label>
          {(config.useGoogleNews === false && !config.useNaverNews) && (
            <div style={S.errBox}>⚠️ 두 소스 모두 OFF 입니다. 최소 하나는 켜야 수집이 동작합니다.</div>
          )}
        </div>
      )}

      {/* 즉시 수집 — 강조 */}
      <button style={S.collect} onClick={onCollect}
        disabled={loading || keywords.length === 0}>
        {loading ? '⏳ 수집 + 본문/이미지 추출 중... (15~30초 소요)'
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

  catBox:   { borderRadius: 8, border: '1px solid #f0ede8', marginBottom: 6, overflow: 'hidden', background: '#fafaf8' },
  catHead:  { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 11px', minHeight: 38, background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#333' },
  catCount: { fontSize: 11, color: '#888' },
  presetWrap:{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 10px 11px' },
  chip:     { padding: '5px 11px', minHeight: 32, borderRadius: 20, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 11.5, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  chipOn:   { background: '#0d1117', color: 'white', borderColor: '#0d1117' },

  toggle:   { display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12.5, color: '#444', cursor: 'pointer', minHeight: 32 },
  btnDark:  { padding: '10px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit', minHeight: 44 },

  periodRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  periodBtn: { padding: '8px 12px', minHeight: 38, borderRadius: 8, border: '2px solid #e5e0d8', background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  periodOn:  { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  dateRow:   { display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  dateLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#444' },
  dateInp:   { padding: '8px 10px', border: '1.5px solid #e5e0d8', borderRadius: 7, outline: 'none', fontSize: 13, fontFamily: 'inherit' },

  collect:  { width: '100%', minHeight: 56, padding: 16, borderRadius: 12, border: 'none',
              background: 'linear-gradient(180deg, #0d1117 0%, #1f2937 100%)',
              color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 10px rgba(13,17,23,.18)', marginBottom: 12 },

  warn:     { color: '#c53030', fontSize: 11, marginLeft: 4 },
  errBox:   { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
              padding: '8px 11px', borderRadius: 7, fontSize: 12, marginTop: 8 },

  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: '#444', display: 'block', marginBottom: 5 },
  intRow:     { display: 'flex', flexWrap: 'wrap', gap: 5 },
  intBtn:     { minHeight: 38, padding: '6px 12px', borderRadius: 8, border: '2px solid #e5e0d8',
                background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  intOn:      { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  tipNote:    { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                padding: '8px 11px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6, marginTop: 8 },
};
