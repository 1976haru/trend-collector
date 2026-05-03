// ─────────────────────────────────────────────
// App.jsx — 인증 게이트 + 4개 탭 + 리포트 마스터·디테일
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react';
import MOJHeader     from './components/layout/MOJHeader.jsx';
import TabBar        from './components/layout/TabBar.jsx';
import Login         from './components/auth/Login.jsx';
import KeywordManager   from './components/keyword/KeywordManager.jsx';
import RecentReports    from './components/reports/RecentReports.jsx';
import ReportDetail     from './components/reports/ReportDetail.jsx';
import RecipientSettings from './components/recipients/RecipientSettings.jsx';
import AdminPanel       from './components/admin/AdminPanel.jsx';
import Help             from './components/help/Help.jsx';
import FeedbackModal    from './components/feedback/FeedbackModal.jsx';
import UpdateNoticeModal from './components/common/UpdateNoticeModal.jsx';

import { useAuth }    from './hooks/useAuth.js';
import { useConfig }  from './hooks/useConfig.js';
import { useReports } from './hooks/useReports.js';
import * as api from './services/api.js';

export default function App() {
  const auth = useAuth();
  const cfg  = useConfig({ enabled: auth.authed === true });
  const rep  = useReports({ enabled: auth.authed === true });
  const [tab,    setTab]    = useState('keywords');
  const [health, setHealth] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [sending,  setSending]  = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState(null);   // UpdateNoticeModal → 변경이력 탭 이동

  // 헬스 주기 갱신 (다음 자동수집 시각이 헤더에 표시되므로)
  useEffect(() => {
    if (auth.authed !== true) return;
    let alive = true;
    const tick = () => api.health()
      .then(h => alive && setHealth(h))
      .catch(() => alive && setHealth(null));
    tick();
    const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [auth.authed]);

  // 인증 상태 확인 중
  if (auth.authed === null) {
    return <div style={S.splash}>⏳ 확인 중...</div>;
  }
  if (!auth.authed) {
    return (
      <>
        <Login onSubmit={auth.signIn} loading={auth.loading} error={auth.error} />
        <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      </>
    );
  }

  // 리포트 상세 열기
  async function openDetail(id) {
    setDetailId(id);
    setTab('reports');
    await rep.open(id);
  }

  // 메일 발송 (목록/상세 공통)
  async function sendEmail(id) {
    setSending(id);
    try {
      const r = await rep.sendEmail(id);
      alert(`✅ 메일 발송 완료 — ${r.sentTo.length}명`);
    } catch (e) {
      alert(`❌ ${e.message}`);
    } finally {
      setSending('');
    }
  }

  return (
    <div style={S.app}>
      <MOJHeader
        health={health}
        status={rep.current?.riskLevel?.level || (rep.reports[0]?.riskLevel?.level)}
        onLogout={auth.signOut}
        onFeedback={() => setFeedbackOpen(true)}
        onHelp={() => setTab('help')}
      />

      {/* 시스템 안내 — 공식 사이트 사칭 방지 */}
      <div style={S.notice}>
        본 시스템은 공개 언론보도 및 공개 보도자료를 수집·분석하여 내부 업무 참고자료로 제공하는 시스템입니다.
      </div>

      <main style={S.main}>
        <TabBar
          active={tab}
          onChange={(t) => { setTab(t); if (t !== 'reports') setDetailId(null); }}
          counts={{ reports: rep.reports.length || undefined }}
        />

        {(cfg.error || rep.error) && (
          <div style={S.banner}>⚠️ {cfg.error || rep.error}</div>
        )}

        {tab === 'keywords' && (
          <KeywordManager
            keywords={cfg.config.keywords}
            excludeKeywords={cfg.config.excludes}
            filterAds={cfg.config.filterAds}
            requireAllInclude={cfg.config.requireAllInclude}
            onAdd={cfg.addKeyword}
            onRemove={cfg.removeKeyword}
            onAddExclude={cfg.addExclude}
            onRemoveExclude={cfg.removeExclude}
            onToggleFilterAds={cfg.setFilterAds}
            onToggleRequireAll={cfg.setRequireAll}
            onClearKeywords={() => cfg.update({ keywords: [] })}
            loading={cfg.loading || rep.loading}
            onCollect={async () => {
              const r = await rep.collect();
              if (r) { setDetailId(r.id); setTab('reports'); }
            }}
            config={cfg.config}
            health={health}
            onUpdateConfig={cfg.update}
          />
        )}

        {tab === 'reports' && (
          detailId && rep.current && rep.current.id === detailId ? (
            <ReportDetail
              report={rep.current}
              onClose={() => setDetailId(null)}
              onEmail={sendEmail}
              onReportRefresh={async (updated) => {
                if (updated) {
                  // 재추출 직후 서버가 반환한 최신 리포트로 즉시 화면 갱신 + 목록 새로고침
                  await rep.open(updated.id);
                  await rep.refresh();
                }
              }}
              sending={sending === detailId}
            />
          ) : (
            <RecentReports
              reports={rep.reports}
              loading={rep.loading}
              onRefresh={rep.refresh}
              onCollect={async () => {
                const r = await rep.collect();
                if (r) setDetailId(r.id);
              }}
              onOpen={openDetail}
              onEmail={sendEmail}
              busyId={sending}
            />
          )
        )}

        {tab === 'mail' && (
          <RecipientSettings
            recipients={cfg.config.recipients}
            onAdd={cfg.addRecipient}
            onRemove={cfg.removeRecipient}
          />
        )}

        {tab === 'admin' && <AdminPanel initialTab={adminInitialTab} onTabConsumed={() => setAdminInitialTab(null)} />}

        {tab === 'help' && <Help />}
      </main>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <UpdateNoticeModal onOpenChangelog={() => { setAdminInitialTab('changelog'); setTab('admin'); }} />
    </div>
  );
}

const S = {
  app:    { minHeight: '100vh', background: 'var(--moj-bg, #F5F7FA)', fontFamily: "'IBM Plex Sans KR','Apple SD Gothic Neo',sans-serif" },
  notice: { maxWidth: 1240, margin: '0 auto', padding: '8px 16px', fontSize: 12, color: 'var(--moj-text-sub, #4B5C72)', textAlign: 'center', borderBottom: '1px solid var(--moj-border, #D9E2EC)', background: 'rgba(255,255,255,.6)' },
  main:   { maxWidth: 1100, margin: '0 auto', padding: '14px 16px 60px' },
  splash: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--moj-text-sub, #4B5C72)', fontSize: 14 },
  banner: { background: '#FCE4E4', border: '1px solid #F0BFBF', color: '#8E1A1A',
            padding: '10px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 },
};
