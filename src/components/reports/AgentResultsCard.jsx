// ─────────────────────────────────────────────
// AgentResultsCard.jsx — 에이전트 분석 결과 표시 (7 섹션)
//
// report.agentResults 가 있을 때만 렌더된다. 비활성화/에러는 그대로 표기.
// ─────────────────────────────────────────────

function Section({ title, summary, children, badge, badgeColor }) {
  return (
    <div style={S.section}>
      <div style={S.sectionHead}>
        <span style={S.sectionTitle}>{title}</span>
        {badge && (
          <span style={{ ...S.badge, background: badgeColor || '#f1f5f9', color: '#0d1117' }}>
            {badge}
          </span>
        )}
      </div>
      {summary && <div style={S.summary}>{summary}</div>}
      {children}
    </div>
  );
}

function Skipped({ name }) {
  return <div style={S.skipped}>⚪ {name} 에이전트 비활성화됨</div>;
}

function CollectionBlock({ data }) {
  if (data?.skipped) return <Skipped name="수집" />;
  if (!data) return null;
  return (
    <Section
      title="① 수집 에이전트"
      summary={data.collectionSummary}
      badge={`${data.rawCount || 0}건`}
      badgeColor="#dbeafe"
    >
      {data.sourceCounts && Object.keys(data.sourceCounts).length > 0 && (
        <div style={S.kvRow}>
          {Object.entries(data.sourceCounts).map(([k, v]) => (
            <span key={k} style={S.kvTag}>{k}: <strong>{v}</strong></span>
          ))}
        </div>
      )}
      {data.failedSources?.length > 0 && (
        <div style={S.warn}>실패 소스: {data.failedSources.join(', ')}</div>
      )}
      {data.unusedKeywords?.length > 0 && (
        <div style={S.note}>
          누락 의심 키워드: {data.unusedKeywords.map(k => <span key={k} style={S.kvTag}>{k}</span>)}
        </div>
      )}
    </Section>
  );
}

function RelevanceBlock({ data }) {
  if (data?.skipped) return <Skipped name="관련성 검증" />;
  if (!data) return null;
  const dist = data.distribution || {};
  return (
    <Section
      title="② 관련성 검증 에이전트"
      summary={data.summary}
      badge={`통과율 ${data.passRate || 0}%`}
      badgeColor={data.passRate >= 70 ? '#dcfce7' : data.passRate >= 40 ? '#fef3c7' : '#fee2e2'}
    >
      <div style={S.kvRow}>
        <span style={S.kvTag}>높음 <strong>{dist.high || 0}</strong></span>
        <span style={S.kvTag}>보통 <strong>{dist.medium || 0}</strong></span>
        <span style={S.kvTag}>낮음 <strong>{dist.low || 0}</strong></span>
        <span style={S.kvTag}>없음 <strong>{dist.none || 0}</strong></span>
        <span style={S.kvTag}>자동 제외 <strong>{data.autoExcludedCount || 0}</strong></span>
        <span style={S.kvTag}>공공기관 매칭 <strong>{data.publicDomainHits || 0}</strong></span>
      </div>
      {data.autoExcluded?.length > 0 && (
        <details style={S.details}>
          <summary>자동 제외 사례 {data.autoExcluded.length}건 보기</summary>
          <ul style={S.list}>
            {data.autoExcluded.slice(0, 10).map(a => (
              <li key={a.id} style={S.listRow}>
                <span style={S.titleClip}>{a.title}</span>
                <span style={S.metaClip}>[{a.source}] · 점수 {a.score} · {a.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function RiskBlock({ data }) {
  if (data?.skipped) return <Skipped name="위험 이슈 감지" />;
  if (!data) return null;
  const colorMap = { '긴급': '#fee2e2', '주의': '#fef3c7', '안정': '#dcfce7' };
  return (
    <Section
      title="③ 위험 이슈 감지 에이전트"
      summary={data.summary}
      badge={data.level}
      badgeColor={colorMap[data.level] || '#f1f5f9'}
    >
      {data.reasons?.length > 0 && (
        <div style={S.note}>
          판단 근거: {data.reasons.map((r, i) => <span key={i} style={S.kvTag}>{r}</span>)}
        </div>
      )}
      {data.urgentArticles?.length > 0 && (
        <details style={S.details}>
          <summary>대응 필요 기사 {data.urgentArticles.length}건 보기</summary>
          <ul style={S.list}>
            {data.urgentArticles.slice(0, 8).map(a => (
              <li key={a.id} style={S.listRow}>
                <span style={S.titleClip}>{a.title}</span>
                <span style={S.metaClip}>
                  [{a.source}] · {a.priority}
                  {a.central ? ' · 중앙' : ''}
                  {a.negKeywords?.length ? ` · 부정: ${a.negKeywords.join(', ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {data.repeatedIssues?.length > 0 && (
        <div style={S.warn}>반복 이슈: {data.repeatedIssues[0].count}회 반복 — "{data.repeatedIssues[0].titles?.[0] || ''}"</div>
      )}
    </Section>
  );
}

function ReportBlock({ data }) {
  if (data?.skipped) return <Skipped name="보고서 작성" />;
  if (!data) return null;
  return (
    <Section
      title="④ 보고서 작성 에이전트"
      summary={data.dailyBrief}
      badge={data.llmEnabled ? 'LLM 보강' : '규칙 기반'}
      badgeColor={data.llmEnabled ? '#dcfce7' : '#f1f5f9'}
    >
      {data.executiveSummary && (
        <details style={S.details} open>
          <summary>📋 상급자 보고용 1페이지 요약</summary>
          <pre style={S.pre}>{data.executiveSummary}</pre>
        </details>
      )}
      {data.storyArc && (
        <details style={S.details}>
          <summary>📝 보고서 본문 (기·승·전·결)</summary>
          <div style={S.pre}>
            <p><strong>기:</strong> {data.storyArc.introduction}</p>
            <p><strong>승:</strong> {data.storyArc.development}</p>
            <p><strong>전:</strong> {data.storyArc.turn}</p>
            <p><strong>결:</strong> {data.storyArc.conclusion}</p>
          </div>
        </details>
      )}
      {data.responseRecommendation && (
        <details style={S.details}>
          <summary>🎯 대응 권고</summary>
          <pre style={S.pre}>{data.responseRecommendation}</pre>
        </details>
      )}
      {data.monitoringKeywords?.length > 0 && (
        <div style={S.note}>
          모니터링 키워드: {data.monitoringKeywords.map(k => <span key={k} style={S.kvTag}>#{k}</span>)}
        </div>
      )}
    </Section>
  );
}

function PublicityBlock({ data }) {
  if (data?.skipped) return <Skipped name="홍보성과" />;
  if (!data) return null;
  return (
    <Section
      title="⑤ 홍보성과 에이전트"
      summary={data.publicityInsight}
      badge={data.publicityRating}
      badgeColor="#dbeafe"
    >
      <div style={S.kvRow}>
        <span style={S.kvTag}>배포 <strong>{data.officialReleaseCount || 0}</strong></span>
        <span style={S.kvTag}>재인용 <strong>{data.recitationCount || 0}</strong></span>
        <span style={S.kvTag}>중앙 <strong>{data.centralCoverage || 0}</strong></span>
        <span style={S.kvTag}>클릭 <strong>{data.clickCount || 0}</strong></span>
        <span style={S.kvTag}>등급 <strong>{data.publicityRating}</strong></span>
      </div>
      {data.topItems?.length > 0 && (
        <details style={S.details}>
          <summary>평가 TOP {data.topItems.length} 보기</summary>
          <ul style={S.list}>
            {data.topItems.map(it => (
              <li key={it.id} style={S.listRow}>
                <span style={S.titleClip}>{it.title}</span>
                <span style={S.metaClip}>
                  [{it.source}] · 재인용 {it.reCiteCount}건 · 점수 {it.score}{it.centralCoverage ? ' · 중앙' : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function QualityBlock({ data }) {
  if (data?.skipped) return <Skipped name="품질 점검" />;
  if (!data) return null;
  const gradeColor = { '우수': '#dcfce7', '양호': '#dbeafe', '주의': '#fef3c7', '재검토 필요': '#fee2e2' };
  return (
    <Section
      title="⑥ 품질 점검 에이전트"
      summary={data.summary}
      badge={`${data.qualityScore}점 (${data.grade})`}
      badgeColor={gradeColor[data.grade] || '#f1f5f9'}
    >
      <div style={S.kvRow}>
        <span style={S.kvTag}>관련성 없음 <strong>{data.counts?.irrelevant || 0}</strong></span>
        <span style={S.kvTag}>추출 실패 <strong>{data.counts?.extractionFailed || 0}</strong></span>
        <span style={S.kvTag}>이미지 누락 <strong>{data.counts?.imageMissing || 0}</strong></span>
        <span style={S.kvTag}>한글 깨짐 의심 <strong>{data.counts?.brokenKoreanSuspect || 0}</strong></span>
        <span style={S.kvTag}>권장 다운로드 <strong>{(data.recommendedDownloadType || '').toUpperCase()}</strong></span>
      </div>
      {data.warnings?.length > 0 && (
        <ul style={S.warnList}>
          {data.warnings.map((w, i) => (
            <li key={i} style={{ ...S.warnItem, ...(w.level === 'error' ? S.warnErr : w.level === 'warn' ? S.warnWarn : S.warnInfo) }}>
              <strong>{w.level.toUpperCase()}</strong> · {w.message}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SuggestionBlock({ data }) {
  if (data?.skipped) return <Skipped name="개선 제안" />;
  if (!data) return null;
  return (
    <Section
      title="⑦ 개선 제안 에이전트"
      summary={data.summary}
      badge={`${(data.suggestedExcludeKeywords?.length || 0) + (data.suggestedDomainRules?.length || 0) + (data.suggestedFeatureImprovements?.length || 0)}건`}
      badgeColor="#f1f5f9"
    >
      {data.suggestedExcludeKeywords?.length > 0 && (
        <details style={S.details}>
          <summary>제외 키워드 추천 ({data.suggestedExcludeKeywords.length})</summary>
          <div style={S.kvRow}>
            {data.suggestedExcludeKeywords.map(w => (
              <span key={w.word} style={S.kvTag}>{w.word} ×{w.count}</span>
            ))}
          </div>
        </details>
      )}
      {data.suggestedDomainRules?.length > 0 && (
        <details style={S.details}>
          <summary>도메인 룰 제안 ({data.suggestedDomainRules.length})</summary>
          <ul style={S.list}>
            {data.suggestedDomainRules.map((d, i) => (
              <li key={i} style={S.listRow}>
                <span style={S.titleClip}>{d.domain}</span>
                <span style={S.metaClip}>{d.ruleType} · {d.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {data.suggestedKeywordCheck?.length > 0 && (
        <details style={S.details}>
          <summary>검색 누락 의심 키워드 ({data.suggestedKeywordCheck.length})</summary>
          <ul style={S.list}>
            {data.suggestedKeywordCheck.map((k, i) => (
              <li key={i} style={S.listRow}>
                <span style={S.titleClip}>{k.keyword}</span>
                <span style={S.metaClip}>{k.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {data.suggestedFeatureImprovements?.length > 0 && (
        <details style={S.details}>
          <summary>기능 개선 제안 ({data.suggestedFeatureImprovements.length})</summary>
          <ul style={S.list}>
            {data.suggestedFeatureImprovements.map((f, i) => (
              <li key={i} style={S.listRow}>
                <span style={S.titleClip}>{f.title} <em style={{ color: '#888' }}>({f.severity})</em></span>
                <span style={S.metaClip}>{f.excerpt}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

export default function AgentResultsCard({ report }) {
  const ar = report?.agentResults;
  if (!ar) return null;
  const meta = ar.runMeta || {};
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.headTitle}>🤖 에이전트 분석 결과</span>
        <span style={S.headMeta}>
          {meta.llmEnabled ? `LLM ${meta.llmProvider || '활성'}` : 'LLM 비활성 — 규칙 기반'}
          {meta.durationMs ? ` · ${meta.durationMs}ms` : ''}
          {meta.generatedAt ? ` · ${new Date(meta.generatedAt).toLocaleString('ko-KR')}` : ''}
        </span>
      </div>
      <CollectionBlock data={ar.collection} />
      <RelevanceBlock  data={ar.relevance}  />
      <RiskBlock       data={ar.risk}       />
      <ReportBlock     data={ar.report}     />
      <PublicityBlock  data={ar.publicity}  />
      <QualityBlock    data={ar.quality}    />
      <SuggestionBlock data={ar.suggestion} />
    </div>
  );
}

const S = {
  wrap:    { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', gap: 10 },
  head:    { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 8, borderBottom: '1px solid #f0ede8' },
  headTitle:{ fontSize: 14, fontWeight: 800, color: '#0d1117' },
  headMeta:{ fontSize: 11, color: '#666' },
  section: { background: '#fafaf6', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0ede8' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  sectionTitle:{ fontSize: 13, fontWeight: 700, color: '#0d1117' },
  badge:   { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  summary: { fontSize: 12.5, color: '#222', lineHeight: 1.6, marginBottom: 6 },
  kvRow:   { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  kvTag:   { fontSize: 11, color: '#444', background: 'white', border: '1px solid #e5e0d8', borderRadius: 8, padding: '2px 8px' },
  warn:    { fontSize: 12, color: '#92400e', marginTop: 6 },
  note:    { fontSize: 12, color: '#444', marginTop: 6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  details: { marginTop: 6, fontSize: 12 },
  pre:     { whiteSpace: 'pre-wrap', background: 'white', borderRadius: 6, padding: 8, fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.6, color: '#222', border: '1px solid #f0ede8' },
  list:    { listStyle: 'none', padding: 0, margin: 4, display: 'flex', flexDirection: 'column', gap: 4 },
  listRow: { background: 'white', borderRadius: 6, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  titleClip:{ fontSize: 12.5, color: '#0d1117', fontWeight: 600 },
  metaClip:{ fontSize: 11, color: '#666' },
  warnList:{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 4 },
  warnItem:{ fontSize: 12, padding: '6px 8px', borderRadius: 6 },
  warnErr: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  warnWarn:{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  warnInfo:{ background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe' },
  skipped: { fontSize: 12, color: '#888', padding: '8px 10px', background: '#fafaf6', borderRadius: 8, border: '1px dashed #d5d0c8' },
};
