// ─────────────────────────────────────────────
// NewsCard.jsx — 기사 카드 컴포넌트
// ─────────────────────────────────────────────

export default function NewsCard({ article, bookmarked, onBookmark, sentiment, index }) {
  const bm = bookmarked;
  const s  = sentiment;

  return (
    <article style={{ ...S.card, ...(bm ? S.bmCard : {}), animationDelay: `${index * 0.04}s` }}>
      {/* 헤더: 언론사 + 날짜 + 북마크 */}
      <div style={S.head}>
        <div style={S.srcWrap}>
          <span style={S.src}>{article.source || '언론사 미상'}</span>
          <span style={S.date}>📅 {article.date || '날짜 미상'}</span>
        </div>
        <button style={{ ...S.bmBtn, ...(bm ? S.bmOn : {}) }} onClick={() => onBookmark(article.id)}>
          {bm ? '★' : '☆'}
        </button>
      </div>

      {/* 제목 */}
      <h3 style={S.title}>{article.title}</h3>

      {/* 요약 */}
      {article.summary && <p style={S.summary}>{article.summary}</p>}

      {/* 푸터: 키워드 + 감성 + 원문 링크 */}
      <div style={S.foot}>
        <span style={S.kw}># {article.keyword}</span>
        <div style={S.footRight}>
          {s && (
            <span style={{ ...S.sent, ...(s.label === '긍정' ? S.pos : s.label === '부정' ? S.neg : S.neu) }}>
              {s.label === '긍정' ? '▲' : s.label === '부정' ? '▼' : '●'} {s.label}
            </span>
          )}
          {article.url && (
            <a href={article.url} target="_blank" rel="noreferrer" style={S.link}>원문 →</a>
          )}
        </div>
      </div>
    </article>
  );
}

const S = {
  card:    {
    background: 'white', borderRadius: 10, padding: '13px 14px',
    boxShadow: '0 1px 2px rgba(0,0,0,.07)',
    borderLeft: '4px solid #0d1117',
    animation: 'fadeUp .3s ease both',
  },
  bmCard:  { borderLeftColor: '#f59e0b' },
  head:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  srcWrap: { display: 'flex', flexDirection: 'column', gap: 2 },
  src:     { fontSize: 11, fontWeight: 700, color: '#0d1117' },
  date:    { fontSize: 10, color: '#94a3b8' },
  bmBtn:   { background: 'none', border: 'none', fontSize: 17, cursor: 'pointer', opacity: .4, padding: '0 2px', lineHeight: 1 },
  bmOn:    { opacity: 1, color: '#f59e0b' },
  title:   { fontSize: 13.5, fontWeight: 700, color: '#0d1117', margin: '0 0 5px', lineHeight: 1.5 },
  summary: { fontSize: 12, color: '#555', lineHeight: 1.7, margin: '0 0 8px' },
  foot:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  footRight: { display: 'flex', alignItems: 'center', gap: 7 },
  kw:      { fontSize: 11, background: '#f0ede8', color: '#0d1117', borderRadius: 4, padding: '2px 7px', fontWeight: 600 },
  sent:    { fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 7px' },
  pos:     { color: '#16a34a', background: '#f0fdf4' },
  neg:     { color: '#dc2626', background: '#fef2f2' },
  neu:     { color: '#888',    background: '#f4f4f4' },
  link:    { fontSize: 11, color: '#2563eb', textDecoration: 'none' },
};
