// ─────────────────────────────────────────────
// YouTubeInsightCard.jsx — 리포트 상세에 표시되는 YouTube 관심도/영상 카드
// 데이터는 report.youtubeInsights (수집 시 자동 부착) 사용.
// 비활성 / 미설정 시 친절한 한국어 안내만 표시.
// ─────────────────────────────────────────────

import { fmtRelative } from '../../utils/datetime.js';

export default function YouTubeInsightCard({ youtubeInsights }) {
  const hasData = youtubeInsights && Array.isArray(youtubeInsights.items) && youtubeInsights.items.length > 0;
  const items   = hasData ? youtubeInsights.items.filter(x => x.videoCount > 0 || x.error) : [];
  const totalVideos   = items.reduce((s, x) => s + (x.videoCount    || 0), 0);
  const totalViews    = items.reduce((s, x) => s + (x.totalViews    || 0), 0);
  const totalComments = items.reduce((s, x) => s + (x.totalComments || 0), 0);
  const totalLikes    = items.reduce((s, x) => s + (x.totalLikes    || 0), 0);

  if (!youtubeInsights) {
    return (
      <div style={S.wrap}>
        <div style={S.head}>📺 YouTube 관심도 · 국민 반응</div>
        <div style={S.note}>
          YouTube 분석이 비활성화되어 있습니다. Render Environment 에 <code>YOUTUBE_DATA_ENABLED=true</code> +{' '}
          <code>YOUTUBE_API_KEY</code> 를 설정하면 다음 수집부터 자동으로 영상 통계가 포함됩니다.
        </div>
      </div>
    );
  }
  if (!hasData) {
    return (
      <div style={S.wrap}>
        <div style={S.head}>📺 YouTube 관심도 · 국민 반응</div>
        <div style={S.note}>이 수집에서 식별된 YouTube 영상이 없습니다.</div>
      </div>
    );
  }

  // 모든 키워드의 topVideos 합쳐서 조회수 내림차순 TOP 5
  const allVideos = items.flatMap(x => (x.topVideos || []).map(v => ({ ...v, _kw: x.keyword })));
  allVideos.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  const top5 = allVideos.slice(0, 5);

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        📺 YouTube 관심도 · 국민 반응
        <span style={S.disclaimer}>
          ※ Google Trends YouTube Search 는 상대 관심도 (0~100), YouTube Data API 는 영상 조회수·댓글 등 반응 지표입니다.
        </span>
      </div>

      {/* 통계 카드 */}
      <div style={S.statRow}>
        <Stat label="키워드" value={items.length + '건'} />
        <Stat label="관련 영상" value={totalVideos.toLocaleString('ko-KR') + '건'} />
        <Stat label="누적 조회수" value={totalViews.toLocaleString('ko-KR') + '회'} highlight />
        <Stat label="댓글" value={totalComments.toLocaleString('ko-KR') + '건'} />
        <Stat label="좋아요" value={totalLikes.toLocaleString('ko-KR') + '건'} />
      </div>

      {/* 키워드별 인사이트 문장 */}
      <div style={S.insightList}>
        {items.map(it => (
          <div key={it.keyword} style={S.insightLine}>
            <span style={S.kw}>#{it.keyword}</span>
            <span style={S.level}>{it.interestLevel || '미미'}</span>
            <span style={S.insightText}>{it.insightText || (it.error ? `⚠️ ${it.error}` : '데이터 없음')}</span>
          </div>
        ))}
      </div>

      {/* 상위 영상 TOP 5 */}
      {top5.length > 0 && (
        <>
          <div style={S.subHead}>주요 관련 영상 TOP {top5.length}</div>
          <ul style={S.videoList}>
            {top5.map(v => (
              <li key={v.videoId || v.url} style={S.videoItem}>
                <div style={S.videoTitleRow}>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" style={S.videoTitle}>{v.title}</a>
                  {v.shortform && <span style={S.shortBadge}>Shorts</span>}
                </div>
                <div style={S.videoMeta}>
                  <span>{v.channelTitle}</span>
                  <span> · #{v._kw}</span>
                  <span> · 업로드 {fmtRelative(v.publishedAt)}</span>
                  <span> · 👁 {Number(v.viewCount).toLocaleString('ko-KR')}회</span>
                  <span> · 💬 {Number(v.commentCount).toLocaleString('ko-KR')}</span>
                  <span> · 👍 {Number(v.likeCount).toLocaleString('ko-KR')}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!youtubeInsights.enabled && (
        <div style={S.warn}>
          ⚠️ YouTube Data API 가 미활성 — 관리/설정에서 <code>YOUTUBE_DATA_ENABLED=true</code> +{' '}
          <code>YOUTUBE_API_KEY</code> 를 등록하면 다음 수집부터 영상 통계가 더 정확해집니다.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, ...(highlight ? { color: '#dc2626' } : {}) }}>{value}</div>
    </div>
  );
}

const S = {
  wrap:        { background: 'white', borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  head:        { fontSize: 13, fontWeight: 800, color: '#0d1117', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  disclaimer:  { fontSize: 10.5, color: '#888', fontWeight: 500 },
  note:        { fontSize: 12, color: '#666', lineHeight: 1.6 },
  warn:        { background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', padding: '7px 11px', borderRadius: 7, fontSize: 12, marginTop: 9, lineHeight: 1.6 },

  statRow:     { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7, marginBottom: 11 },
  stat:        { background: '#fafaf6', borderRadius: 8, padding: '8px 10px', border: '1px solid #f0ede8' },
  statLabel:   { fontSize: 10.5, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' },
  statValue:   { fontSize: 16, fontWeight: 800, color: '#0d1117', marginTop: 2 },

  insightList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 11 },
  insightLine: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#444', flexWrap: 'wrap' },
  kw:          { fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 10 },
  level:       { fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 },
  insightText: { fontSize: 12, color: '#444' },

  subHead:     { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 },
  videoList:   { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 },
  videoItem:   { background: '#fafaf6', borderRadius: 7, padding: '8px 11px', border: '1px solid #f0ede8' },
  videoTitleRow:{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  videoTitle:  { color: '#dc2626', textDecoration: 'none', fontSize: 13, fontWeight: 600, wordBreak: 'break-all' },
  shortBadge:  { fontSize: 10, fontWeight: 700, color: '#7c2d12', background: '#fed7aa', padding: '1px 7px', borderRadius: 8 },
  videoMeta:   { fontSize: 11, color: '#666', marginTop: 3, lineHeight: 1.6 },
};
