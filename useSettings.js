// ─────────────────────────────────────────────
// useSettings.js — 앱 설정 관리 훅
// ─────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { saveSettings, loadSettings } from '../services/storageService.js';
import { initEmail } from '../services/emailService.js';
import { initKakao } from '../services/kakaoService.js';
import { DEFAULT_KEYWORDS } from '../constants/config.js';

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    const s = loadSettings();
    // 앱 시작 시 저장된 키 복원
    if (s.emailConfig?.publicKey) initEmail(s.emailConfig.publicKey);
    if (s.kakaoConfig?.jsKey) initKakao(s.kakaoConfig.jsKey);
    if (!s.keywords?.length) s.keywords = DEFAULT_KEYWORDS;
    return s;
  });

  const update = useCallback((patch) => {
    setSettings(prev => {
      const next = deepMerge(prev, patch);
      saveSettings(next);
      return next;
    });
  }, []);

  // ── 키워드 관리 ─────────────────────────────

  const addKeyword = useCallback((kw) => {
    const k = kw.trim();
    if (!k) return;
    setSettings(prev => {
      if (prev.keywords.includes(k)) return prev;
      const next = { ...prev, keywords: [...prev.keywords, k] };
      saveSettings(next);
      return next;
    });
  }, []);

  const removeKeyword = useCallback((kw) => {
    setSettings(prev => {
      const next = { ...prev, keywords: prev.keywords.filter(k => k !== kw) };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── 이메일 설정 업데이트 ──────────────────

  const updateEmailConfig = useCallback((cfg) => {
    if (cfg.publicKey) initEmail(cfg.publicKey);
    update({ emailConfig: cfg });
  }, [update]);

  // ── 카카오 설정 업데이트 ─────────────────

  const updateKakaoConfig = useCallback((cfg) => {
    if (cfg.jsKey) initKakao(cfg.jsKey);
    update({ kakaoConfig: cfg });
  }, [update]);

  return {
    settings,
    update,
    addKeyword,
    removeKeyword,
    updateEmailConfig,
    updateKakaoConfig,
  };
}

// ── 내부 유틸 ──────────────────────────────

function deepMerge(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
      result[key] = deepMerge(base[key] ?? {}, patch[key]);
    } else {
      result[key] = patch[key];
    }
  }
  return result;
}
