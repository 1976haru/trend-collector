// ─────────────────────────────────────────────
// AgentSettings.jsx — 에이전트 ON/OFF + LLM 활성 진단
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';

const AGENTS = [
  { key: 'collectionAgent', label: '수집 결과 정리', desc: '키워드별 수집 카운트 / 실패 소스 / 한 줄 요약',  locked: true  },
  { key: 'relevanceAgent',  label: '관련성 검증',     desc: '키워드 매칭 + 공공기관 도메인 필터로 무관 기사 자동 분류' },
  { key: 'riskAgent',       label: '위험 이슈 감지',   desc: '부정 비율 / 동일 이슈 반복 / 중앙언론 부정 보도 식별' },
  { key: 'reportAgent',     label: '보고서 작성',      desc: '일일 보고 / 상급자 요약 / 기승전결 본문 / 대응 권고' },
  { key: 'publicityAgent',  label: '홍보성과 분석',    desc: '기관 배포자료 식별 / 재인용 / 클릭 / 등급 산정' },
  { key: 'qualityAgent',    label: '품질 점검',        desc: '관련성/추출 실패/한글 깨짐/PDF 위험 점검 + 점수 부여' },
  { key: 'suggestionAgent', label: '개선 제안',        desc: '제외 키워드 / 도메인 룰 / 검색 누락 / 기능 개선 제안' },
];

export default function AgentSettings() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const [ok,  setOk]    = useState('');

  async function refresh() {
    setErr(''); setOk('');
    try {
      const s = await api.getAgentStatus();
      setStatus(s);
      setSettings(s.settings || {});
    } catch (e) {
      setErr(e.message || String(e));
    }
  }
  useEffect(() => { refresh(); }, []);

  async function toggle(key, value) {
    if (key === 'collectionAgent') return;   // 강제 ON
    const next = { ...settings, [key]: !!value };
    setSettings(next);
    setBusy(true); setErr(''); setOk('');
    try {
      await api.saveAgentSettings(next);
      setOk('✅ 저장됨');
      setTimeout(() => setOk(''), 1500);
    } catch (e) {
      setErr(e.message || String(e));
      // 실패 시 서버 상태 복구
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    if (!confirm('모든 에이전트를 기본값(ON) 으로 되돌리시겠습니까?')) return;
    const def = status?.defaultSettings || {};
    setSettings(def);
    setBusy(true); setErr(''); setOk('');
    try {
      await api.saveAgentSettings(def);
      setOk('✅ 기본값으로 되돌림');
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  }

  const llm = status?.llm || { enabled: false, configured: false, provider: null, flag: false };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <strong>🤖 에이전트 설정</strong>
        <span style={S.headSub}>
          보고서 생성 파이프라인이 7개 에이전트를 순차 실행함. OFF 시 해당 에이전트 결과가 비워짐.
        </span>
      </div>

      {/* LLM 진단 카드 */}
      <div style={S.llmCard}>
        <div style={S.llmRow}>
          <span style={S.llmLabel}>LLM 고도화 모드</span>
          <span style={{ ...S.llmBadge, background: llm.enabled ? '#dcfce7' : '#f1f5f9', color: llm.enabled ? '#166534' : '#475569' }}>
            {llm.enabled ? `🟢 활성 (${llm.provider})` : '⚪ 비활성 (규칙 기반)'}
          </span>
        </div>
        <div style={S.llmDetail}>
          {llm.enabled
            ? '환경변수 LLM_AGENT_ENABLED=true 와 API 키가 모두 설정되어 보고서/관련성/위험 에이전트가 LLM 보강 모드로 동작합니다.'
            : '환경변수 LLM_AGENT_ENABLED=true + (OPENAI_API_KEY 또는 ANTHROPIC_API_KEY) 가 모두 있어야 활성화됩니다. 현재는 규칙 기반으로 안전하게 동작 중입니다.'}
        </div>
        <div style={S.llmDiagRow}>
          <span style={S.llmDiagItem}>flag={String(llm.flag)}</span>
          <span style={S.llmDiagItem}>OpenAI 키={llm.hasOpenAI ? '✓' : '×'}</span>
          <span style={S.llmDiagItem}>Anthropic 키={llm.hasClaude ? '✓' : '×'}</span>
        </div>
      </div>

      {err && <div style={S.err}>⚠️ {err}</div>}
      {ok  && <div style={S.ok}>{ok}</div>}

      <div style={S.list}>
        {AGENTS.map(a => {
          const on = settings[a.key] !== false;
          return (
            <label key={a.key} style={{ ...S.row, ...(a.locked ? S.rowLocked : {}) }}>
              <input
                type="checkbox"
                checked={on}
                disabled={busy || a.locked}
                onChange={e => toggle(a.key, e.target.checked)}
              />
              <div style={{ flex: 1 }}>
                <div style={S.rowLabel}>
                  {a.label}
                  {a.locked && <span style={S.lockTag}>(항상 ON)</span>}
                </div>
                <div style={S.rowDesc}>{a.desc}</div>
              </div>
              <span style={{ ...S.statBadge, background: on ? '#dcfce7' : '#fee2e2', color: on ? '#166534' : '#991b1b' }}>
                {on ? 'ON' : 'OFF'}
              </span>
            </label>
          );
        })}
      </div>

      <div style={S.actions}>
        <button onClick={resetAll} disabled={busy} style={S.resetBtn}>↺ 모두 ON 으로 되돌리기</button>
        <button onClick={refresh} disabled={busy} style={S.refreshBtn}>↻ 새로고침</button>
      </div>
    </div>
  );
}

const S = {
  wrap:    { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  head:    { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  headSub: { fontSize: 12, color: '#666' },
  llmCard: { background: '#fafaf6', borderRadius: 10, padding: '10px 12px', marginBottom: 12, border: '1px solid #f0ede8' },
  llmRow:  { display: 'flex', alignItems: 'center', gap: 10 },
  llmLabel:{ fontWeight: 700, fontSize: 13, color: '#0d1117' },
  llmBadge:{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12 },
  llmDetail:{ marginTop: 6, fontSize: 12, color: '#444', lineHeight: 1.5 },
  llmDiagRow: { display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  llmDiagItem:{ fontSize: 11, color: '#555', background: 'white', border: '1px solid #e5e0d8', padding: '2px 8px', borderRadius: 8, fontFamily: 'ui-monospace, monospace' },
  err: { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 },
  ok:  { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 },
  list:{ display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fafaf6', borderRadius: 10, border: '1px solid #f0ede8', cursor: 'pointer' },
  rowLocked: { opacity: 0.85, cursor: 'default' },
  rowLabel: { fontWeight: 700, fontSize: 13, color: '#0d1117' },
  rowDesc:  { fontSize: 12, color: '#666', marginTop: 2 },
  lockTag:  { marginLeft: 8, fontSize: 11, color: '#888', fontWeight: 500 },
  statBadge:{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10 },
  actions:  { display: 'flex', gap: 8, marginTop: 12 },
  resetBtn: { padding: '8px 12px', borderRadius: 7, border: '1px solid #d5d0c8', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 },
  refreshBtn:{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d5d0c8', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 },
};
