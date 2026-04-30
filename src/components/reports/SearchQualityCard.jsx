// ─────────────────────────────────────────────
// SearchQualityCard.jsx — 검색 품질 진단 카드
// 도메인 의도 / 자동 제외 사유 / 노이즈 카테고리 / 관련성 재검사 버튼.
// ─────────────────────────────────────────────

import { useState } from 'react';
import * as api from '../../services/api.js';

export default function SearchQualityCard({ report, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState('');
  const [err,  setErr]  = useState('');

  const intent  = report?.searchIntent;
  const quality = report?.relevanceQuality;
  if (!intent && !quality) return null;

  const total          = quality?.total ?? (report.articles || []).length;
  const pass           = quality?.pass ?? 0;
  const autoExcluded   = quality?.autoExcluded ?? 0;
  const manualExcluded = quality?.manualExcluded ?? 0;
  const reasons = Object.entries(quality?.autoExcludeReasons || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  async function onRecheck(mode) {
    if (!confirm(`이 리포트에 새 관련성 점수 엔진을 적용합니다.\n도메인 맥락 + 노이즈 사전 + 본문 정제로 무관 기사를 자동 제외합니다.\n\n검색 모드: ${mode}`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api.relevanceRecheckReport(report.id, { searchMode: mode });
      setMsg(`✅ 재검사 완료 — 총 ${r.relevanceQuality?.total ?? '?'}건 중 자동 제외 ${r.relevanceQuality?.autoExcluded ?? 0}건, 활성 ${r.activeArticleCount}건`);
      onRefresh && onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>🔬 검색 품질 진단 {intent?.intentName && <span style={S.intentBadge}>{intent.intentName}</span>} {intent?.searchMode && <span style={S.modeBadge}>{intent.searchMode === 'strict' ? '정확 모드' : intent.searchMode === 'wide' ? '넓게 수집' : '원본'}</span>}</div>

      <div style={S.statRow}>
        <Stat label="원본 수집" value={`${total}건`} />
        <Stat label="활성 분석" value={`${pass}건`} highlight />
        <Stat label="자동 제외" value={`${autoExcluded}건`} dim={autoExcluded === 0} />
        <Stat label="수동 제외" value={`${manualExcluded}건`} dim={manualExcluded === 0} />
      </div>

      {reasons.length > 0 && (
        <div style={S.reasonBox}>
          <div style={S.reasonHead}>주요 자동 제외 사유</div>
          <ul style={S.reasonList}>
            {reasons.map(([r, n]) => (
              <li key={r} style={S.reasonItem}>
                <span>{r}</span>
                <strong style={S.reasonCount}>{n}건</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={S.actionRow}>
        <span style={S.note}>
          기존 리포트에 새 관련성 점수 엔진을 다시 적용해 무관 기사 (스포츠/금융/연예 등) 를 자동 제외할 수 있습니다.
        </span>
        <button onClick={() => onRecheck('strict')} disabled={busy} style={S.btn}>
          {busy ? '⏳' : '🔁 정확 모드로 재검사'}
        </button>
        <button onClick={() => onRecheck('wide')} disabled={busy} style={S.btnLight}>
          {busy ? '⏳' : '🌐 넓게 수집 모드'}
        </button>
      </div>

      {msg && <div style={S.ok}>{msg}</div>}
      {err && <div style={S.err}>⚠️ {err}</div>}
    </div>
  );
}

function Stat({ label, value, highlight, dim }) {
  return (
    <div style={{ ...S.stat, ...(highlight ? S.statHi : {}), ...(dim ? S.statDim : {}) }}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
    </div>
  );
}

const S = {
  wrap:        { background: 'white', borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  head:        { fontSize: 13, fontWeight: 800, color: '#0d1117', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  intentBadge: { fontSize: 10.5, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 10 },
  modeBadge:   { fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 },
  statRow:     { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 10 },
  stat:        { padding: '8px 11px', border: '1px solid #f0ede8', background: '#fafaf6', borderRadius: 8 },
  statHi:      { background: '#dcfce7', borderColor: '#86efac' },
  statDim:     { opacity: 0.6 },
  statLabel:   { fontSize: 10.5, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' },
  statValue:   { fontSize: 18, fontWeight: 800, color: '#0d1117', marginTop: 3 },
  reasonBox:   { background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '8px 11px', marginBottom: 10 },
  reasonHead:  { fontSize: 11, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 },
  reasonList:  { listStyle: 'none', padding: 0, margin: 0 },
  reasonItem:  { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9a3412', padding: '2px 0' },
  reasonCount: { color: '#7c2d12' },
  actionRow:   { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: '#fafaf6', border: '1px solid #f0ede8', borderRadius: 8, flexWrap: 'wrap' },
  note:        { fontSize: 11.5, color: '#666', flex: 1, minWidth: 220, lineHeight: 1.55 },
  btn:         { padding: '7px 12px', minHeight: 34, borderRadius: 7, border: 'none', background: '#0d1117', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnLight:    { padding: '7px 12px', minHeight: 34, borderRadius: 7, border: '1.5px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  ok:          { background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '7px 11px', borderRadius: 7, fontSize: 12, marginTop: 8 },
  err:         { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '7px 11px', borderRadius: 7, fontSize: 12, marginTop: 8 },
};
