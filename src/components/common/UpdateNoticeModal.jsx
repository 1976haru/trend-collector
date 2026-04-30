// ─────────────────────────────────────────────
// UpdateNoticeModal.jsx — 버전 업데이트 안내 팝업
//
// 동작:
//   1. 앱 시작 시 GET /api/version 호출
//   2. localStorage 의 lastSeenVersion 과 비교
//   3. 현재 version 이 더 높거나 lastSeen 미설정 시 팝업 표시
//   4. "확인했습니다" 클릭 — lastSeenVersion 저장 후 닫기
//      "나중에 보기" 클릭 — 세션 동안만 닫기 (다음 접속 시 다시 표시)
//      "변경이력 전체 보기" — 설정 → 변경이력 탭으로 이동
//
// localStorage key: trendCollector.lastSeenVersion
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { getVersionInfo } from '../../services/api.js';

const STORAGE_KEY = 'trendCollector.lastSeenVersion';

// 1.0.0 / 1.2.3 같은 SemVer 비교 — a > b 면 1, == 0, < -1
function semverCompare(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] || 0, bi = pb[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

export default function UpdateNoticeModal({ onOpenChangelog }) {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getVersionInfo();
        if (!alive) return;
        setInfo(r);
        const lastSeen = localStorage.getItem(STORAGE_KEY) || '';
        // 새 버전이 더 높거나, 한 번도 본 적 없으면 팝업
        if (!lastSeen || semverCompare(r.version, lastSeen) > 0) {
          setOpen(true);
        }
      } catch {
        // /api/version 실패 시 조용히 무시 — 사용자 경험 영향 X
      }
    })();
    return () => { alive = false; };
  }, []);

  function onConfirm() {
    if (info?.version) {
      try { localStorage.setItem(STORAGE_KEY, info.version); } catch {}
    }
    setOpen(false);
  }
  function onLater() {
    // 세션만 닫기 — localStorage 저장 X
    setOpen(false);
  }
  function onShowAll() {
    onConfirm();
    onOpenChangelog && onOpenChangelog();
  }

  if (!open || !info?.latest) return null;
  const v = info.latest;

  return (
    <div style={S.overlay} onClick={onLater}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <span style={S.icon}>🎉</span>
          <span style={S.title}>{info.appName} v{info.version} 업데이트 안내</span>
          <span style={{ flex: 1 }} />
          <span style={S.dateBadge}>{v.date}</span>
        </div>

        <div style={S.subtitle}>{v.title}</div>

        {v.highlights?.length > 0 && (
          <Section label="✨ 주요 개선사항" items={v.highlights} color="#1d4ed8" />
        )}
        {v.fixes?.length > 0 && (
          <Section label="🐛 수정된 오류" items={v.fixes} color="#16a34a" />
        )}
        {v.notes?.length > 0 && (
          <Section label="ℹ️ 사용 시 참고사항" items={v.notes} color="#9a3412" />
        )}

        <div style={S.btnRow}>
          <button onClick={onShowAll} style={S.btnLight}>📜 변경이력 전체 보기</button>
          <span style={{ flex: 1 }} />
          <button onClick={onLater} style={S.btnLight}>나중에 보기</button>
          <button onClick={onConfirm} style={S.btnPrimary}>확인했습니다</button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, items, color }) {
  return (
    <div style={S.section}>
      <div style={{ ...S.sectionHead, color }}>{label}</div>
      <ul style={S.list}>
        {items.map((it, i) => <li key={i} style={S.item}>{it}</li>)}
      </ul>
    </div>
  );
}

const S = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '14px' },
  modal:      { background: 'white', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.3)', maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '20px 22px' },
  head:       { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  icon:       { fontSize: 22 },
  title:      { fontSize: 16, fontWeight: 800, color: '#0d1117' },
  dateBadge:  { fontSize: 11.5, fontWeight: 700, color: '#475569', background: '#e2e8f0', padding: '3px 10px', borderRadius: 12 },
  subtitle:   { fontSize: 13, color: '#475569', marginBottom: 14, fontWeight: 600 },
  section:    { marginBottom: 12 },
  sectionHead:{ fontSize: 12, fontWeight: 800, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.5px' },
  list:       { listStyle: 'none', padding: 0, margin: 0 },
  item:       { fontSize: 13, color: '#0d1117', padding: '4px 0 4px 16px', position: 'relative', lineHeight: 1.55 },
  btnRow:     { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  btnPrimary: { padding: '9px 16px', minHeight: 40, borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnLight:   { padding: '9px 14px', minHeight: 40, borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};

// 항목 들여쓰기 표시 — 가상 ●
if (typeof document !== 'undefined') {
  const id = 'updateNoticeModalBullets';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `[data-uvb] li:before { content: "● "; color: currentColor; position: absolute; left: 0; }`;
    document.head.appendChild(style);
  }
}
