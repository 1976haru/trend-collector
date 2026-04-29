// ─────────────────────────────────────────────
// dateUtils.js — 날짜 포맷 / 카운트다운 / 다음 실행 시각
// ─────────────────────────────────────────────

const KO = 'ko-KR';

function toDate(d) {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  return new Date(d);
}

export function formatFull(d = new Date()) {
  return toDate(d).toLocaleString(KO, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatShort(d = new Date()) {
  return toDate(d).toLocaleDateString(KO, { month: '2-digit', day: '2-digit' });
}

export function formatDay(d = new Date()) {
  return toDate(d).toLocaleDateString(KO, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatTime(d = new Date()) {
  return toDate(d).toLocaleTimeString(KO, { hour: '2-digit', minute: '2-digit' });
}

// 호환성을 위한 별칭
export const fmtDay  = formatDay;
export const fmtFull = formatFull;

// n시간 후 시각
export function hoursFromNow(n = 1) {
  return new Date(Date.now() + Number(n) * 3600 * 1000);
}

/**
 * 매일 hh:mm 다음 실행 시각 반환 (오늘 시각이 이미 지났으면 내일).
 * @param {string} hhmm "09:00"
 */
export function nextOccurrence(hhmm = '09:00') {
  const [h, m] = String(hhmm).split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h || 0, m || 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

/**
 * 남은 시간 카운트다운 문자열
 */
export function formatCountdown(target) {
  const ms = toDate(target).getTime() - Date.now();
  if (ms <= 0) return '곧 실행';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

// 두 날짜가 같은 날인지
export function isSameDay(a, b) {
  const x = toDate(a), y = toDate(b);
  return x.getFullYear() === y.getFullYear()
      && x.getMonth()    === y.getMonth()
      && x.getDate()     === y.getDate();
}
