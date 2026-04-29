// ─────────────────────────────────────────────
// Header.jsx — 상단 헤더
// ─────────────────────────────────────────────

export default function Header({ isLive = false, countdown = '' }) {
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
        <span style={{ ...S.dot, background: isLive ? '#22c55e' : '#94a3b8' }} />
        <span style={S.live}>
          {isLive ? `자동 수집 중${countdown ? ` · ${countdown}` : ''}` : '수동 모드'}
        </span>
      </div>
    </header>
  );
}

const S = {
  bar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
           background: '#0d1117', color: 'white', padding: '12px 16px',
           position: 'sticky', top: 0, zIndex: 10 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo:  { fontSize: 22 },
  title: { fontSize: 15, fontWeight: 700, lineHeight: 1.1 },
  sub:   { fontSize: 11, color: '#9aa3ad', marginTop: 2 },
  right: { display: 'flex', alignItems: 'center', gap: 7 },
  dot:   { width: 9, height: 9, borderRadius: '50%' },
  live:  { fontSize: 11, color: '#cbd5e1' },
};
