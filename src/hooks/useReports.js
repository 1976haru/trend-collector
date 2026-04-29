// ─────────────────────────────────────────────
// useReports.js — 리포트 목록 + 수집 트리거 + 메일 발송
// ─────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api.js';

export function useReports({ enabled = true } = {}) {
  const [reports, setReports] = useState([]);
  const [current, setCurrent] = useState(null);   // 가장 최근 수집된 전체 리포트
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError(null);
    try {
      const r = await api.listReports();
      setReports(r.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const collect = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.collectNow();
      setCurrent(r.report);
      await refresh();
      return r.report;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const open = useCallback(async (id) => {
    setLoading(true); setError(null);
    try {
      const r = await api.getReport(id);
      setCurrent(r);
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendEmail = useCallback(async (id, body = {}) => {
    setError(null);
    try {
      const r = await api.emailReport(id, body);
      await refresh();
      return r;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [refresh]);

  return { reports, current, loading, error, refresh, collect, open, sendEmail };
}
