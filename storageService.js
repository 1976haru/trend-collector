// ─────────────────────────────────────────────
// storageService.js — localStorage 래퍼
// ─────────────────────────────────────────────

import { STORAGE_KEYS } from '../constants/config.js';

// ── 설정 저장/불러오기 ──────────────────────

export function saveSettings(settings) {
  _set(STORAGE_KEYS.SETTINGS, settings);
}

export function loadSettings() {
  return _get(STORAGE_KEYS.SETTINGS) ?? {
    keywords: [],
    emailConfig: { provider: 'gmail', addresses: [''], publicKey: '', serviceId: '', templateId: '' },
    kakaoConfig: { jsKey: '', loggedIn: false },
    notifyChannels: { email: false, kakao: false, browser: false },
    schedules: [],
  };
}

// ── 기사 저장/불러오기 ──────────────────────

export function saveArticles(articles) {
  // 최대 500건 유지
  _set(STORAGE_KEYS.ARTICLES, articles.slice(0, 500));
}

export function loadArticles() {
  return _get(STORAGE_KEYS.ARTICLES) ?? [];
}

// ── 히스토리 ────────────────────────────────

export function saveHistory(history) {
  _set(STORAGE_KEYS.HISTORY, history.slice(-90));
}

export function loadHistory() {
  return _get(STORAGE_KEYS.HISTORY) ?? [];
}

// ── 북마크 ──────────────────────────────────

export function saveBookmarks(ids) {
  _set(STORAGE_KEYS.BOOKMARKS, [...ids]);
}

export function loadBookmarks() {
  return new Set(_get(STORAGE_KEYS.BOOKMARKS) ?? []);
}

// ── 스케줄 ──────────────────────────────────

export function saveSchedules(schedules) {
  _set(STORAGE_KEYS.SCHEDULE, schedules);
}

export function loadSchedules() {
  return _get(STORAGE_KEYS.SCHEDULE) ?? [];
}

// ── 내부 유틸 ──────────────────────────────

function _set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage write error:', e);
  }
}

function _get(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAll() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
}
