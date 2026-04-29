// ─────────────────────────────────────────────
// ReportDetail.jsx — 단일 리포트 마스터·디테일
// 모든 외부 링크는 React JSX <a target=_blank rel=noopener noreferrer>.
// 기사 본문은 토글로 펼치기/접기.
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react';
import {
  downloadReportPdf, previewReportPdf, reportHtmlDebugUrl,
  reextractReport, reextractArticle, downloadNegativePdf,
} from '../../services/api.js';
import { fmtFull, fmtRelative, fmtShort } from '../../utils/datetime.js';

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

function Stat({ label, value, color, sub }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statValue, color }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
      {sub && <div style={S.statSub}>{sub}</div>}
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

function PriorityBadge({ p }) {
  const map = {
    '긴급': { bg: '#fee2e2', fg: '#991b1b', icon: '🚨' },
    '주의': { bg: '#fef3c7', fg: '#92400e', icon: '⚠️' },
    '참고': { bg: '#dcfce7', fg: '#166534', icon: 'ℹ️' },
  };
  const v = map[p] || map['참고'];
  return <span style={{ ...S.prio, background: v.bg, color: v.fg }}>{v.icon} {p}</span>;
}

function ArticleItem({ idx, art, viewMode = 'paper', onReextract }) {
  const [busyOne, setBusyOne] = useState(false);
  async function handleOneReextract() {
    if (!onReextract) return;
    setBusyOne(true);
    try { await onReextract(art.id); } finally { setBusyOne(false); }
  }
  const [open, setOpen] = useState(viewMode === 'paper');     // 원문형은 기본 펼침
  const sentColor = art.sentiment?.label === '긍정' ? '#16a34a'
                  : art.sentiment?.label === '부정' ? '#dc2626' : '#888';
  const matched = art.sentiment?.matchedKeywords || { positive: [], negative: [] };
  const reasons = art.sentiment?.reasons || [];
  const depts = (art.departments || []).map(d => d.name).join(', ');
  return (
    <li style={viewMode === 'paper' ? { ...S.item, ...S.paperItem } : S.item}>
      {viewMode === 'paper' ? (
        // 원문형: 헤더 라인 (언론사 · 날짜 · 우선순위)
        <div style={S.paperSrc}>
          <span style={S.paperSrcName}>{art.source || '미상'}</span>
          {art.mediaType && <span style={S.paperBadge}>{art.mediaType}</span>}
          {art.sourceProvider && <span style={S.paperBadge}>{art.sourceProvider === 'naver' ? '🇰🇷 Naver' : '🌍 Google'}</span>}
          <span style={S.spacer} />
          <PriorityBadge p={art.priority || '참고'} />
        </div>
      ) : null}
      {viewMode === 'paper' ? (
        <div style={S.paperTitle}>[{idx}] {art.title}</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <PriorityBadge p={art.priority || '참고'} />
          <ExternalLink href={art.url} style={S.itemTitle}>
            [{idx}] {art.title}
          </ExternalLink>
        </div>
      )}
      <div style={S.itemMeta}>
        <span style={S.src}>[{art.source || '미상'}]</span>{' '}
        {art.date && <span>{art.date}</span>}
        {art.reporter && <span> · {art.reporter}</span>}
        {' · '}#{art.keyword}
        {art.mediaType ? ` · ${art.mediaType}` : ''}
        {art.sentiment?.issueType ? ` · ${art.sentiment.issueType}` : ''}
        {art.sentiment?.label && (
          <span style={{ color: sentColor, fontWeight: 700 }}> · {art.sentiment.label} ({art.sentiment.score})</span>
        )}
        {' · '}
        {art.extracted ? <span style={{ color: '#16a34a' }}>본문✓</span>
                       : <span style={{ color: '#dc2626' }}>추출 실패</span>}
      </div>
      {depts && (
        <div style={S.deptLine}>🏛 관련 부서: <strong>{depts}</strong></div>
      )}
      {(reasons.length > 0 || matched.positive.length || matched.negative.length) && (
        <div style={S.evidence}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>판단 근거</div>
          <div style={{ fontSize: 12, color: '#444', marginTop: 3 }}>
            {reasons.join(' · ')}
          </div>
          {(matched.positive.length || matched.negative.length) ? (
            <div style={{ fontSize: 11.5, marginTop: 4 }}>
              {matched.positive.length > 0 && (
                <span style={{ color: '#16a34a' }}>긍정: {matched.positive.join(', ')}</span>
              )}
              {matched.positive.length > 0 && matched.negative.length > 0 && ' · '}
              {matched.negative.length > 0 && (
                <span style={{ color: '#dc2626' }}>부정: {matched.negative.join(', ')}</span>
              )}
            </div>
          ) : null}
        </div>
      )}
      {art.briefLine && (
        <div style={S.briefLine}>📝 <strong>보고용 한 줄:</strong> {art.briefLine}</div>
      )}
      {viewMode === 'analytic' && art.summary && <div style={S.itemSummary}>{art.summary}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
        <button style={S.toggleBtn} onClick={() => setOpen(o => !o)}>
          {open ? '▲ 본문 접기' : '▼ 본문 펼치기'}
        </button>
        {!art.extracted && art.url && (
          <a href={art.url} target="_blank" rel="noopener noreferrer" style={S.origLink}>
            🔗 원문 보기
          </a>
        )}
        {!art.extracted && onReextract && (
          <button style={S.reextOne} onClick={handleOneReextract} disabled={busyOne}>
            {busyOne ? '⏳ 재추출…' : '🔄 이 기사 재추출'}
          </button>
        )}
      </div>

      {open && (
        <div style={S.body}>
          {art.images?.length > 0 && (
            <div style={S.imgRow}>
              {art.images.slice(0, 3).map((img, i) => (
                <figure key={i} style={S.imgFig}>
                  <img src={img.url} referrerPolicy="no-referrer" loading="lazy"
                       onError={(e) => { e.target.style.display = 'none'; }}
                       style={S.imgEl} />
                  {img.caption && <figcaption style={S.imgCap}>{img.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
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

export default function ReportDetail({ report, onClose, onEmail, onReportRefresh, sending }) {
  const [pdfBusy,   setPdfBusy]   = useState('');     // 'preview' | 'download' | 'negative' | ''
  const [pdfError,  setPdfError]  = useState('');
  const [pdfOk,     setPdfOk]     = useState('');
  const [viewMode,  setViewMode]  = useState('paper');     // 'paper' | 'analytic' | 'failures'
  const [negFirst,  setNegFirst]  = useState(true);
  const [reextBusy, setReextBusy] = useState('');     // 'all' | 'failed' | id | ''

  if (!report) return null;
  const articlesRaw = report.articles || [];
  const sentiment   = report.sentiment   || {};
  const mediaCounts = report.mediaCounts || {};
  const trending    = report.trending    || [];
  const groups      = report.groups      || [];
  const summaryText = report.summaryText || '';
  const riskLevel   = report.riskLevel   || { level: '안정', reasons: [] };
  const total       = articlesRaw.length;

  // 부정 우선 정렬 + 실패 전용 보기 필터
  const a = useMemo(() => {
    let list = articlesRaw;
    if (viewMode === 'failures') list = list.filter(x => !x.extracted);
    if (negFirst) {
      const order = { 긴급: 0, 주의: 1, 참고: 2 };
      const sentOrder = { '부정': 0, '중립': 1, '긍정': 2 };
      list = [...list].sort((x, y) =>
        (order[x.priority] ?? 3) - (order[y.priority] ?? 3) ||
        (sentOrder[x.sentiment?.label] ?? 3) - (sentOrder[y.sentiment?.label] ?? 3)
      );
    }
    return list;
  }, [articlesRaw, negFirst, viewMode]);

  // 추출 통계 (서버 stats 우선, 없으면 클라이언트 계산)
  const stats = useMemo(() => {
    if (report.extractionStats) return report.extractionStats;
    const ext = articlesRaw.filter(x => x.extracted).length;
    const img = articlesRaw.filter(x => (x.images?.length || 0) > 0).length;
    return {
      total: articlesRaw.length, extracted: ext, failed: articlesRaw.length - ext,
      withImage: img, withoutImage: articlesRaw.length - img,
      quality: { success: ext, partial: 0, fallback: 0, failed: articlesRaw.length - ext },
    };
  }, [report.extractionStats, articlesRaw]);
  const extractRate = stats.total ? Math.round((stats.extracted / stats.total) * 100) : 0;

  async function onPreview() {
    setPdfBusy('preview'); setPdfError(''); setPdfOk('');
    try {
      const r = await previewReportPdf(report.id);
      setPdfOk(`📄 미리보기 창 열림 (${r.filename})`);
    } catch (e) {
      setPdfError(e.message || String(e));
    } finally {
      setPdfBusy('');
    }
  }
  async function onDownload() {
    setPdfBusy('download'); setPdfError(''); setPdfOk('');
    try {
      const r = await downloadReportPdf(report.id);
      setPdfOk(`💾 다운로드 완료 — ${r.filename} (${(r.size/1024).toFixed(0)} KB)`);
    } catch (e) {
      setPdfError(e.message || String(e));
    } finally {
      setPdfBusy('');
    }
  }
  async function onDownloadNegative() {
    setPdfBusy('negative'); setPdfError(''); setPdfOk('');
    try {
      const r = await downloadNegativePdf(report.id);
      setPdfOk(`💾 부정 이슈 PDF 다운로드 완료 — ${r.filename} (${(r.size/1024).toFixed(0)} KB)`);
    } catch (e) {
      setPdfError(e.message || String(e));
    } finally {
      setPdfBusy('');
    }
  }
  async function onReextract(scope) {
    setReextBusy(scope); setPdfError(''); setPdfOk('');
    try {
      const r = await reextractReport(report.id, { failedOnly: scope === 'failed' });
      setPdfOk(`🔄 재추출 완료 (${r.reextracted}건)`);
      onReportRefresh && onReportRefresh(r.report);
    } catch (e) {
      setPdfError(e.message || String(e));
    } finally {
      setReextBusy('');
    }
  }

  const mediaEntries = Object.entries(mediaCounts).filter(([, v]) => v > 0);
  const mediaMax     = Math.max(1, ...mediaEntries.map(([, v]) => v));

  return (
    <div style={S.wrap}>
      {/* 액션 바 */}
      <div style={S.actBar}>
        <button onClick={onClose} style={S.back}>← 목록</button>
        <div style={S.spacer} />
        <button onClick={onPreview} disabled={!!pdfBusy} style={S.linkBtn}>
          {pdfBusy === 'preview' ? '⏳ 생성 중…' : '🔍 PDF 미리보기'}
        </button>
        <button onClick={onDownload} disabled={!!pdfBusy} style={S.pdfBtn}>
          {pdfBusy === 'download' ? '⏳ 생성 중…' : '📄 PDF 다운로드'}
        </button>
        <button onClick={onDownloadNegative} disabled={!!pdfBusy} style={S.negPdfBtn}>
          {pdfBusy === 'negative' ? '⏳ 생성 중…' : '🚨 부정 PDF'}
        </button>
        <button onClick={() => onEmail(report.id)} style={S.mail} disabled={sending}>
          {sending ? '발송 중…' : '✉️ 메일'}
        </button>
      </div>

      {/* PDF 품질 + 재추출 액션 */}
      <div style={S.qualityBar}>
        <div style={S.qualityText}>
          📰 본문 추출 <strong>{stats.extracted}/{stats.total}건</strong> ({extractRate}%) ·
          🖼 이미지 포함 <strong>{stats.withImage}/{stats.total}건</strong> ·
          ⚠️ 실패 <strong style={{ color: stats.failed > 0 ? '#dc2626' : '#888' }}>{stats.failed}건</strong>
        </div>
        <div style={S.qualityActions}>
          {stats.failed > 0 && (
            <button onClick={() => onReextract('failed')} disabled={!!reextBusy} style={S.reextBtn}>
              {reextBusy === 'failed' ? '⏳ 재추출 중…' : `🔄 실패 ${stats.failed}건 재추출`}
            </button>
          )}
          <button onClick={() => onReextract('all')} disabled={!!reextBusy} style={S.reextBtnSm}>
            {reextBusy === 'all' ? '⏳…' : '↻ 전체 재추출'}
          </button>
        </div>
      </div>

      {/* PDF 상태 메시지 */}
      {pdfError && (
        <div style={S.errBox}>
          ⚠️ {pdfError}
          <a href={reportHtmlDebugUrl(report.id)} target="_blank" rel="noopener noreferrer" style={S.debugLink}>
            (HTML 디버그 보기 →)
          </a>
        </div>
      )}
      {pdfOk && <div style={S.okBox}>{pdfOk}</div>}

      {/* 보기 모드 + 정렬 토글 */}
      <div style={S.toolRow}>
        <div style={S.viewToggle}>
          {[
            { v: 'paper',    l: '📰 원문형' },
            { v: 'analytic', l: '📊 분석형' },
            { v: 'failures', l: `⚠️ 실패만 (${stats.failed})`, dim: stats.failed === 0 },
          ].map(o => (
            <button key={o.v} onClick={() => setViewMode(o.v)}
              disabled={o.dim}
              style={{ ...S.viewBtn, ...(viewMode === o.v ? S.viewOn : {}), ...(o.dim ? S.viewDim : {}) }}>{o.l}</button>
          ))}
        </div>
        <label style={S.negToggle}>
          <input type="checkbox" checked={negFirst} onChange={e => setNegFirst(e.target.checked)} />
          <span>부정/긴급 우선 정렬</span>
        </label>
      </div>

      {/* 헤더 */}
      <div style={S.head}>
        <div style={S.title}>📰 {report.title || '법무부 언론보도 모니터링 일일보고'}</div>
        <div style={S.meta}>
          📅 생성: <strong>{fmtFull(report.generatedAt)}</strong>{' '}
          <span style={S.metaSub}>({fmtRelative(report.generatedAt)})</span>{' '}
          · 🔄 {report.trigger === 'scheduled' ? '예약 실행' : '수동 실행'}
          {' · '}🆔 <span style={S.id}>{report.id}</span>
        </div>
        {report.period && (
          <div style={S.metaSub2}>
            📆 수집 기간: {fmtShort(report.period.from)} ~ {fmtShort(report.period.to)} ({report.period.label})
            {(report.period.outOfRange > 0 || report.period.parseFailed > 0) && (
              <span style={{ marginLeft: 8, color: '#888' }}>
                · 기간 외 제외 <strong>{report.period.outOfRange}건</strong>
                {report.period.parseFailed > 0 && ` · 날짜 파싱 실패 ${report.period.parseFailed}건`}
              </span>
            )}
          </div>
        )}
        <div style={S.kwRow}>
          {(report.keywords || []).map(k => <span key={k} style={S.kw}>#{k}</span>)}
          {(report.excludes || []).map(k => <span key={k} style={S.exKw}>−{k}</span>)}
        </div>
      </div>

      {/* 위험도 배지 */}
      <RiskBadge level={riskLevel.level} reasons={riskLevel.reasons} />

      {/* 총평 / 주요 동향 / 대응 — 법무부 보고 형식 */}
      {report.briefingText?.총평 ? (
        <div style={S.summary}>
          <div style={S.summaryLabel}>📝 일일 보고</div>
          <div style={{ ...S.summaryText, marginTop: 4 }}><strong>총평:</strong> {report.briefingText.총평}</div>
          {report.briefingText.주요보도동향 && (
            <div style={{ ...S.summaryText, marginTop: 6 }}><strong>주요 보도 동향:</strong> {report.briefingText.주요보도동향}</div>
          )}
          {report.briefingText.대응필요이슈 && (
            <div style={{ ...S.summaryText, marginTop: 6, color: report.actionRequired?.length ? '#9a3412' : '#222' }}>
              <strong>대응 필요 이슈:</strong> {report.briefingText.대응필요이슈}
            </div>
          )}
          {report.briefingText.관련부서참고사항 && (
            <div style={{ ...S.summaryText, marginTop: 6 }}><strong>관련 부서:</strong> {report.briefingText.관련부서참고사항}</div>
          )}
        </div>
      ) : summaryText ? (
        <div style={S.summary}>
          <div style={S.summaryLabel}>📝 오늘의 요약</div>
          <div style={S.summaryText}>{summaryText}</div>
        </div>
      ) : null}

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

      {/* 4-카드 요약 */}
      <div data-stats-grid style={S.stats}>
        <Stat label="총 보도"     value={total}                                     color="#0d1117" />
        <Stat label="부정 이슈"   value={sentiment.negative || 0}                  color="#dc2626" sub={`${sentiment.negativePct || 0}%`} />
        <Stat label="본문 추출률" value={`${extractRate}%`}                         color={extractRate >= 80 ? '#16a34a' : extractRate >= 50 ? '#f59e0b' : '#dc2626'}
              sub={`${stats.extracted}/${stats.total}`} />
        <Stat label="대응 필요"   value={(report.actionRequired?.length || 0)}     color="#9a3412" sub={`긴급 ${report.actionRequired?.filter(x=>x.priority==='긴급').length || 0}`} />
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

      {/* 부정 이슈 TOP */}
      {(report.negativeIssues || []).length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>🔴 부정 이슈 TOP {report.negativeIssues.length}</div>
          <ol style={S.list}>
            {report.negativeIssues.map((art, i) => (
              <li key={art.id || i} style={S.itemSmall}>
                <PriorityBadge p={art.priority || '참고'} />
                <ExternalLink href={art.url} style={S.itemTitle}>{art.title}</ExternalLink>
                <div style={S.itemMeta}>[{art.source}] · 부정 키워드: {(art.sentiment?.matchedKeywords?.negative || []).slice(0, 5).join(', ') || '—'}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 긍정 이슈 TOP */}
      {(report.positiveIssues || []).length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>🟢 긍정 이슈 TOP {report.positiveIssues.length}</div>
          <ol style={S.list}>
            {report.positiveIssues.map((art, i) => (
              <li key={art.id || i} style={S.itemSmall}>
                <ExternalLink href={art.url} style={S.itemTitle}>{art.title}</ExternalLink>
                <div style={S.itemMeta}>[{art.source}] · 긍정 키워드: {(art.sentiment?.matchedKeywords?.positive || []).slice(0, 5).join(', ') || '—'}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 결과 0건 친절 안내 */}
      {total === 0 && report.collectionDiagnostics?.length > 0 && (
        <div style={S.zeroBox}>
          <div style={S.zeroTitle}>📭 최종 수집 결과 0건</div>
          <div style={S.zeroDetail}>
            {(() => {
              const totalRaw    = report.collectionDiagnostics.reduce((s, d) => s + (d.raw || 0), 0);
              const totalDateOut= report.collectionDiagnostics.reduce((s, d) => s + (d.dateOut || 0), 0);
              if (totalRaw === 0) return '뉴스 소스에서 검색 결과를 가져오지 못했습니다. 관리 → 검색 테스트로 raw 결과를 확인해 보세요.';
              return `Raw 검색 결과는 ${totalRaw}건이 있었으나, 기간 외 제외(${totalDateOut}건) 등으로 모두 제외되었습니다. 수집 기간을 늘리거나 키워드를 단순화해 보세요.`;
            })()}
          </div>
        </div>
      )}

      {/* 수집 진단 패널 — 키워드 × 소스 매트릭스 */}
      {report.collectionDiagnostics?.length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>🔬 수집 진단 (키워드별·소스별 단계 손실)</div>
          <div style={S.diagBox}>
            <div style={S.diagHead}>
              <span>키워드</span>
              <span>소스</span>
              <span>raw</span>
              <span>기간</span>
              <span>중복</span>
              <span>제외</span>
              <span>최종</span>
            </div>
            {report.collectionDiagnostics.map((d, i) => (
              <div key={i} style={{ ...S.diagRow, ...(d.error ? S.diagRowErr : d.final === 0 ? S.diagRowZero : {}) }}>
                <span style={S.diagKw}>{d.keyword}</span>
                <span style={S.diagSrc}>{d.source === 'google' ? '🌍' : '🇰🇷'} {d.source}</span>
                <span>{d.raw}</span>
                <span style={d.dateOut > 0 ? { color: '#dc2626' } : null}>−{d.dateOut}</span>
                <span style={d.dedupeOut > 0 ? { color: '#92400e' } : null}>−{d.dedupeOut}</span>
                <span style={d.excludeOut > 0 ? { color: '#92400e' } : null}>−{d.excludeOut}</span>
                <span style={S.diagFinal}>{d.final}</span>
              </div>
            ))}
          </div>
          {report.dateUnknownCount > 0 && (
            <div style={S.diagNote}>
              ℹ️ 날짜 미확인 기사 {report.dateUnknownCount}건이 포함되어 있습니다. (기본 보존)
            </div>
          )}
        </div>
      )}

      {/* 소스별 통계 */}
      {report.sourceCounts && Object.keys(report.sourceCounts).length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>🌐 뉴스 소스별 수집량</div>
          {Object.entries(report.sourceCounts).map(([k, v]) => (
            <div key={k} style={S.deptRow}>
              <span style={S.deptName}>{k === 'google' ? '🌍 Google News' : k === 'naver' ? '🇰🇷 Naver News' : k}</span>
              <span style={S.deptCnt}>{v}건</span>
            </div>
          ))}
        </div>
      )}

      {/* 부서별 분포 */}
      {report.departmentCounts && Object.keys(report.departmentCounts).length > 0 && (
        <div style={S.panel}>
          <div style={S.panelLabel}>🏛 관련 부서별 보도량</div>
          {Object.entries(report.departmentCounts).map(([k, v]) => (
            <div key={k} style={S.deptRow}>
              <span style={S.deptName}>{k}</span>
              <span style={S.deptCnt}>{v}건</span>
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
          {a.map((art, i) => (
            <ArticleItem
              key={art.id || i}
              idx={i + 1}
              art={art}
              viewMode={viewMode}
              onReextract={async (articleId) => {
                try {
                  const r = await reextractArticle(report.id, articleId);
                  onReportRefresh && onReportRefresh(r.report);
                } catch (e) {
                  setPdfError(e.message);
                }
              }}
            />
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

  metaSub2:    { fontSize: 12, color: '#555', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 },
  prio:        { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  evidence:    { background: '#f8f6f2', borderLeft: '2px solid #0d1117', borderRadius: 4, padding: '6px 10px', margin: '6px 0' },
  deptLine:    { fontSize: 12, color: '#444', marginTop: 4 },
  itemSmall:   { padding: '7px 0', borderBottom: '1px solid #f0ede8', fontSize: 13 },

  imgRow:      { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  imgFig:      { margin: 0, flex: '1 1 30%', minWidth: 120, maxWidth: '32%' },
  imgEl:       { width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 6, background: '#eee' },
  imgCap:      { fontSize: 11, color: '#666', marginTop: 2 },

  deptRow:     { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0ede8', fontSize: 13 },
  deptName:    { color: '#0d1117' },
  deptCnt:     { color: '#555', fontWeight: 600 },

  // PDF 상태
  errBox:      { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
                 padding: '10px 12px', borderRadius: 8, fontSize: 12.5, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  okBox:       { background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
                 padding: '8px 12px', borderRadius: 8, fontSize: 12.5 },
  debugLink:   { color: '#0d1117', textDecoration: 'underline' },

  // 보기 모드 / 정렬 토글
  toolRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                 background: 'white', borderRadius: 10, padding: '8px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  viewToggle:  { display: 'flex', gap: 4, background: '#f0ede8', borderRadius: 8, padding: 3 },
  viewBtn:     { padding: '6px 12px', minHeight: 36, borderRadius: 6, border: 'none', background: 'transparent', color: '#555',
                 fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  viewOn:      { background: '#0d1117', color: 'white' },
  negToggle:   { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#444', cursor: 'pointer' },

  // 원문형 카드 변형
  paperItem:   { padding: '14px 14px', borderRadius: 10, border: '1px solid #f0ede8', background: '#fafaf6' },
  paperSrc:    { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, borderBottom: '1px solid #d5d0c8',
                 fontSize: 12, color: '#555' },
  paperSrcName:{ fontWeight: 700, color: '#0d1117', fontSize: 13 },
  paperBadge:  { padding: '1px 7px', borderRadius: 8, background: 'white', border: '1px solid #d5d0c8', fontSize: 10.5, color: '#666' },
  paperTitle:  { fontFamily: "'Noto Serif KR','Noto Sans KR',serif", fontSize: 17, fontWeight: 700,
                 color: '#0d1117', lineHeight: 1.4, margin: '8px 0 4px' },
  briefLine:   { background: '#f8f6f2', borderLeft: '2px solid #0d1117',
                 padding: '6px 11px', margin: '8px 0', fontSize: 12.5, lineHeight: 1.6 },

  statSub:     { fontSize: 10.5, color: '#888', marginTop: 2 },

  qualityBar:    { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                   background: 'white', borderRadius: 10, padding: '10px 14px',
                   boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  qualityText:   { flex: '1 1 280px', fontSize: 12.5, color: '#444', lineHeight: 1.6 },
  qualityActions:{ display: 'flex', gap: 6, flexWrap: 'wrap' },
  reextBtn:      { padding: '8px 12px', minHeight: 38, borderRadius: 7, border: 'none',
                   background: '#f59e0b', color: 'white', fontSize: 12.5, fontWeight: 700,
                   cursor: 'pointer', fontFamily: 'inherit' },
  reextBtnSm:    { padding: '8px 12px', minHeight: 38, borderRadius: 7,
                   border: '1.5px solid #d5d0c8', background: 'white', color: '#444',
                   fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  negPdfBtn:     { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: 'none',
                   background: '#dc2626', color: 'white', fontSize: 12.5, fontWeight: 700,
                   cursor: 'pointer', fontFamily: 'inherit' },

  viewDim:       { opacity: 0.4, cursor: 'not-allowed' },

  origLink:      { padding: '6px 11px', minHeight: 32, borderRadius: 7,
                   border: '1.5px solid #2563eb', background: '#eff6ff', color: '#2563eb',
                   fontSize: 12, fontWeight: 600, textDecoration: 'none' },
  reextOne:      { padding: '6px 11px', minHeight: 32, borderRadius: 7, border: 'none',
                   background: '#f59e0b', color: 'white', fontSize: 12, fontWeight: 600,
                   cursor: 'pointer', fontFamily: 'inherit' },

  zeroBox:    { background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412',
                borderRadius: 10, padding: '12px 16px' },
  zeroTitle:  { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  zeroDetail: { fontSize: 13, lineHeight: 1.6 },

  diagBox:    { background: 'white', borderRadius: 8, overflow: 'hidden' },
  diagHead:   { display: 'grid', gridTemplateColumns: '1.5fr 80px 50px 50px 50px 50px 50px', gap: 6,
                padding: '7px 4px', borderBottom: '1.5pt solid #0d1117',
                fontSize: 10.5, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' },
  diagRow:    { display: 'grid', gridTemplateColumns: '1.5fr 80px 50px 50px 50px 50px 50px', gap: 6,
                padding: '7px 4px', borderBottom: '1px solid #f0ede8', fontSize: 12 },
  diagRowErr: { background: '#fff5f5', color: '#c53030' },
  diagRowZero:{ background: '#fafaf6', color: '#888' },
  diagKw:     { fontWeight: 600, color: '#0d1117' },
  diagSrc:    { color: '#555' },
  diagFinal:  { fontWeight: 700, color: '#0d1117' },
  diagNote:   { fontSize: 11.5, color: '#666', marginTop: 8 },
};
