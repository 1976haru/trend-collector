// ─────────────────────────────────────────────
// datetime.js — 한국어/KST 친화 날짜 포맷터
// ─────────────────────────────────────────────

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toDate(v) { return v instanceof Date ? v : new Date(v); }

/** 2026.04.29(수) 15:30 */
export function fmtNow(d = new Date()) {
  const t = toDate(d);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  const w = DAYS[t.getDay()];
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day}(${w}) ${hh}:${mm}`;
}

/** 2026.04.29 15:30 */
export function fmtFull(d) {
  if (!d) return '';
  const t = toDate(d);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

/** 04.29 15:30 */
export function fmtShort(d) {
  if (!d) return '';
  const t = toDate(d);
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${m}.${day} ${hh}:${mm}`;
}

/** "12분 전 / 3시간 전 / 2일 전" */
export function fmtRelative(d) {
  if (!d) return '';
  const ms = Date.now() - toDate(d).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)        return '방금 전';
  if (s < 3600)      return `${Math.floor(s / 60)}분 전`;
  if (s < 86400)     return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return fmtShort(d);
}

/** 다음 cron 시각까지 남은 시간 표시 */
export function fmtUntil(target) {
  if (!target) return '';
  const ms = toDate(target).getTime() - Date.now();
  if (ms <= 0) return '곧';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 후`;
  if (h > 0)   return `${h}시간 ${m}분 후`;
  return `${m}분 후`;
}
