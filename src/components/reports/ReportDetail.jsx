// ─────────────────────────────────────────────
// ReportDetail.jsx — 단일 리포트 마스터·디테일
// 모든 외부 링크는 React JSX <a target=_blank rel=noopener noreferrer>.
// 기사 본문은 토글로 펼치기/접기.
// ─────────────────────────────────────────────

import { useState } from 'react';
import { reportHtmlUrl, reportPdfUrl } from '../../services/api.js';
import { fmtFull, fmtRelative } from '../../utils/datetime.js';

function safeUrl(u = '') {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function ExternalLink({ href, children, style }) {
  const u = safeUrl(href);
  if (!u) return <span style={style}>{children}</span>;
  return (
    <a href={u} target="_blank" rel="noopener noreferrer" style={style}>{children}</a>
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

function RiskBadge({ level, reasons }) {
  const map = {
    '긴급': { bg: '#fee2e2', fg: '#991b1b', icon: '🚨' },
    '주의': { bg: '#fef3c7', fg: '#92400e', icon: '⚠️' },
    '안정': { bg: '#dcfce7', fg: '#166534', icon: '✅' },
  };
  const v = map[level] || map['안정'];
  return (
    <div style={{ ...S.risk, background: v.bg, color: v.fg }}>
      <strong>{v.icon} {level}</strong>
      {reasons?.length ? <span style={{ marginLeft: 8, fontSize: 12 }}>· {reasons.join(' · ')}</span> : null}
    </div>
  );
}

function ArticleItem({ idx, art }) {
  const [open, setOpen] = useState(false);
  const sentColor = art.sentiment?.label === '긍정' ? '#16a34a'
                  : art.sentiment?.label === '부정' ? '#dc2626' : '#888';
  return (
    <li style={S.item}>
      <div>
        <ExternalLink href={art.url} style={S.itemTitle}>
          [{idx}] {art.title}
        </ExternalLink>
      </div>
      <div style={S.itemMeta}>
        <span style={S.src}>[{art.source || '미상'}]</span>{' '}
        {art.date && <span>{art.date}</span>}
        {' · '}#{art.keyword}
        {art.mediaType ? ` · ${art.mediaType}` : ''}
        {art.sentiment?.label && (
          <span style={{ color: sentColor, fontWeight: 700 }}> · {art.sentiment.label}</span>
        )}
        {' · '}
        {art.extracted ? <span style={{ color: '#16a34a' }}>본문 추출✓</span>
                       : <span style={{ color: '#dc2626' }}>추출 실패</span>}
      </div>
      {art.summary && <div style={S.itemSummary}>{art.summary}</div>}

      <button style={S.toggleBtn} onClick={() => setOpen(o => !o)}>
        {open ? '▲ 본문 접기' : '▼ 본문 펼치기'}
      </button>

      {open && (
        <div style={S.body}>
          {art.extracted && art.contentText ? (
            art.contentText.split(/\n+/).map((p, i) => (
              <p key={i} style={S.para}>{p}</p>
            ))
          ) : (
            <div style={S.bodyMissing}>
              ⚠️ 본문 자동 추출에 실패했습니다 ({art.extractionError || 'no body'}).{' '}
              <ExternalLink href={art.url} style={{ color: '#2563eb' }}>원문 링크</ExternalLink>{'에서 직접 확인하세요.'}
            </div>
          )}
        </div>
      )}
    </li>
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
  const riskLevel   = report.riskLevel   || { level: '안정', reasons: [] };
  const total       = a.length;

  const mediaEntries = Object.entries(mediaCounts).filter(([, v]) => v > 0);
  const mediaMax     = Math.max(1, ...mediaEntries.map(([, v]) => v));

  return (
    <div style={S.wrap}>
      {/* 액션 바 */}
      <div style={S.actBar}>
        <button onClick={onClose} style={S.back}>← 목록</button>
        <div style={S.spacer} />
        <ExternalLink href={reportPdfUrl(report.id)} style={S.pdfBtn}>
          📄 PDF 다운로드
        </ExternalLink>
        <ExternalLink href={reportHtmlUrl(report.id)} style={S.linkBtn}>
          🔍 미리보기
        </ExternalLink>
        <button onClick={() => onEmail(report.id)} style={S.mail} disabled={sending}>
          {sending ? '발송 중…' : '✉️ 메일'}
        </button>
      </div>

      {/* 헤더 */}
      <div style={S.head}>
        <div style={S.title}>📰 일일 언론보도 보고서</div>
        <div style={S.meta}>
          📅 생성: <strong>{fmtFull(report.generatedAt)}</strong>{' '}
          <span style={S.metaSub}>({fmtRelative(report.generatedAt)})</span>{' '}
          · 🔄 {report.trigger === 'scheduled' ? '예약 실행' : '수동 실행'}
          {' · '}🆔 <span style={S.id}>{report.id}</span>
        </div>
        <div style={S.kwRow}>
          {(report.keywords || []).map(k => <span key={k} style={S.kw}>#{k}</span>)}
          {(report.excludes || []).map(k => <span key={k} style={S.exKw}>−{k}</span>)}
        </div>
      </div>

      {/* 위험도 배지 */}
      <RiskBadge level={riskLevel.level} reasons={riskLevel.reasons} />

      {/* 자동 요약 문장 */}
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
      {typeof report.extractedCount === 'number' && (
        <div style={S.extInfo}>
          🔎 본문 추출: <strong>{report.extractedCount}</strong> / {total}건 성공
          {report.extractedCount < total && (
            <span style={{ color: '#dc2626', marginLeft: 8 }}>· 실패 {total - report.extractedCount}건</span>
          )}
        </div>
      )}

      {/* 감정 분포 */}
      {sentiment.total > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>📊 감정 분포 — <span style={S.overall(sentiment.overall)}>{sentiment.overall}</span></div>
          <div style={S.sentBar}>
            <div style={{ ...S.sentSeg, background: '#16a34a', flexGrow: sentiment.positive || 0.001 }}>
              {sentiment.positivePct}%
            </div>
            <div style={{ ...S.sentSeg, background: '#dc2626', flexGrow: sentiment.negative || 0.001 }}>
              {sentiment.negativePct}%
            </div>
            <div style={{ ...S.sentSeg, background: '#94a3b8', flexGrow: sentiment.neutral || 0.001 }}>
              {sentiment.neutralPct}%
            </div>
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
              <div style={S.barWrap}>
                <div style={{ ...S.bar, width: `${Math.round((v / mediaMax) * 100)}%`, background: '#0d1117' }} />
              </div>
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
                <ExternalLink href={g.leadUrl} style={S.groupTitle}>{g.leadTitle}</ExternalLink>
              </div>
              <div style={S.groupMeta}>
                관련 보도 <strong>{g.count}건</strong> · {(g.sources || []).slice(0, 8).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 기사 목록 + 본문 토글 */}
      <div style={S.panel}>
        <div style={S.panelLabel}>📌 기사 전체 ({a.length}건) — 본문 펼치기 가능</div>
        <ol style={S.list}>
          {a.map((art, i) => <ArticleItem key={art.id || i} idx={i + 1} art={art} />)}
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
  pdfBtn: { padding: '9px 14px', minHeight: 40, borderRadius: 8, border: 'none',
            background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            boxShadow: '0 2px 6px rgba(13,17,23,.18)' },
  linkBtn:{ padding: '9px 13px', minHeight: 40, borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  mail:   { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: 'none', background: '#22c55e', color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  head:   { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  title:  { fontSize: 17, fontWeight: 800, marginBottom: 6 },
  meta:   { fontSize: 12.5, color: '#555', marginBottom: 8 },
  metaSub:{ color: '#94a3b8' },
  id:     { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#64748b' },
  kwRow:  { display: 'flex', flexWrap: 'wrap', gap: 4 },
  kw:     { fontSize: 11.5, padding: '2px 8px', borderRadius: 12, border: '1px solid #0d1117', color: '#0d1117' },
  exKw:   { fontSize: 11.5, padding: '2px 8px', borderRadius: 12, border: '1px solid #c53030', color: '#c53030' },

  risk:        { borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600 },

  summary:     { background: '#f8f6f2', borderLeft: '3px solid #0d1117', borderRadius: 6, padding: '11px 14px' },
  summaryLabel:{ fontSize: 11, color: '#666', fontWeight: 700, marginBottom: 4 },
  summaryText: { fontSize: 13.5, color: '#222', lineHeight: 1.7 },

  alert: { background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 500 },

  stats:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 },
  stat:     { background: 'white', borderRadius: 10, padding: '11px 8px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  statValue:{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 },
  statLabel:{ fontSize: 10.5, color: '#888', marginTop: 3 },

  extInfo:    { fontSize: 12, color: '#444', textAlign: 'center', padding: '4px 0' },

  panel:     { background: 'white', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  panelLabel:{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },

  sentBar:    { display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden' },
  sentSeg:    { color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28 },
  overall: (label) => ({ color: label === '부정 우세' ? '#dc2626' : label === '긍정 우세' ? '#16a34a' : '#888', fontWeight: 700 }),

  mediaRow:  { display: 'grid', gridTemplateColumns: '110px 1fr 60px', gap: 8, alignItems: 'center', padding: '4px 0' },
  mediaName: { fontSize: 12, fontWeight: 600, color: '#333' },
  mediaCnt:  { fontSize: 12, color: '#555', textAlign: 'right' },
  barWrap:   { background: '#f0ede8', height: 10, borderRadius: 5, overflow: 'hidden' },
  bar:       { height: '100%', borderRadius: 5, transition: 'width .3s' },

  group:     { padding: '8px 0', borderBottom: '1px solid #f0ede8' },
  groupTitle:{ fontSize: 13, fontWeight: 700, color: '#0d1117', textDecoration: 'none' },
  groupMeta: { fontSize: 11.5, color: '#666', marginTop: 3 },

  list:        { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item:        { padding: '10px 0', borderBottom: '1px solid #f0ede8' },
  itemTitle:   { fontSize: 13.5, fontWeight: 700, color: '#0d1117', textDecoration: 'none', lineHeight: 1.5 },
  itemMeta:    { fontSize: 11.5, color: '#666', marginTop: 4 },
  itemSummary: { fontSize: 12.5, color: '#444', marginTop: 6, lineHeight: 1.6 },
  src:         { color: '#0d1117', fontWeight: 600 },
  toggleBtn:   { marginTop: 7, padding: '6px 12px', minHeight: 32, borderRadius: 6, border: '1px solid #d5d0c8',
                 background: 'white', fontSize: 12, color: '#0d1117', cursor: 'pointer', fontFamily: 'inherit' },
  body:        { marginTop: 9, background: '#fafaf6', borderRadius: 7, padding: '10px 13px', border: '1px solid #f0ede8' },
  para:        { margin: '4px 0', fontSize: 13, color: '#222', lineHeight: 1.7 },
  bodyMissing: { fontSize: 12.5, color: '#dc2626' },
};
