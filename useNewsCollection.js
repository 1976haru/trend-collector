// ─────────────────────────────────────────────
// useNewsCollection.js — 뉴스 수집 훅
// ─────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { fetchAllKeywords } from '../services/rssService.js';
import { saveArticles, saveHistory, loadArticles, loadHistory, saveBookmarks, loadBookmarks } from '../services/storageService.js';
import { formatFull } from '../utils/dateUtils.js';

export function useNewsCollection() {
  const [articles,    setArticles]    = useState(() => loadArticles());
  const [history,     setHistory]     = useState(() => loadHistory());
  const [bookmarks,   setBookmarks]   = useState(() => loadBookmarks());
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [collectionErrors, setCollectionErrors] = useState([]);

  /**
   * 키워드 배열로 뉴스 수집 실행
   */
  const collect = useCallback(async (keywords) => {
    if (!keywords.length) { setError('키워드를 먼저 추가하세요.'); return null; }
    setLoading(true);
    setError(null);
    setCollectionErrors([]);

    try {
      const { articles: fetched, errors } = await fetchAllKeywords(keywords);

      // 중복 제거 (같은 URL)
      const seen = new Set();
      const unique = fetched.filter(a => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      });

      const now    = new Date();
      const entry  = {
        date:  now.toISOString(),
        count: unique.length,
        keywords,
      };

      const newHistory = [...history, entry].slice(-90);

      setArticles(unique);
      setHistory(newHistory);
      setLastUpdated(formatFull(now));
      setCollectionErrors(errors);

      saveArticles(unique);
      saveHistory(newHistory);

      if (errors.length) {
        setError(`일부 키워드 수집 실패: ${errors.map(e => e.keyword).join(', ')}`);
      }

      return unique;
    } catch (e) {
      setError('수집 오류: ' + e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [history]);

  /**
   * 북마크 토글
   */
  const toggleBookmark = useCallback((articleId) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      next.has(articleId) ? next.delete(articleId) : next.add(articleId);
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
    loading,
    error,
    lastUpdated,
    collectionErrors,
    collect,
    toggleBookmark,
    getFiltered,
  };
}
