// ─────────────────────────────────────────────
// useConfig.js — 서버 측 공유 설정 (키워드/제외/수신자/옵션) 관리
// ─────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import * as api from '../services/api.js';

const DEFAULT = {
  keywords: [], excludes: [], recipients: [],
  reportType: 'daily', filterAds: true, requireAllInclude: false,
};

export function useConfig({ enabled = true } = {}) {
  const [config,  setConfig]  = useState(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError(null);
    try {
      const cfg = await api.getConfig();
      setConfig({ ...DEFAULT, ...cfg });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (patch) => {
    setError(null);
    // 낙관적 업데이트
    setConfig(prev => ({ ...prev, ...patch }));
    try {
      const next = await api.putConfig(patch);
      setConfig({ ...DEFAULT, ...next });
      return next;
    } catch (e) {
      setError(e.message);
      // 실패 시 서버 상태로 복구
      refresh();
      throw e;
    }
  }, [refresh]);

  // 키워드
  const addKeyword     = (kw)   => update({ keywords: uniqAdd(config.keywords, kw) });
  const removeKeyword  = (kw)   => update({ keywords: config.keywords.filter(k => k !== kw) });
  // 제외
  const addExclude     = (kw)   => update({ excludes: uniqAdd(config.excludes, kw) });
  const removeExclude  = (kw)   => update({ excludes: config.excludes.filter(k => k !== kw) });
  // 수신자
  const addRecipient   = (em)   => update({ recipients: uniqAdd(config.recipients, em) });
  const removeRecipient = (em)  => update({ recipients: config.recipients.filter(k => k !== em) });
  // 옵션
  const setFilterAds   = (on)   => update({ filterAds: !!on });
  const setRequireAll  = (on)   => update({ requireAllInclude: !!on });
  const setReportType  = (t)    => update({ reportType: t });

  return {
    config, loading, error,
    refresh, update,
    addKeyword, removeKeyword,
    addExclude, removeExclude,
    addRecipient, removeRecipient,
    setFilterAds, setRequireAll, setReportType,
  };
}

function uniqAdd(arr, v) {
  const s = String(v).trim();
  if (!s) return arr;
  if (arr.includes(s)) return arr;
  return [...arr, s];
}
