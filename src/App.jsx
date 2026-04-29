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

  const {
    settings,
    addKeyword, removeKeyword,
    addExclude, removeExclude,
    setFilterAds, setRequireAllInclude, setReportType,
    updateEmailConfig, updateKakaoConfig,
  } = useSettings();

  const {
    articles, history, bookmarks, trending,
    loading, error, lastUpdated,
    collect, toggleBookmark,
  } = useNewsCollection();

  // 현재 설정으로 수집 호출
  const collectWithSettings = useCallback(() => collect(settings.keywords, {
    excludeKeywords:    settings.excludeKeywords || [],
    requireAllInclude:  !!settings.requireAllInclude,
    filterAds:          settings.filterAds !== false,
  }), [collect, settings.keywords, settings.excludeKeywords, settings.requireAllInclude, settings.filterAds]);

  // 스케줄 트리거 → 수집 자동 실행
  const handleScheduleTrigger = useCallback(async (schedule) => {
    const arts = await collectWithSettings();
    if (!arts) return;

    if (schedule.channel === 'browser' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Trend Collector', {
        body: `${arts.length}건 수집 완료 (${settings.keywords.join(', ')})`,
      });
    }
  }, [collectWithSettings, settings.keywords]);

  const { schedules, countdown, addSchedule, removeSchedule, toggleSchedule } = useScheduler(handleScheduleTrigger);

  async function handleCollect() {
    await collectWithSettings();
    setTab('news');
  }

  function handleAutoToggle() {
    if (autoMode) {
      setAutoMode(false);
    } else {
      setAutoMode(true);
      handleCollect();
    }
  }

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
            excludeKeywords={settings.excludeKeywords || []}
            filterAds={settings.filterAds !== false}
            requireAllInclude={!!settings.requireAllInclude}
            onAdd={addKeyword}
            onRemove={removeKeyword}
            onAddExclude={addExclude}
            onRemoveExclude={removeExclude}
            onToggleFilterAds={setFilterAds}
            onToggleRequireAll={setRequireAllInclude}
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
            trending={trending}
            reportType={settings.reportType || 'daily'}
            onChangeReportType={setReportType}
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
