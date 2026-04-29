// ─────────────────────────────────────────────
// App.jsx — 앱 루트 (탭 라우팅 + 훅 연결)
// ─────────────────────────────────────────────

import { useState, useCallback } from 'react';
import Header        from './components/layout/Header.jsx';
import TabBar        from './components/layout/TabBar.jsx';
import KeywordManager   from './components/keyword/KeywordManager.jsx';
import NewsList         from './components/news/NewsList.jsx';
import MediaCoverage    from './components/media/MediaCoverage.jsx';
import SentimentPanel   from './components/analysis/SentimentPanel.jsx';
import ScheduleSettings from './components/schedule/ScheduleSettings.jsx';
import NotificationSettings from './components/notification/NotificationSettings.jsx';

import { useNewsCollection } from './hooks/useNewsCollection.js';
import { useScheduler }      from './hooks/useScheduler.js';
import { useSettings }       from './hooks/useSettings.js';
import { openGmailLink, openNaverMailLink, openMailtoLink } from './services/emailService.js';
import { formatFull } from './utils/dateUtils.js';

export default function App() {
  const [tab, setTab]       = useState('search');
  const [intervalH, setIntervalH] = useState('6');
  const [autoMode, setAutoMode]   = useState(false);

  const { settings, addKeyword, removeKeyword, updateEmailConfig, updateKakaoConfig } = useSettings();

  const { articles, history, bookmarks, loading, error, lastUpdated, collect, toggleBookmark } = useNewsCollection();

  // 스케줄 트리거 → 수집 자동 실행
  const handleScheduleTrigger = useCallback(async (schedule) => {
    const arts = await collect(settings.keywords);
    if (!arts) return;

    // 브라우저 알림
    if (schedule.channel === 'browser' && Notification.permission === 'granted') {
      new Notification('Trend Collector v1', {
        body: `${arts.length}건 수집 완료 (${settings.keywords.join(', ')})`,
      });
    }
  }, [collect, settings.keywords]);

  const { schedules, countdown, addSchedule, removeSchedule, toggleSchedule } = useScheduler(handleScheduleTrigger);

  // 수동 수집 트리거
  async function handleCollect() {
    await collect(settings.keywords);
    setTab('news');
  }

  // 자동 모드 토글 (단순 interval 스케줄 추가/제거)
  function handleAutoToggle() {
    if (autoMode) {
      setAutoMode(false);
    } else {
      setAutoMode(true);
      handleCollect();
    }
  }

  // 이메일 발송
  function handleEmail() {
    const cfg  = settings.emailConfig || {};
    const to   = (cfg.addresses || []).filter(a => a.includes('@'))[0] || '';
    const date = lastUpdated || formatFull();
    if (cfg.provider === 'gmail')       openGmailLink({ toEmail: to, articles, reportDate: date });
    else if (cfg.provider === 'naver')  openNaverMailLink({ toEmail: to, articles, reportDate: date });
    else                                openMailtoLink({ toEmail: to, articles, reportDate: date });
  }

  const tabCounts = {
    news:    articles.length || undefined,
    sources: undefined,
  };

  return (
    <div style={S.app}>
      <Header isLive={autoMode} countdown={countdown} />

      <main style={S.main}>
        <TabBar active={tab} onChange={setTab} counts={tabCounts} />

        {tab === 'search' && (
          <KeywordManager
            keywords={settings.keywords}
            onAdd={addKeyword}
            onRemove={removeKeyword}
            intervalH={intervalH}
            onIntervalChange={setIntervalH}
            onCollect={handleCollect}
            onAutoToggle={handleAutoToggle}
            autoMode={autoMode}
            loading={loading}
          />
        )}

        {tab === 'news' && (
          <NewsList
            articles={articles}
            bookmarks={bookmarks}
            onBookmark={toggleBookmark}
            sentiments={[]}
            lastUpdated={lastUpdated}
            loading={loading}
            error={error}
            onEmail={handleEmail}
          />
        )}

        {tab === 'sources' && (
          <MediaCoverage articles={articles} />
        )}

        {tab === 'analysis' && (
          <SentimentPanel articles={articles} sentiments={[]} history={history} />
        )}

        {tab === 'schedule' && (
          <ScheduleSettings
            schedules={schedules}
            onAdd={addSchedule}
            onRemove={removeSchedule}
            onToggle={toggleSchedule}
            countdown={countdown}
          />
        )}

        {tab === 'notify' && (
          <NotificationSettings
            settings={settings}
            onUpdateEmail={updateEmailConfig}
            onUpdateKakao={updateKakaoConfig}
            articles={articles}
            lastUpdated={lastUpdated}
          />
        )}
      </main>
    </div>
  );
}

const S = {
  app:  { minHeight: '100vh', background: '#f0ede8', fontFamily: "'IBM Plex Sans KR','Apple SD Gothic Neo',sans-serif" },
  main: { maxWidth: 860, margin: '0 auto', padding: '14px 12px' },
};
