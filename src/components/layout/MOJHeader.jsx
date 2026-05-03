// ─────────────────────────────────────────────
// MOJHeader.jsx — 법무부 공공기관 스타일 헤더
//
// 구조:
//   ① 정부 공통 상단 얇은 바 (gov bar)
//   ② 메인 헤더 — 로고 + 부처명 + 슬로건 + 상태 배지 + 로그아웃
//   ③ 작은 안내 문구: "내부 업무 지원 시스템"
//
// 로고 fallback:
//   /assets/moj-logo.png 이 있으면 표시
//   없으면 태극 풍 원형 + "법무부" 텍스트 fallback
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { fmtNow, fmtFull, fmtUntil } from '../../utils/datetime.js';

const SLOGAN     = '국민이 주인인 나라, 함께 행복한 대한민국';
const SERVICE_KO = '언론보도·트렌드 모니터링 시스템';
const INTERNAL_TAG = '내부 업무 지원 시스템';

function LogoFallback() {
  // 태극 느낌 원형 (CSS only) — 실제 로고가 없을 때 표시
  return (
    <span style={S.logoFb} aria-hidden="true">
      <span style={S.logoFbInner}>법</span>
    </span>
  );
}

function MOJLogo() {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) return <LogoFallback />;
  return (
    <img
      src="/assets/moj-logo.png"
      alt="법무부 마크"
      onError={() => setImgFailed(true)}
      style={S.logoImg}
    />
  );
}

function StatusBadge({ level, text }) {
  return <span className="moj-status" data-level={level}>{text}</span>;
}

export default function MOJHeader({ health, status, onLogout, onFeedback, onHelp }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const schedule = health?.schedule;
  const sources  = health?.sources || {};
  const auto     = !!(schedule?.autoCollect && schedule?.mode !== 'off');

  // 시스템 상태: 위험도 우선, 없으면 health.ok 기반
  let sysLevel = 'mute', sysText = '대기';
  if (status === '긴급')      { sysLevel = 'crit'; sysText = '긴급'; }
  else if (status === '주의') { sysLevel = 'warn'; sysText = '주의'; }
  else if (status === '안정') { sysLevel = 'ok';   sysText = '정상'; }
  else if (health?.ok)        { sysLevel = 'ok';   sysText = '정상'; }

  const naverCfg = sources.naverConfigured;
  const naverLevel = sources.naverNews ? 'ok' : naverCfg ? 'warn' : 'mute';
  const naverText  = sources.naverNews ? 'Naver 정상' : naverCfg ? 'Naver 비활성' : 'Naver 미설정';

  return (
    <header style={S.root}>
      {/* ① 정부 상단 얇은 바 */}
      <div style={S.govBar}>
        <div style={S.govInner}>
          <span style={S.govLeft}>
            <span aria-hidden="true">🇰🇷</span>
            <span> 이 누리집은 대한민국 공식 전자정부 누리집입니다.</span>
          </span>
          <span style={S.govRight}>
            <span style={S.govBadge}>내부업무용</span>
            {onHelp && <button type="button" onClick={onHelp} style={S.govLink}>도움말</button>}
            {onFeedback && <button type="button" onClick={onFeedback} style={S.govLink}>설정</button>}
          </span>
        </div>
      </div>

      {/* ② 메인 헤더 */}
      <div style={S.main}>
        <div style={S.mainInner}>
          <div style={S.brand}>
            <MOJLogo />
            <div style={S.brandText}>
              <div style={S.brandRow}>
                <span style={S.brandTitle}>법무부</span>
                <span style={S.brandTagline}>{INTERNAL_TAG}</span>
              </div>
              <div style={S.brandSub}>{SERVICE_KO}</div>
            </div>
          </div>

          <div style={S.slogan} aria-label="정부 슬로건">
            <span style={S.sloganMark}>“</span>
            <span style={S.sloganText}>{SLOGAN}</span>
            <span style={S.sloganMark}>”</span>
          </div>

          <div style={S.actions}>
            <span style={S.dateStamp} aria-label="오늘 날짜">📅 {fmtNow(now)}</span>
            {onLogout && (
              <button type="button" onClick={onLogout} style={S.logoutBtn} title="로그아웃">
                ⎋ 로그아웃
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ③ 상태 라인 — 시스템 / 자동 수집 / 다음 수집 / Naver */}
      <div style={S.statusBar}>
        <div style={S.statusInner}>
          <StatusBadge level={sysLevel} text={`시스템 ${sysText}`} />
          <StatusBadge level={auto ? 'ok' : 'mute'} text={`자동 수집 ${auto ? 'ON' : 'OFF'}`} />
          {auto && schedule?.nextAt && (
            <span style={S.statusInfo}>
              다음 수집 <strong style={S.statusStrong}>{fmtFull(schedule.nextAt)}</strong>
              <span style={S.statusMute}> · {fmtUntil(schedule.nextAt)}</span>
            </span>
          )}
          <StatusBadge level={naverLevel} text={naverText} />
        </div>
      </div>
    </header>
  );
}

const S = {
  root: { position: 'sticky', top: 0, zIndex: 20, background: 'var(--moj-bg-card, white)', borderBottom: '1px solid var(--moj-border, #D9E2EC)' },

  // 정부 상단 바
  govBar: { background: 'var(--gov-bar-bg, #1B2533)', color: 'var(--gov-bar-fg, #DCE3EE)' },
  govInner: { maxWidth: 1240, margin: '0 auto', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12 },
  govLeft: { display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  govRight: { display: 'inline-flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' },
  govBadge: { background: 'rgba(255,255,255,.12)', color: 'white', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: '.3px' },
  govLink: { background: 'transparent', border: 'none', color: 'var(--gov-bar-link, white)', cursor: 'pointer', fontSize: 12, padding: '2px 4px', fontFamily: 'inherit' },

  // 메인 헤더
  main: { background: 'linear-gradient(180deg, #FFFFFF 0%, #F2F5FA 100%)', borderBottom: '1px solid var(--moj-border, #D9E2EC)' },
  mainInner: { maxWidth: 1240, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },

  brand: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  logoImg: { width: 46, height: 46, objectFit: 'contain', borderRadius: 6, background: 'white', border: '1px solid var(--moj-border, #D9E2EC)', padding: 4 },
  logoFb:  { width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #C8102E 0%, #003478 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.4)', flexShrink: 0 },
  logoFbInner: { fontSize: 18, fontWeight: 800, fontFamily: 'inherit' },
  brandText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  brandRow: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  brandTitle: { fontSize: 20, fontWeight: 800, color: 'var(--moj-navy, #153E75)', letterSpacing: '-.5px', lineHeight: 1 },
  brandTagline: { fontSize: 11, color: 'var(--moj-text-mute, #7A8AA0)', background: 'var(--moj-bg, #F5F7FA)', border: '1px solid var(--moj-border, #D9E2EC)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 },
  brandSub: { fontSize: 13, color: 'var(--moj-text-sub, #4B5C72)', marginTop: 4, fontWeight: 500 },

  slogan: { flex: 1, textAlign: 'center', color: 'var(--moj-navy, #153E75)', fontSize: 14, fontWeight: 600, fontStyle: 'italic', minWidth: 200 },
  sloganMark: { color: 'var(--moj-teal, #2F7D7A)', fontSize: 18, fontWeight: 800, padding: '0 4px' },
  sloganText: { whiteSpace: 'nowrap' },

  actions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  dateStamp: { fontSize: 13, color: 'var(--moj-text-sub, #4B5C72)', whiteSpace: 'nowrap' },
  logoutBtn: { background: 'white', border: '1px solid var(--moj-border-strong, #B7C4D3)', color: 'var(--moj-navy, #153E75)', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // 상태 바
  statusBar: { background: 'var(--moj-bg, #F5F7FA)', borderBottom: '1px solid var(--moj-border, #D9E2EC)' },
  statusInner: { maxWidth: 1240, margin: '0 auto', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 },
  statusInfo: { color: 'var(--moj-text-sub, #4B5C72)', whiteSpace: 'nowrap', fontSize: 12 },
  statusStrong: { color: 'var(--moj-text, #0D1B2A)' },
  statusMute: { color: 'var(--moj-text-mute, #7A8AA0)' },
};
