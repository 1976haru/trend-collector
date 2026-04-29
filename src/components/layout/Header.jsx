// ─────────────────────────────────────────────
// Header.jsx — 라이브 시계 + 다음 자동수집 시각 표시
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { fmtNow, fmtFull, fmtUntil } from '../../utils/datetime.js';

export default function Header({ schedule }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30); // 30초마다 갱신 (분 단위 표시)
    return () => clearInterval(t);
  }, []);

  const auto = schedule?.autoCollect && schedule?.mode !== 'off';

  return (
    <header style={S.bar}>
      <div style={S.brand}>
        <span style={S.logo}>📰</span>
        <div>
          <div style={S.title}>Trend Collector</div>
          <div style={S.sub}>전국 언론보도 자동 수집</div>
        </div>
      </div>
      <div style={S.right}>
        <div style={S.clock}>📅 {fmtNow(now)}</div>
        {auto ? (
          <div style={S.next}>
            <span style={{ ...S.dot, background: '#22c55e' }} />
            다음 수집 <strong>{fmtFull(schedule.nextAt)}</strong>
            <span style={S.until}>({fmtUntil(schedule.nextAt)})</span>
          </div>
        ) : (
          <div style={S.next}>
            <span style={{ ...S.dot, background: '#94a3b8' }} />
            자동 수집 OFF
          </div>
        )}
      </div>
    </header>
  );
}

const S = {
  bar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
           gap: 10, flexWrap: 'wrap',
           background: '#0d1117', color: 'white', padding: '10px 14px',
           position: 'sticky', top: 0, zIndex: 10 },
  brand: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  logo:  { fontSize: 22 },
  title: { fontSize: 15, fontWeight: 700, lineHeight: 1.1 },
  sub:   { fontSize: 11, color: '#9aa3ad', marginTop: 2 },
  right: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' },
  clock: { fontSize: 12.5, color: '#cbd5e1', whiteSpace: 'nowrap' },
  next:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#cbd5e1', whiteSpace: 'nowrap' },
  dot:   { width: 8, height: 8, borderRadius: '50%' },
  until: { color: '#94a3b8' },
};
