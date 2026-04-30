// ─────────────────────────────────────────────
// CollectionDiagnosticsCard.jsx — 수집 진단 패널
// 키워드 × 소스 (google-rss / google-news-html / google-web-html / naver /
// officialAgency / custom) 단계별 카운트 + 0 건일 때 친절한 안내.
// ─────────────────────────────────────────────

const SOURCE_LABEL = {
  'google-rss':       'Google RSS',
  'google-news-html': 'Google News HTML',
  'google-web-html':  'Google Web HTML',
  'google':           'Google',           // 호환 (구버전 보고서)
  'naver':            'Naver',
  'officialAgency':   '공식기관',
  'custom':           '사용자 지정',
};

export default function CollectionDiagnosticsCard({ report }) {
  const diags  = report?.collectionDiagnostics || [];
  const keywords = report?.keywords || [];
  if (!diags.length) return null;

  // 키워드별 소스별 카운트 매트릭스
  const byKw = new Map();
  for (const d of diags) {
    if (!byKw.has(d.keyword)) byKw.set(d.keyword, []);
    byKw.get(d.keyword).push(d);
  }

  // 키워드별 총 final 합계 + 안내 메시지
  function emptyMessage(kw, rows) {
    const finalTotal = rows.reduce((s, r) => s + (r.final || 0), 0);
    if (finalTotal > 0) return null;
    // 어느 소스에서라도 raw > 0 이 있었으면 "필터로 빠짐"
    const anyRaw = rows.some(r => (r.raw || 0) > 0);
    if (anyRaw) {
      const sources = rows.filter(r => r.raw > 0).map(r => `${SOURCE_LABEL[r.source] || r.source} ${r.raw}건`);
      return `'${kw}' — 원본은 ${sources.join(', ')} 수집되었으나 날짜/중복/제외 필터로 0건이 됨. 수집 기간을 늘리거나 제외 키워드를 점검하세요.`;
    }
    // 모든 소스에서 0
    return `'${kw}' — 모든 소스에서 결과 0건. Google fallback 활성화 또는 Naver API 설정을 확인하세요. (단정: '보도 없음' 아님)`;
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>🔬 수집 진단 — 키워드 × 소스 단계별 카운트</div>
      <div style={S.note}>
        Google News RSS 만으로는 누락이 발생할 수 있습니다. Google HTML fallback / Naver / 공식기관 / 사용자 지정 소스를 함께 확인하세요.
      </div>

      {[...byKw.entries()].map(([kw, rows]) => (
        <div key={kw} style={S.kwBlock}>
          <div style={S.kwHead}>#{kw}</div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>소스</th>
                  <th style={S.thNum}>원본</th>
                  <th style={S.thNum}>날짜 통과</th>
                  <th style={S.thNum}>중복 후</th>
                  <th style={S.thNum}>제외 후</th>
                  <th style={S.thNum}>최종</th>
                  <th style={S.th}>오류</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${kw}/${r.source}`}>
                    <td style={S.td}>{SOURCE_LABEL[r.source] || r.source}</td>
                    <td style={S.tdNum}>{r.raw ?? 0}</td>
                    <td style={S.tdNum}>{r.afterDate ?? 0}</td>
                    <td style={S.tdNum}>{r.afterDedupe ?? 0}</td>
                    <td style={S.tdNum}>{r.afterExclude ?? 0}</td>
                    <td style={{ ...S.tdNum, fontWeight: 700, color: r.final > 0 ? '#166534' : '#888' }}>{r.final ?? 0}</td>
                    <td style={S.tdErr}>{r.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {emptyMessage(kw, rows) && (
            <div style={S.empty}>⚠️ {emptyMessage(kw, rows)}</div>
          )}
        </div>
      ))}

      {report.expandedKeywords?.length > 0 && (
        <div style={S.expBox}>
          🔁 확장 키워드 자동 검색: {report.expandedKeywords.map(k => <span key={k} style={S.expTag}>{k}</span>)}
        </div>
      )}
    </div>
  );
}

const S = {
  wrap:    { background: 'white', borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  head:    { fontSize: 13, fontWeight: 800, color: '#0d1117', marginBottom: 6 },
  note:    { fontSize: 11.5, color: '#666', marginBottom: 10, lineHeight: 1.6 },
  kwBlock: { marginBottom: 10, paddingBottom: 9, borderBottom: '1px solid #f0ede8' },
  kwHead:  { fontSize: 12.5, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 },
  tableWrap:{ overflowX: 'auto' },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:      { textAlign: 'left',  padding: '5px 8px', background: '#fafaf6', borderBottom: '1px solid #e7e5db', fontWeight: 700, fontSize: 11, color: '#666' },
  thNum:   { textAlign: 'right', padding: '5px 8px', background: '#fafaf6', borderBottom: '1px solid #e7e5db', fontWeight: 700, fontSize: 11, color: '#666' },
  td:      { padding: '5px 8px', borderBottom: '1px solid #f5f3ec', fontSize: 12 },
  tdNum:   { padding: '5px 8px', borderBottom: '1px solid #f5f3ec', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  tdErr:   { padding: '5px 8px', borderBottom: '1px solid #f5f3ec', fontSize: 11, color: '#c53030', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' },
  empty:   { marginTop: 7, padding: '7px 10px', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 7, fontSize: 12, lineHeight: 1.6 },
  expBox:  { marginTop: 8, padding: '7px 10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 7, fontSize: 12, color: '#075985' },
  expTag:  { display: 'inline-block', margin: '0 4px 0 6px', padding: '1px 7px', background: 'white', border: '1px solid #93c5fd', borderRadius: 10, fontSize: 11.5, color: '#1d4ed8' },
};
