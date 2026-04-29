// ─────────────────────────────────────────────
// useAuth.js — 단일 비밀번호 인증 상태
// ─────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import * as api from '../services/api.js';

export function useAuth() {
  const [authed,  setAuthed]  = useState(null);  // null = 확인 전
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.checkAuth();
      setAuthed(!!r.authenticated);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback(async (password) => {
    setLoading(true); setError(null);
    try {
      await api.login(password);
      setAuthed(true);
      return true;
    } catch (e) {
      setError(e.message || '로그인 실패');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    setAuthed(false);
  }, []);

  return { authed, loading, error, signIn, signOut, refresh };
}
