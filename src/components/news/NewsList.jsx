// ─────────────────────────────────────────────
// NewsList.jsx — 기사 목록 + 필터 + 상태 표시
// ─────────────────────────────────────────────

import { useState } from 'react';
import NewsCard from './NewsCard.jsx';
import { generatePDF } from '../../utils/pdfUtils.js';

export default function NewsList({
  articles, bookmarks, trending = [], onBookmark, sentiments,
  reportType = 'daily', onChangeReportType,
  lastUpdated, loading, error, onEmail,
}) {
  const [filterKw,   setFilterKw]   = useState('전체');
  const [showBm,     setShowBm]     = useState(false);
  const [searchText, setSearchText] = useState('');

  const uniqueKws = ['전체', ...new Set(articles.map(a => a.keyword))];

  const displayed = articles.filter(a => {
    if (showBm  && !bookmarks.has(a.id)) return false;
    if (!showBm && filterKw !== '전체' && a.keyword !== filterKw) return false;
    if (searchText && !a.title.includes(searchText) && !a.source.includes(searchText)) return false;
    return true;
  });

  return (
    <div>
      {/* 상태 바 */}
      {lastUpdated && (
        <div style={S.statusBar}>
          <div>
            <strong style={{ fontSize: 13, display: 'block' }}>
              총 {articles.length}건 · ★ {bookmarks.size}건
            </strong>
            <span style={{ fontSize: 10.5, color: '#aaa' }}>마지막 수집: {lastUpdated}</span>
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 일간/주간 토글 */}
            {onChangeReportType && (
              <div style={S.reportToggle}>
                {[['daily', '일간'], ['weekly', '주간']].map(([v, l]) => (
                  <button key={v}
                    style={{ ...S.rb, ...(reportType === v ? S.rbOn : {}) }}
                    onClick={() => onChangeReportType(v)}>{l}</button>
                ))}
              </div>
            )}
            <button style={S.ghostBtn}
              onClick={() => generatePDF(displayed, { bookmarks, sentiments, reportType, trending })}>
              🖨️ PDF
            </button>
            <button style={{ ...S.ghostBtn, borderColor: 'rgba(34,197,94,.5)', background: 'rgba(34,197,94,.12)' }}
              onClick={onEmail}>
              ✉️ 메일
            </button>
          </div>
        </div>
      )}

      {/* 트렌드(급상승) 알림 */}
      {trending.length > 0 && (
        <div style={S.trend}>
          📈 키워드 급상승: {trending.slice(0, 5).map(t =>
            `${t.keyword} (${t.prev}→${t.curr})`).join(', ')}
        </div>
      )}

      {/* 검색 + 필터 */}
      <input style={S.search} placeholder="🔍 제목·언론사 검색..."
        value={searchText} onChange={e => setSearchText(e.target.value)} />

      <div style={S.filterRow}>
        {uniqueKws.map(k => (
          <button key={k}
            style={{ ...S.fc, ...(filterKw === k && !showBm ? S.fcOn : {}) }}
            onClick={() => { setFilterKw(k); setShowBm(false); }}>
            {k}{k !== '전체' ? ` (${articles.filter(a => a.keyword === k).length})` : ''}
          </button>
        ))}
        {bookmarks.size > 0 && (
          <button style={{ ...S.fc, ...(showBm ? S.fcOn : {}) }}
            onClick={() => setShowBm(v => !v)}>
            ★ 중요({bookmarks.size})
          </button>
        )}
      </div>

      {/* 오류 */}
      {error && <div style={S.err}>⚠️ {error}</div>}

      {/* 로딩 */}
      {loading ? (
        <div style={S.center}>
          <div style={S.spinner} />
          <div style={{ fontSize: 13, color: '#666' }}>전국 언론사 뉴스 수집 중...</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Google News RSS 검색 중</div>
        </div>
      ) : displayed.length === 0 ? (
        <div style={S.center}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#666' }}>
            {articles.length === 0 ? '수집된 기사가 없습니다' : '필터 결과가 없습니다'}
          </div>
        </div>
      ) : (
        <div style={S.list}>
          {displayed.map((a, i) => (
            <NewsCard
              key={a.id}
              article={a}
              index={i}
              bookmarked={bookmarks.has(a.id)}
              onBookmark={onBookmark}
              sentiment={sentiments?.[articles.indexOf(a)]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  statusBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#0d1117', color: 'white', borderRadius: 10,
    padding: '11px 15px', marginBottom: 11, flexWrap: 'wrap', gap: 7,
  },
  ghostBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '6px 12px', borderRadius: 7,
    border: '1.5px solid rgba(255,255,255,.3)',
    background: 'transparent', color: 'white',
    fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  search: {
    width: '100%', border: '2px solid #e5e0d8', borderRadius: 8,
    padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', background: 'white', marginBottom: 10,
    boxSizing: 'border-box',
  },
  filterRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 },
  fc:  { padding: '4px 10px', borderRadius: 20, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#555' },
  fcOn: { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  err: { background: '#fff5f5', border: '1px solid #ffd0d0', borderRadius: 8, padding: 10, color: '#c53030', fontSize: 12, marginBottom: 10 },
  center: { textAlign: 'center', padding: '44px 20px', color: '#aaa' },
  spinner: { width: 32, height: 32, border: '3px solid #e5e0d8', borderTopColor: '#0d1117', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 10px' },
  list: { display: 'flex', flexDirection: 'column', gap: 9 },
  reportToggle: { display: 'flex', gap: 2, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: 2 },
  rb:   { padding: '4px 9px', borderRadius: 5, border: 'none', background: 'transparent', color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  rbOn: { background: 'white', color: '#0d1117' },
  trend: { background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 10, fontWeight: 600 },
};
