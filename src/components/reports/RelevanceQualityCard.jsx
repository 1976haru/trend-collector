// ─────────────────────────────────────────────
// RelevanceQualityCard.jsx — 관련성 품질 카드
// 활성 기사 (excluded=false) 의 relevanceLevel 분포 + 관련 없음 후보 일괄 제외 액션.
// ─────────────────────────────────────────────

export default function RelevanceQualityCard({ report, onBulkExcludeIrrelevant, onShowOnlyIrrelevant, exBusy }) {
  const arts = (report?.articles || []).filter(a => !a.excluded);
  if (!arts.length) return null;

  const buckets = { high: 0, medium: 0, low: 0, none: 0 };
  for (const a of arts) {
    const lvl = a.relevanceLevel || 'none';
    if (lvl in buckets) buckets[lvl]++; else buckets.none++;
  }
  const candidates = arts.filter(a => a.isIrrelevantCandidate);
  if (buckets.high === arts.length && candidates.length === 0) return null;     // 모두 high — 표시 안 함

  return (
    <div style={S.wrap}>
      <div style={S.head}>🎯 관련성 품질 — 활성 기사 {arts.length}건 기준</div>
      <div style={S.statRow}>
        <Stat label="관련성 높음" count={buckets.high}   level="high" />
        <Stat label="관련성 보통" count={buckets.medium} level="medium" />
        <Stat label="관련성 낮음" count={buckets.low}    level="low" />
        <Stat label="관련 없음"   count={buckets.none}   level="none" />
      </div>
      {candidates.length > 0 && (
        <div style={S.actionRow}>
          <span style={S.candText}>⚠️ 관련 없음 후보 <strong>{candidates.length}건</strong> 식별됨 — 사용자 검토 후 일괄 제외 가능</span>
          <button onClick={onShowOnlyIrrelevant} disabled={!!exBusy} style={S.btnLight}>
            관련 없음 후보만 보기
          </button>
          <button onClick={onBulkExcludeIrrelevant} disabled={!!exBusy} style={S.btnDanger}>
            🚫 후보 전체 제외
          </button>
        </div>
      )}
      {candidates.length === 0 && buckets.high > 0 && (
        <div style={S.okBox}>✅ 키워드와 무관한 기사 후보가 식별되지 않았습니다.</div>
      )}
    </div>
  );
}

function Stat({ label, count, level }) {
  const c = LEVEL_COLOR[level] || LEVEL_COLOR.none;
  return (
    <div style={{ ...S.stat, borderColor: c.border, background: c.bg }}>
      <div style={{ ...S.statLabel, color: c.fg }}>{label}</div>
      <div style={{ ...S.statValue, color: c.fg }}>{count}건</div>
    </div>
  );
}

const LEVEL_COLOR = {
  high:   { bg: '#dcfce7', border: '#86efac', fg: '#166534' },
  medium: { bg: '#dbeafe', border: '#93c5fd', fg: '#1d4ed8' },
  low:    { bg: '#fef3c7', border: '#fcd34d', fg: '#92400e' },
  none:   { bg: '#fee2e2', border: '#fca5a5', fg: '#b91c1c' },
};

const S = {
  wrap:      { background: 'white', borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  head:      { fontSize: 13, fontWeight: 800, color: '#0d1117', marginBottom: 9 },
  statRow:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 10 },
  stat:      { padding: '8px 11px', border: '1px solid', borderRadius: 8 },
  statLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' },
  statValue: { fontSize: 18, fontWeight: 800, marginTop: 3 },
  actionRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, flexWrap: 'wrap' },
  candText:  { fontSize: 12.5, color: '#9a3412', flex: 1, minWidth: 220 },
  btnLight:  { padding: '6px 11px', minHeight: 32, borderRadius: 6, border: '1px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnDanger: { padding: '6px 11px', minHeight: 32, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  okBox:     { padding: '7px 10px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 7, fontSize: 12 },
};
