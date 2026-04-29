// ─────────────────────────────────────────────
// App.jsx — 인증 게이트 + 4개 탭 (키워드 / 리포트 / 수신자 / 스케줄)
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react';
import Header        from './components/layout/Header.jsx';
import TabBar        from './components/layout/TabBar.jsx';
import Login         from './components/auth/Login.jsx';
import KeywordManager   from './components/keyword/KeywordManager.jsx';
import RecentReports    from './components/reports/RecentReports.jsx';
import RecipientSettings from './components/recipients/RecipientSettings.jsx';
import ScheduleSettings  from './components/schedule/ScheduleSettings.jsx';

import { useAuth }    from './hooks/useAuth.js';
import { useConfig }  from './hooks/useConfig.js';
import { useReports } from './hooks/useReports.js';
import * as api from './services/api.js';

export default function App() {
  const auth   = useAuth();
  const cfg    = useConfig({ enabled: auth.authed === true });
  const rep    = useReports({ enabled: auth.authed === true });
  const [tab,    setTab]    = useState('keywords');
  const [health, setHealth] = useState(null);

  // 로그인 후 헬스 한번 조회 (스케줄 / SMTP 상태 표시용)
  useEffect(() => {
    if (auth.authed === true) api.health().then(setHealth).catch(() => setHealth(null));
  }, [auth.authed]);

  // 인증 상태 확인 중
  if (auth.authed === null) {
    return <div style={S.splash}>⏳ 확인 중...</div>;
  }

  // 미인증 → 로그인 화면
  if (!auth.authed) {
    return (
      <Login
        onSubmit={auth.signIn}
        loading={auth.loading}
        error={auth.error}
      />
    );
  }

  return (
    <div style={S.app}>
      <Header isLive={!!health} countdown={health ? `매일 ${health.reportTime}` : ''} />

      <main style={S.main}>
        <TabBar
          active={tab}
          onChange={setTab}
          counts={{ reports: rep.reports.length || undefined }}
          onLogout={auth.signOut}
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
            loading={cfg.loading || rep.loading}
            onCollect={async () => { await rep.collect(); setTab('reports'); }}
          />
        )}

        {tab === 'reports' && (
          <RecentReports
            reports={rep.reports}
            loading={rep.loading}
            onRefresh={rep.refresh}
            onCollect={rep.collect}
            onEmail={async (id) => {
              try {
                const r = await rep.sendEmail(id);
                alert(`✅ 메일 발송 완료 — ${r.sentTo.length}명`);
              } catch (e) { alert(`❌ ${e.message}`); }
            }}
          />
        )}

        {tab === 'mail' && (
          <RecipientSettings
            recipients={cfg.config.recipients}
            onAdd={cfg.addRecipient}
            onRemove={cfg.removeRecipient}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleSettings health={health} />
        )}
      </main>
    </div>
  );
}

const S = {
  app:    { minHeight: '100vh', background: '#f0ede8', fontFamily: "'IBM Plex Sans KR','Apple SD Gothic Neo',sans-serif" },
  main:   { maxWidth: 860, margin: '0 auto', padding: '14px 12px' },
  splash: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 },
  banner: { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
            padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 },
};
