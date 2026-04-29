// ─────────────────────────────────────────────
// useNewsCollection.js — 뉴스 수집 훅
// 포함/제외 키워드 + 중복 제거 + 광고 필터 + 트렌드 감지 통합
// ─────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { fetchAllKeywords } from '../services/rssService.js';
import { saveArticles, saveHistory, loadArticles, loadHistory, saveBookmarks, loadBookmarks } from '../services/storageService.js';
import { formatFull } from '../utils/dateUtils.js';
import { dedupeArticles, applyKeywordFilter, filterOutAds, detectTrendingKeywords } from '../utils/filterUtils.js';
import { MAX_HISTORY } from '../constants/config.js';

export function useNewsCollection() {
  const [articles,    setArticles]    = useState(() => loadArticles());
  const [history,     setHistory]     = useState(() => loadHistory());
  const [bookmarks,   setBookmarks]   = useState(() => loadBookmarks());
  const [trending,    setTrending]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [collectionErrors, setCollectionErrors] = useState([]);

  /**
   * 키워드 배열로 뉴스 수집 실행
   * @param {string[]} keywords
   * @param {Object} opts { excludeKeywords?, requireAllInclude?, filterAds? }
   */
  const collect = useCallback(async (keywords, opts = {}) => {
    if (!keywords?.length) { setError('키워드를 먼저 추가하세요.'); return null; }
    setLoading(true);
    setError(null);
    setCollectionErrors([]);

    try {
      const { articles: fetched, errors } = await fetchAllKeywords(keywords);

      // 1) URL/제목 기반 중복 제거
      let processed = dedupeArticles(fetched);

      // 2) 광고/홍보성 필터
      if (opts.filterAds !== false) processed = filterOutAds(processed);

      // 3) 제외 키워드 필터 (원래 keywords 는 검색 키워드이므로 include 검사는 생략)
      if (opts.excludeKeywords?.length) {
        processed = applyKeywordFilter(processed, { exclude: opts.excludeKeywords });
      }

      // 4) 트렌드(급상승) 감지 — 직전 수집(articles state) 과 비교
      const trend = detectTrendingKeywords(articles, processed);
      setTrending(trend);

      const now    = new Date();
      const entry  = {
        date:  now.toISOString(),
        count: processed.length,
        keywords,
      };

      const newHistory = [...history, entry].slice(-MAX_HISTORY);

      setArticles(processed);
      setHistory(newHistory);
      setLastUpdated(formatFull(now));
      setCollectionErrors(errors);

      saveArticles(processed);
      saveHistory(newHistory);

      if (errors.length) {
        setError(`일부 키워드 수집 실패: ${errors.map(e => e.keyword).join(', ')}`);
      }

      return processed;
    } catch (e) {
      setError('수집 오류: ' + e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [history, articles]);

  /**
   * 북마크 토글
   */
  const toggleBookmark = useCallback((articleId) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId); else next.add(articleId);
      saveBookmarks(next);
      return next;
    });
  }, []);

  /**
   * 필터링된 기사 반환
   */
  const getFiltered = useCallback((filterKeyword, showBookmarks) => {
    if (showBookmarks) return articles.filter(a => bookmarks.has(a.id));
    if (filterKeyword === '전체') return articles;
    return articles.filter(a => a.keyword === filterKeyword);
  }, [articles, bookmarks]);

  return {
    articles,
    history,
    bookmarks,
    trending,
    loading,
    error,
    lastUpdated,
    collectionErrors,
    collect,
    toggleBookmark,
    getFiltered,
  };
}
