// ─────────────────────────────────────────────
// RecentReports.jsx — 최근 리포트 목록 (클릭 시 상세)
// ─────────────────────────────────────────────

import { reportPdfUrl } from '../../services/api.js';
import { fmtFull, fmtRelative } from '../../utils/datetime.js';

export default function RecentReports({
  reports, loading, onRefresh, onCollect, onOpen, onEmail, busyId,
}) {
  return (
    <div>
      <div style={S.actBar}>
        <button style={S.dark} onClick={onCollect} disabled={loading}>
          {loading ? '⏳ 처리 중...' : '🔍 지금 즉시 수집'}
        </button>
        <button style={S.ghost} onClick={onRefresh} disabled={loading}>↻ 새로고침</button>
      </div>

      {!reports.length ? (
        <div style={S.empty}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          생성된 리포트가 없습니다. 위에서 “지금 즉시 수집” 을 눌러보세요.
        </div>
      ) : (
        <ul style={S.list}>
          {reports.map(r => (
            <li key={r.id} style={S.item} onClick={() => onOpen(r.id)}>
              <div style={S.info}>
                <div style={S.title}>
                  📅 {fmtFull(r.generatedAt)}
                  <span style={S.relative}>· {fmtRelative(r.generatedAt)}</span>
                </div>
                <div style={S.meta}>
                  <span style={S.cnt}>📊 {r.count}건</span>
                  {r.trigger === 'scheduled' && <span style={S.badge}>예약</span>}
                  {r.emailedTo?.length > 0 && <span style={S.badgeOk}>📧 발송됨</span>}
                </div>
                <div style={S.kws}>
                  {(r.keywords || []).slice(0, 6).map(k => (
                    <span key={k} style={S.kw}>#{k}</span>
                  ))}
                  {(r.keywords || []).length > 6 && <span style={S.kwMore}>+{r.keywords.length - 6}</span>}
                </div>
              </div>
              <div style={S.actions} onClick={e => e.stopPropagation()}>
                <a href={reportPdfUrl(r.id)} target="_blank" rel="noopener noreferrer" style={S.linkBtn}>
                  📄 PDF
                </a>
                <button style={S.mail} onClick={() => onEmail(r.id)} disabled={busyId === r.id}>
                  {busyId === r.id ? '발송 중…' : '✉️'}
                </button>
                <button style={S.open} onClick={() => onOpen(r.id)}>상세 →</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const S = {
  actBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  dark:   { flex: '2 1 200px', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  ghost:  { flex: '1 1 100px', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },

  empty:  { textAlign: 'center', padding: '40px 20px', color: '#888', fontSize: 13, background: 'white', borderRadius: 12 },
  list:   { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },

  item:   { background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
            cursor: 'pointer', transition: 'transform .1s' },
  info:   { flex: '1 1 220px', minWidth: 0 },

  title:  { fontSize: 13.5, fontWeight: 700, color: '#0d1117', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  relative: { fontSize: 11, color: '#94a3b8', fontWeight: 400 },
  meta:   { display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' },
  cnt:    { fontSize: 12, color: '#0d1117', fontWeight: 600 },
  badge:  { fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#fde68a', color: '#92400e', fontWeight: 600 },
  badgeOk:{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 600 },

  kws:    { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  kw:     { fontSize: 10.5, padding: '1px 7px', borderRadius: 10, background: '#f0ede8', color: '#0d1117' },
  kwMore: { fontSize: 10.5, padding: '1px 7px', borderRadius: 10, background: '#f0ede8', color: '#888' },

  actions:{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  linkBtn:{ minHeight: 36, padding: '6px 11px', borderRadius: 7, border: '1.5px solid #0d1117', background: 'white', color: '#0d1117', fontSize: 11.5, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  mail:   { minHeight: 36, padding: '6px 11px', borderRadius: 7, border: 'none', background: '#22c55e', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  open:   { minHeight: 36, padding: '6px 11px', borderRadius: 7, border: 'none', background: '#0d1117', color: 'white', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
