// ─────────────────────────────────────────────
// ReportDetail.jsx — 단일 리포트 마스터·디테일
// 모든 외부 링크는 안전한 JSX <a target="_blank" rel="noopener noreferrer">.
// ─────────────────────────────────────────────

import { reportHtmlUrl } from '../../services/api.js';
import { fmtFull, fmtRelative } from '../../utils/datetime.js';

function safeUrl(u = '') {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function ExternalLink({ href, children, style }) {
  const u = safeUrl(href);
  if (!u) return <span style={style}>{children}</span>;
  return (
    <a href={u} target="_blank" rel="noopener noreferrer" style={style}>
      {children}
    </a>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statValue, color }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

function Bar({ value, total, color = '#0d1117' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={S.barWrap}>
      <div style={{ ...S.bar, width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function ReportDetail({ report, onClose, onEmail, sending }) {
  if (!report) return null;
  const a = report.articles || [];
  const sentiment   = report.sentiment   || {};
  const mediaCounts = report.mediaCounts || {};
  const trending    = report.trending    || [];
  const groups      = report.groups      || [];
  const summaryText = report.summaryText || '';
  const total       = a.length;
  const top         = a.slice(0, 10);

  const mediaEntries = Object.entries(mediaCounts).filter(([, v]) => v > 0);
  const mediaMax     = Math.max(1, ...mediaEntries.map(([, v]) => v));

  return (
    <div style={S.wrap}>
      {/* 액션 바 */}
      <div style={S.actBar}>
        <button onClick={onClose} style={S.back}>← 목록</button>
        <div style={S.spacer} />
        <ExternalLink href={reportHtmlUrl(report.id)} style={S.linkBtn}>
          📄 PDF 다운로드 / 인쇄
        </ExternalLink>
        <button onClick={() => onEmail(report.id)} style={S.mail} disabled={sending}>
          {sending ? '발송 중…' : '✉️ 메일 발송'}
        </button>
      </div>

      {/* 헤더 */}
      <div style={S.head}>
        <div style={S.title}>📰 일일 언론보도 보고서</div>
        <div style={S.meta}>
          📅 생성: <strong>{fmtFull(report.generatedAt)}</strong>{' '}
          <span style={S.metaSub}>({fmtRelative(report.generatedAt)})</span>{' '}
          · 🔄 {report.trigger === 'scheduled' ? '예약 실행' : '수동 실행'}
          · 🆔 <span style={S.id}>{report.id}</span>
        </div>
        <div style={S.kwRow}>
          {(report.keywords || []).map(k => <span key={k} style={S.kw}>#{k}</span>)}
          {(report.excludes || []).map(k => <span key={k} style={S.exKw}>−{k}</span>)}
        </div>
      </div>

      {/* 요약 문장 */}
      {summaryText && (
        <div style={S.summary}>
          <div style={S.summaryLabel}>📝 오늘의 요약</div>
          <div style={S.summaryText}>{summaryText}</div>
        </div>
      )}

      {/* 급상승 */}
      {trending.length > 0 && (
        <div style={S.alert}>
          📈 <strong>급상승 이슈</strong> —{' '}
          {trending.slice(0, 5).map((t, i) => (
            <span key={t.keyword}>
              {i > 0 ? ', ' : ''}
              <strong>{t.keyword}</strong> ({t.prev}→{t.curr})
            </span>
          ))}
        </div>
      )}

      {/* 통계 카드 */}
      <div data-stats-grid style={S.stats}>
        <Stat label="총 보도" value={total} color="#0d1117" />
        <Stat label="긍정"   value={sentiment.positive || 0} color="#16a34a" />
        <Stat label="부정"   value={sentiment.negative || 0} color="#dc2626" />
        <Stat label="중립"   value={sentiment.neutral  || 0} color="#94a3b8" />
      </div>

      {/* 감정 분포 (CSS 바) */}
      {sentiment.total > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>📊 감정 분포 — <span style={S.overall(sentiment.overall)}>{sentiment.overall}</span></div>
          <div style={S.sentBar}>
            <div style={{ ...S.sentSeg, background: '#16a34a', flexGrow: sentiment.positive }}>
              {sentiment.positivePct}%
            </div>
            <div style={{ ...S.sentSeg, background: '#dc2626', flexGrow: sentiment.negative }}>
              {sentiment.negativePct}%
            </div>
            <div style={{ ...S.sentSeg, background: '#94a3b8', flexGrow: sentiment.neutral }}>
              {sentiment.neutralPct}%
            </div>
          </div>
          <div style={S.legend}>
            <span style={S.legendItem}><span style={{ ...S.dot, background: '#16a34a' }} /> 긍정</span>
            <span style={S.legendItem}><span style={{ ...S.dot, background: '#dc2626' }} /> 부정</span>
            <span style={S.legendItem}><span style={{ ...S.dot, background: '#94a3b8' }} /> 중립</span>
          </div>
        </div>
      )}

      {/* 언론 유형 */}
      {mediaEntries.length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>📡 언론 유형별 건수</div>
          {mediaEntries.map(([k, v]) => (
            <div key={k} data-media-row style={S.mediaRow}>
              <div style={S.mediaName}>{k}</div>
              <Bar value={v} total={mediaMax} color="#0d1117" />
              <div style={S.mediaCnt}>{v}건</div>
            </div>
          ))}
        </div>
      )}

      {/* 중복 묶기 */}
      {groups.length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>🧩 중복 묶기 ({groups.length}건)</div>
          {groups.slice(0, 8).map((g, i) => (
            <div key={i} style={S.group}>
              <div>
                <ExternalLink href={g.leadUrl} style={S.groupTitle}>
                  {g.leadTitle}
                </ExternalLink>
              </div>
              <div style={S.groupMeta}>
                관련 보도 <strong>{g.count}건</strong> · {g.sources.slice(0, 8).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 주요 이슈 TOP */}
      <div style={S.panel}>
        <div style={S.panelLabel}>📌 주요 이슈 TOP {top.length}</div>
        <ol style={S.list}>
          {top.map((art) => (
            <li key={art.id} style={S.item}>
              <div>
                <ExternalLink href={art.url} style={S.itemTitle}>
                  {art.title}
                </ExternalLink>
              </div>
              <div style={S.itemMeta}>
                <span style={S.src}>[{art.source || '미상'}]</span>{' '}
                {art.date ? <span>{art.date}</span> : null}
                {' · '}#{art.keyword}
                {art.mediaType ? ` · ${art.mediaType}` : ''}
                {art.sentiment?.label ? (
                  <span style={S.sentTag(art.sentiment.label)}> · {art.sentiment.label}</span>
                ) : null}
              </div>
              {art.summary && <div style={S.itemSummary}>{art.summary}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 11 },
  actBar: { display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' },
  back:   { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  spacer: { flex: 1 },
  linkBtn:{ padding: '9px 13px', minHeight: 40, borderRadius: 8, border: '1.5px solid #0d1117', background: 'white', color: '#0d1117', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  mail:   { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: 'none', background: '#22c55e', color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  head:   { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  title:  { fontSize: 17, fontWeight: 800, marginBottom: 6 },
  meta:   { fontSize: 12.5, color: '#555', marginBottom: 8 },
  metaSub:{ color: '#94a3b8' },
  id:     { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#64748b' },
  kwRow:  { display: 'flex', flexWrap: 'wrap', gap: 4 },
  kw:     { fontSize: 11.5, padding: '2px 8px', borderRadius: 12, border: '1px solid #0d1117', color: '#0d1117' },
  exKw:   { fontSize: 11.5, padding: '2px 8px', borderRadius: 12, border: '1px solid #c53030', color: '#c53030' },

  summary:     { background: '#f8f6f2', borderLeft: '3px solid #0d1117', borderRadius: 6, padding: '11px 14px' },
  summaryLabel:{ fontSize: 11, color: '#666', fontWeight: 700, marginBottom: 4 },
  summaryText: { fontSize: 13.5, color: '#222', lineHeight: 1.7 },

  alert: { background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 500 },

  stats:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 },
  stat:     { background: 'white', borderRadius: 10, padding: '11px 8px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  statValue:{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 },
  statLabel:{ fontSize: 10.5, color: '#888', marginTop: 3 },

  panel:     { background: 'white', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  panelLabel:{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },

  sentBar:    { display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden' },
  sentSeg:    { color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28 },
  legend:     { display: 'flex', gap: 12, marginTop: 8, fontSize: 11.5, color: '#555' },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  dot:        { width: 9, height: 9, borderRadius: '50%' },
  overall: (label) => ({ color: label === '부정 우세' ? '#dc2626' : label === '긍정 우세' ? '#16a34a' : '#888', fontWeight: 700 }),

  mediaRow:  { display: 'grid', gridTemplateColumns: '110px 1fr 60px', gap: 8, alignItems: 'center', padding: '4px 0' },
  mediaName: { fontSize: 12, fontWeight: 600, color: '#333' },
  mediaCnt:  { fontSize: 12, color: '#555', textAlign: 'right' },
  barWrap:   { background: '#f0ede8', height: 10, borderRadius: 5, overflow: 'hidden' },
  bar:       { height: '100%', borderRadius: 5, transition: 'width .3s' },

  group:     { padding: '8px 0', borderBottom: '1px solid #f0ede8' },
  groupTitle:{ fontSize: 13, fontWeight: 700, color: '#0d1117', textDecoration: 'none' },
  groupMeta: { fontSize: 11.5, color: '#666', marginTop: 3 },

  list:        { listStyle: 'decimal', padding: 0, paddingLeft: 18, margin: 0 },
  item:        { padding: '8px 0', borderBottom: '1px solid #f0ede8' },
  itemTitle:   { fontSize: 13.5, fontWeight: 700, color: '#0d1117', textDecoration: 'none', lineHeight: 1.5 },
  itemMeta:    { fontSize: 11.5, color: '#666', marginTop: 3 },
  itemSummary: { fontSize: 12, color: '#444', marginTop: 4, lineHeight: 1.6 },
  src:         { color: '#0d1117', fontWeight: 600 },
  sentTag: (label) => ({
    color: label === '긍정' ? '#16a34a' : label === '부정' ? '#dc2626' : '#888',
    fontWeight: 700,
  }),
};
