// ─────────────────────────────────────────────
// TabBar.jsx — MOJ 공공기관 스타일 메인 탭
//
// 라벨: 모니터링 설정 / 수집 리포트 / 메일 수신자 / 관리·설정 / 도움말
// (편철·보고서, 홍보실적은 리포트 상세 화면의 하위 섹션으로 제공)
//
// 디자인:
//   - 둥근 카드형 탭
//   - 선택: 진한 남색 배경 + 흰 글자
//   - 비선택: 흰 배경 + 남색 글자
//   - 모바일에서 가로 스크롤
//   - 색만으로 식별하지 않도록 라벨/아이콘 동시 표시
// ─────────────────────────────────────────────

const TABS = [
  { id: 'keywords', label: '모니터링 설정', icon: '🎯', desc: '키워드·기간·소스 설정' },
  { id: 'reports',  label: '수집 리포트',   icon: '📰', desc: '편철·보고서·홍보실적 포함' },
  { id: 'mail',     label: '메일 수신자',   icon: '✉️', desc: '리포트 자동 발송 대상' },
  { id: 'admin',    label: '관리·설정',     icon: '⚙️', desc: '메일/소스/에이전트/추적' },
  { id: 'help',     label: '도움말',        icon: '📘', desc: '사용 안내' },
];

export default function TabBar({ active, onChange, counts = {} }) {
  return (
    <nav style={S.bar} aria-label="주요 메뉴">
      {TABS.map(t => {
        const on = active === t.id;
        const cnt = counts[t.id];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={on ? 'page' : undefined}
            title={t.desc}
            style={{ ...S.btn, ...(on ? S.on : S.off) }}
          >
            <span style={S.icon} aria-hidden="true">{t.icon}</span>
            <span style={S.lbl}>
              {t.label}
              {cnt ? <span style={{ ...S.cnt, ...(on ? S.cntOn : S.cntOff) }}>{cnt}</span> : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

const S = {
  bar:  {
    display: 'flex', gap: 6,
    background: 'var(--moj-bg-card, white)',
    border: '1px solid var(--moj-border, #D9E2EC)',
    borderRadius: 8, padding: 6,
    marginBottom: 14,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    boxShadow: '0 1px 2px rgba(15,45,88,.04)',
  },
  btn:  {
    flex: '1 1 auto', minWidth: 110, minHeight: 50,
    padding: '8px 12px',
    borderRadius: 6, border: '1px solid transparent',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    whiteSpace: 'nowrap',
    transition: 'background .12s, color .12s, border-color .12s',
  },
  on:   {
    background: 'var(--moj-navy, #153E75)',
    color: 'white',
    borderColor: 'var(--moj-navy, #153E75)',
  },
  off:  {
    background: 'white',
    color: 'var(--moj-navy, #153E75)',
    borderColor: 'var(--moj-border, #D9E2EC)',
  },
  icon: { fontSize: 16, lineHeight: 1 },
  lbl:  { fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 },
  cnt:  { borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800 },
  cntOn:  { background: 'rgba(255,255,255,.22)', color: 'white' },
  cntOff: { background: 'var(--moj-bg, #F5F7FA)', color: 'var(--moj-navy, #153E75)' },
};
