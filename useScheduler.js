// ─────────────────────────────────────────────
// useScheduler.js — 스케줄 관리 훅
// interval(n시간 간격) / daily(매일 특정 시각) 지원
// ─────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { saveSchedules, loadSchedules } from '../services/storageService.js';
import { hoursFromNow, nextOccurrence, formatCountdown } from '../utils/dateUtils.js';
import { SCHEDULE_TYPES } from '../constants/config.js';

export function useScheduler(onTrigger) {
  const [schedules,  setSchedules]  = useState(() => loadSchedules());
  const [countdown,  setCountdown]  = useState('');
  const [nextRun,    setNextRun]    = useState(null);
  const timerRef  = useRef(null);
  const cdRef     = useRef(null);

  // ── 스케줄 추가 ─────────────────────────────

  const addSchedule = useCallback((schedule) => {
    const entry = {
      id:      Date.now().toString(),
      enabled: true,
      ...schedule,
      // 다음 실행 시각 계산
      nextAt:  schedule.type === SCHEDULE_TYPES.DAILY
        ? nextOccurrence(schedule.time).toISOString()
        : hoursFromNow(schedule.hours).toISOString(),
    };
    setSchedules(prev => {
      const next = [...prev, entry];
      saveSchedules(next);
      return next;
    });
  }, []);

  const removeSchedule = useCallback((id) => {
    setSchedules(prev => {
      const next = prev.filter(s => s.id !== id);
      saveSchedules(next);
      return next;
    });
  }, []);

  const toggleSchedule = useCallback((id) => {
    setSchedules(prev => {
      const next = prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
      saveSchedules(next);
      return next;
    });
  }, []);

  // ── 실행 루프 ───────────────────────────────

  useEffect(() => {
    clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const now = new Date();
      let triggered = false;

      setSchedules(prev => {
        const updated = prev.map(s => {
          if (!s.enabled || !s.nextAt) return s;
          if (new Date(s.nextAt) > now) return s;

          // 트리거!
          triggered = true;
          if (onTrigger) onTrigger(s);

          // 다음 실행 시각 갱신
          const nextAt = s.type === SCHEDULE_TYPES.DAILY
            ? nextOccurrence(s.time).toISOString()
            : hoursFromNow(s.hours).toISOString();

          return { ...s, nextAt, lastRun: now.toISOString() };
        });

        if (triggered) saveSchedules(updated);
        return updated;
      });
    }, 30_000); // 30초마다 체크

    return () => clearInterval(timerRef.current);
  }, [onTrigger]);

  // ── 카운트다운 표시 ─────────────────────────

  useEffect(() => {
    clearInterval(cdRef.current);

    const enabled = schedules.filter(s => s.enabled && s.nextAt);
    if (!enabled.length) { setCountdown(''); setNextRun(null); return; }

    // 가장 가까운 스케줄
    const nearest = enabled.reduce((a, b) =>
      new Date(a.nextAt) < new Date(b.nextAt) ? a : b
    );
    setNextRun(nearest);

    cdRef.current = setInterval(() => {
      setCountdown(formatCountdown(nearest.nextAt));
    }, 1000);

    return () => clearInterval(cdRef.current);
  }, [schedules]);

  return { schedules, countdown, nextRun, addSchedule, removeSchedule, toggleSchedule };
}
