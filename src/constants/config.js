// ─────────────────────────────────────────────
// config.js — 호환 레이어 (legacy)
// 새 구조는 keywordPresets.js 에 있다 — 신규 코드는 그쪽을 import 한다.
// ─────────────────────────────────────────────

import { ORG_PRESETS, listCategories, flattenAllKeywords } from './keywordPresets.js';

// legacy 카테고리 평면화 — name 기반의 옛 구조 호환
export const PRESET_CATEGORIES = listCategories('moj').map(c => ({
  id: c.id,
  name: c.label,
  keywords: [...(c.core || []), ...(c.extended || [])],
}));

export const PRESET_KEYWORDS = flattenAllKeywords('moj');

export { ORG_PRESETS };

// 수집 기간 옵션 (변경 없음)
export const PERIOD_OPTIONS = [
  { v: '24h',    label: '최근 24시간' },
  { v: '3d',     label: '최근 3일' },
  { v: '7d',     label: '최근 7일' },
  { v: '14d',    label: '최근 14일' },
  { v: '30d',    label: '최근 30일' },
  { v: 'custom', label: '직접 설정' },
];
