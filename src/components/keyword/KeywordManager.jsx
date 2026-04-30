// ─────────────────────────────────────────────
// KeywordManager.jsx — 법무부 빠른 키워드 (5 카테고리, 핵심/확장 분리)
// + 추천 키워드 + 검색 목적 프리셋 + 전체 검색창 + 기관 프리셋 선택
// ─────────────────────────────────────────────

import { useMemo, useState } from 'react';
import {
  ORG_PRESETS, listCategories, flattenAllKeywords,
  RELATED_KEYWORDS, suggestRelated, INTENT_PRESETS, intentPreset,
} from '../../constants/keywordPresets.js';
import { PERIOD_OPTIONS } from '../../constants/config.js';
import ScheduleSettings from '../schedule/ScheduleSettings.jsx';

const ORG_OPTIONS = [
  { v: 'moj',    l: '법무부' },
  { v: 'custom', l: '사용자 지정' },
];

export default function KeywordManager({
  keywords = [], excludeKeywords = [], filterAds = true, requireAllInclude = false,
  onAdd, onRemove, onAddExclude, onRemoveExclude,
  onToggleFilterAds, onToggleRequireAll,
  onCollect, loading = false,
  config, health, onUpdateConfig, onClearKeywords,
}) {
  const [input,    setInput]    = useState('');
  const [excInput, setExcInput] = useState('');

  const [orgId,    setOrgId]    = useState('moj');
  const categories = useMemo(() => listCategories(orgId), [orgId]);

  // 활성 카테고리 — 기본 보호직(protection)
  const defaultCat = ORG_PRESETS[orgId]?.defaultCategoryId || (categories[0]?.id || '');
  const [activeCat, setActiveCat] = useState(defaultCat);
  // 카테고리별 “확장 키워드 펼침” 상태
  const [expandExt, setExpandExt] = useState({});
  const [search, setSearch] = useState('');
  const [intentId, setIntentId] = useState('');

  const selectedSet = useMemo(() => new Set(keywords), [keywords]);

  // 전체 키워드 검색 결과 (대문자/공백 정규화)
  const searchHits = useMemo(() => {
    const q = String(search || '').replace(/\s+/g, '').toLowerCase();
    if (!q) return [];
    const all = flattenAllKeywords(orgId);
    return all.filter(k => k.replace(/\s+/g, '').toLowerCase().includes(q)).slice(0, 24);
  }, [search, orgId]);

  // 추천 키워드 — 사용자가 선택한 키워드를 기반으로
  const relatedHits = useMemo(() => suggestRelated(keywords).slice(0, 12), [keywords]);

  // 검색 목적 추천 키워드 — selectedSet 에서 이미 선택된 항목은 제거
  const intentHits = useMemo(() => {
    const p = intentPreset(intentId);
    if (!p) return [];
    return (p.keywords || []).filter(k => !selectedSet.has(k));
  }, [intentId, selectedSet]);

  function addKw()      { const k = input.trim();    if (k) { onAdd(k); setInput(''); } }
  function addExclude() { const k = excInput.trim(); if (k && onAddExclude) { onAddExclude(k); setExcInput(''); } }

  function addAllInCategory(cat) {
    const all = [...(cat.core || []), ...(cat.extended || [])];
    for (const k of all) if (!selectedSet.has(k)) onAdd(k);
  }
  function removeAllInCategory(cat) {
    const all = [...(cat.core || []), ...(cat.extended || [])];
    for (const k of all) if (selectedSet.has(k)) onRemove(k);
  }
  function addAllOf(list) {
    for (const k of list) if (!selectedSet.has(k)) onAdd(k);
  }

  const period = config?.collectPeriod || '7d';

  return (
    <div>
      {/* ── 검색 키워드 ── */}
      <div style={S.panel}>
        <div style={S.label}>🏷 검색(포함) 키워드</div>

        <div style={S.row}>
          <input style={S.inp} placeholder="키워드 입력 후 Enter"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addKw()} />
          <button style={S.btnDark} onClick={addKw}>추가</button>
        </div>

        {keywords.length === 0 ? (
          <div style={S.emptyHint}>
            👉 빠른 키워드를 선택하거나 직접 입력하여 모니터링을 시작하세요.
          </div>
        ) : (
          <>
            <div style={S.tagWrap}>
              {keywords.map(k => (
                <span key={k} style={S.tag}>
                  {k}
                  <button style={S.rm} onClick={() => onRemove(k)}>×</button>
                </span>
              ))}
            </div>
            {onClearKeywords && (
              <button style={S.clearBtn}
                onClick={() => {
                  if (confirm(`선택된 키워드 ${keywords.length}개를 모두 비우시겠습니까?`)) onClearKeywords();
                }}>
                🗑 키워드 전체 초기화
              </button>
            )}
          </>
        )}

        {onToggleRequireAll && (
          <div style={{ marginTop: keywords.length === 0 ? 12 : 4 }}>
            <label style={S.toggle}>
              <input type="checkbox" checked={!!requireAllInclude}
                onChange={e => onToggleRequireAll(e.target.checked)} />
              <span><strong>모든 키워드를 포함하는 기사만</strong> (AND 검색) — 기본은 OR(하나라도 포함되면 수집)</span>
            </label>
          </div>
        )}
      </div>

      {/* ── 추천 키워드 — 선택된 키워드 기반 ── */}
      {relatedHits.length > 0 && (
        <div style={S.panel}>
          <div style={S.label}>💡 추천 키워드 — 선택한 키워드와 함께 보면 좋은 항목</div>
          <div style={S.presetWrap}>
            {relatedHits.map(k => (
              <button key={k} style={{ ...S.chip, ...S.chipSuggest }} onClick={() => onAdd(k)}>
                + {k}
              </button>
            ))}
            <button style={S.chipAdd} onClick={() => addAllOf(relatedHits)}>
              ＋ 추천 전체 추가
            </button>
          </div>
        </div>
      )}

      {/* ── 검색 목적 프리셋 ── */}
      <div style={S.panel}>
        <div style={S.label}>🎯 검색 목적</div>
        <div style={S.intentRow}>
          {INTENT_PRESETS.map(p => (
            <button key={p.id}
              style={{ ...S.intentBtn, ...(intentId === p.id ? S.intentOn : {}) }}
              onClick={() => setIntentId(intentId === p.id ? '' : p.id)}
              title={p.desc}>
              {p.label}
            </button>
          ))}
        </div>
        {intentId && (
          <>
            <div style={S.intentDesc}>{intentPreset(intentId)?.desc}</div>
            {intentHits.length > 0 ? (
              <div style={S.presetWrap}>
                {intentHits.map(k => (
                  <button key={k} style={{ ...S.chip, ...S.chipIntent }} onClick={() => onAdd(k)}>
                    + {k}
                  </button>
                ))}
                <button style={S.chipAdd} onClick={() => addAllOf(intentHits)}>
                  ＋ 목적 키워드 전체 추가
                </button>
              </div>
            ) : (
              <div style={S.intentEmpty}>
                {(intentPreset(intentId)?.keywords?.length || 0) === 0
                  ? '선택한 목적은 별도 추가 키워드가 없습니다 — 카테고리에서 직접 선택하세요.'
                  : '추천 키워드가 모두 이미 추가되었습니다.'}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 빠른 키워드 — 기관/카테고리/검색 ── */}
      <div style={S.panel}>
        <div style={S.headRow}>
          <div style={S.label2}>📌 빠른 키워드</div>
          <select style={S.orgSel} value={orgId} onChange={e => setOrgId(e.target.value)}>
            {ORG_OPTIONS.map(o => (
              <option key={o.v} value={o.v}
                disabled={o.v === 'custom'}
                title={o.v === 'custom' ? '향후 지원 예정' : ''}>
                {o.l}{o.v === 'custom' ? ' (예정)' : ''}
              </option>
            ))}
          </select>
        </div>

        <input style={{ ...S.inp, marginBottom: 10 }}
          placeholder='전체 키워드 검색 — 예: "소년" 입력 시 소년원 / 소년보호 / 청소년비행예방센터'
          value={search} onChange={e => setSearch(e.target.value)} />

        {search && (
          <div style={S.searchBox}>
            <div style={S.searchHead}>검색 결과 ({searchHits.length})</div>
            {searchHits.length === 0
              ? <div style={S.searchEmpty}>일치하는 키워드가 없습니다.</div>
              : (
                <div style={S.presetWrap}>
                  {searchHits.map(k => (
                    <button key={k}
                      style={{ ...S.chip, ...(selectedSet.has(k) ? S.chipOn : {}) }}
                      onClick={() => selectedSet.has(k) ? onRemove(k) : onAdd(k)}>
                      {selectedSet.has(k) ? '✓ ' : ''}{k}
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* 카테고리 탭 */}
        <div style={S.tabRow}>
          {categories.map(cat => {
            const active = activeCat === cat.id;
            const selected = [...(cat.core || []), ...(cat.extended || [])].filter(k => selectedSet.has(k)).length;
            return (
              <button key={cat.id}
                style={{ ...S.tab, ...(active ? S.tabOn : {}) }}
                onClick={() => setActiveCat(cat.id)}>
                {cat.label}
                {selected > 0 && <span style={S.tabBadge}>{selected}</span>}
              </button>
            );
          })}
        </div>

        {categories.map(cat => {
          if (cat.id !== activeCat) return null;
          const extOpen = expandExt[cat.id] !== false; // 기본 펼침
          const coreSelectedCount = (cat.core || []).filter(k => selectedSet.has(k)).length;
          const allSelectedCount  = [...(cat.core || []), ...(cat.extended || [])].filter(k => selectedSet.has(k)).length;
          return (
            <div key={cat.id}>
              <div style={S.catActions}>
                <span style={S.catCount2}>
                  핵심 {cat.core?.length || 0} · 확장 {cat.extended?.length || 0}
                  {allSelectedCount > 0 && <span style={S.catSelected}> · 선택 {allSelectedCount}</span>}
                </span>
                <span style={{ flex: 1 }} />
                <button style={S.catBtnLight} onClick={() => addAllInCategory(cat)}>＋ 전체 추가</button>
                <button style={S.catBtnLight} onClick={() => removeAllInCategory(cat)} disabled={allSelectedCount === 0}>
                  ✕ 전체 해제
                </button>
              </div>

              <div style={S.subLabel}>핵심 키워드 ({cat.core?.length || 0}) {coreSelectedCount > 0 && <span style={S.subSelected}>· 선택 {coreSelectedCount}</span>}</div>
              <div style={S.presetWrap}>
                {(cat.core || []).map(k => (
                  <button key={k}
                    style={{ ...S.chip, ...(selectedSet.has(k) ? S.chipOn : {}) }}
                    onClick={() => selectedSet.has(k) ? onRemove(k) : onAdd(k)}>
                    {selectedSet.has(k) ? '✓ ' : ''}{k}
                  </button>
                ))}
              </div>

              {(cat.extended?.length || 0) > 0 && (
                <>
                  <button style={S.extToggle}
                    onClick={() => setExpandExt(s => ({ ...s, [cat.id]: !extOpen }))}>
                    {extOpen ? '▾' : '▸'} 확장 키워드 {cat.extended.length}개 — {extOpen ? '접기' : '더보기'}
                  </button>
                  {extOpen && (
                    <div style={S.presetWrap}>
                      {cat.extended.map(k => (
                        <button key={k}
                          style={{ ...S.chip, ...S.chipExt, ...(selectedSet.has(k) ? S.chipOn : {}) }}
                          onClick={() => selectedSet.has(k) ? onRemove(k) : onAdd(k)}>
                          {selectedSet.has(k) ? '✓ ' : ''}{k}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
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
          {period === '24h' && (
            <div style={S.warnBox}>
              ⚠️ 결과가 적을 수 있습니다. 최근 7일 또는 30일을 권장합니다.
            </div>
          )}
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
              {!health?.sources?.naverConfigured && (() => {
                const d = health?.sources?.naverEnvDiagnostics;
                const partialEnv = d && d.partialMissing;
                const enabledMisinterpreted = d && d.hasNAVER_ENABLED && !d.naverEnabledNormalized;
                let msg = ' ⚠️ Naver API 미설정 — 관리 → 뉴스 소스 설정 또는 Render Environment 에서 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 설정하세요.';
                if (partialEnv) {
                  const miss = [];
                  if (!d.hasNAVER_CLIENT_ID)     miss.push('NAVER_CLIENT_ID');
                  if (!d.hasNAVER_CLIENT_SECRET) miss.push('NAVER_CLIENT_SECRET');
                  msg = ` ⚠️ Render Environment 에 ${miss.join(' / ')} 가 누락되어 있습니다. (관리 → 뉴스 소스 설정 → 환경변수 진단 참고)`;
                } else if (enabledMisinterpreted) {
                  msg = ' ⚠️ NAVER_ENABLED 가 비활성으로 해석됨. true 또는 1 로 변경 후 재배포 (Clear build cache & deploy) 하세요.';
                }
                return <span style={S.warn}>{msg}</span>;
              })()}
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
  label2:   { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px' },
  headRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orgSel:   { padding: '6px 10px', border: '1.5px solid #d5d0c8', borderRadius: 7, fontSize: 12, background: 'white', fontFamily: 'inherit' },
  row:      { display: 'flex', gap: 7, marginBottom: 10 },
  inp:      { flex: 1, border: '2px solid #e5e0d8', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafaf8', minHeight: 44 },
  tagWrap:  { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  tag:      { display: 'flex', alignItems: 'center', gap: 4, background: '#0d1117', color: 'white', borderRadius: 20, padding: '4px 11px', fontSize: 12.5 },
  rm:       { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, padding: 0, minWidth: 18, minHeight: 18 },
  emptyHint:{ background: '#fffbeb', border: '1px dashed #fde68a', color: '#92400e',
              padding: '10px 12px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, marginBottom: 8 },
  clearBtn: { padding: '6px 11px', minHeight: 30, borderRadius: 6, border: '1.5px solid #fecaca',
              background: '#fff5f5', color: '#991b1b', fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 },

  tabRow:   { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, padding: '2px', background: '#f0ede8', borderRadius: 8 },
  tab:      { padding: '7px 11px', minHeight: 34, border: 'none', background: 'transparent', borderRadius: 6,
              fontSize: 12, fontWeight: 600, color: '#555', cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', gap: 5, alignItems: 'center' },
  tabOn:    { background: '#0d1117', color: 'white' },
  tabBadge: { background: 'rgba(255,255,255,.18)', borderRadius: 10, padding: '0 6px', fontSize: 10.5 },

  catActions:{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 8px' },
  catCount2: { fontSize: 11, color: '#888' },
  catSelected: { color: '#0d1117', fontWeight: 700 },
  catBtnLight:{ padding: '6px 10px', minHeight: 30, borderRadius: 6, border: '1.5px solid #d5d0c8',
                background: 'white', color: '#444', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  subLabel: { fontSize: 11, fontWeight: 700, color: '#666', marginTop: 4, marginBottom: 5 },
  subSelected: { color: '#0d1117', marginLeft: 4 },

  presetWrap:{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 0 6px' },
  chip:     { padding: '5px 11px', minHeight: 32, borderRadius: 20, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 11.5, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  chipOn:   { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  chipExt:  { borderStyle: 'dashed', color: '#666' },
  chipSuggest:{ background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8' },
  chipIntent: { background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' },
  chipAdd:  { padding: '5px 12px', minHeight: 32, borderRadius: 20, border: '1.5px solid #0d1117',
              background: '#0d1117', color: 'white', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },

  extToggle:{ background: 'transparent', border: 'none', color: '#0d1117', fontSize: 12, fontWeight: 600,
              padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit' },

  searchBox:{ background: '#fafaf8', border: '1px solid #f0ede8', borderRadius: 8, padding: '8px 10px', marginBottom: 10 },
  searchHead:{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 5 },
  searchEmpty:{ fontSize: 12, color: '#888' },

  intentRow:{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  intentBtn:{ padding: '7px 11px', minHeight: 34, borderRadius: 8, border: '1.5px solid #d5d0c8',
              background: 'white', color: '#444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  intentOn: { background: '#92400e', color: 'white', borderColor: '#92400e' },
  intentDesc:{ fontSize: 11.5, color: '#666', marginBottom: 6 },
  intentEmpty:{ fontSize: 11.5, color: '#888' },

  toggle:   { display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, fontSize: 12.5, color: '#444', cursor: 'pointer', minHeight: 32 },
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
  warnBox:  { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
              padding: '8px 11px', borderRadius: 7, fontSize: 12, marginTop: 8 },
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
