// ─────────────────────────────────────────────
// agents/index.js — 에이전트 오케스트레이터
//
// 보고서 생성 파이프라인의 마지막 단계에서 호출된다.
// 7개 에이전트를 순서대로 실행하고 결과를 하나의 agentResults 객체로
// 묶어 report 에 첨부한다.
//
// 입력:
//   report   — collector.js / reportAnalyzer.js 가 만든 보고서
//   ctx      — { settings, tracking, feedback, llmConfig }
//
// 반환:
//   {
//     collection, relevance, risk, report, publicity, quality, suggestion,
//     runMeta: { agentsEnabled, llmEnabled, generatedAt, durationMs },
//   }
//
// 설정으로 OFF 처리된 에이전트는 결과 객체에 { skipped: true } 만 남긴다.
// 기본값: 모두 ON.
// ─────────────────────────────────────────────

import runCollectionAgent  from './collectionAgent.js';
import runRelevanceAgent   from './relevanceAgent.js';
import runRiskAgent        from './riskAgent.js';
import runReportAgent      from './reportAgent.js';
import runPublicityAgent   from './publicityAgent.js';
import runQualityAgent     from './qualityAgent.js';
import runSuggestionAgent  from './suggestionAgent.js';

export const DEFAULT_AGENT_SETTINGS = {
  collectionAgent:  true,   // 수집 결과 정리는 항상 실행
  relevanceAgent:   true,
  riskAgent:        true,
  reportAgent:      true,
  publicityAgent:   true,
  qualityAgent:     true,
  suggestionAgent:  true,
};

/**
 * LLM 활성 여부 — 환경변수 + 키 존재로 판정.
 * 키가 없으면 LLM_AGENT_ENABLED=true 라도 비활성으로 간주한다.
 */
export function getLlmConfig(env = process.env) {
  const flag      = String(env.LLM_AGENT_ENABLED || '').toLowerCase() === 'true';
  const hasOpenAI = !!env.OPENAI_API_KEY;
  const hasClaude = !!env.ANTHROPIC_API_KEY;
  const enabled   = flag && (hasOpenAI || hasClaude);
  const provider  = !enabled ? null : hasClaude ? 'anthropic' : 'openai';
  return {
    enabled,
    provider,
    flag,
    hasOpenAI,
    hasClaude,
  };
}

function skip(agent) {
  return { agent, skipped: true, summary: `${agent} 에이전트 비활성화됨.` };
}

/**
 * 에이전트 파이프라인을 실행한다.
 * @param {Object} report
 * @param {Object} ctx { settings?, tracking?, feedback?, llmConfig?, env? }
 * @returns {Object} agentResults
 */
export function runAgents(report = {}, ctx = {}) {
  const t0 = Date.now();
  const settings = { ...DEFAULT_AGENT_SETTINGS, ...(ctx.settings || {}) };
  const llmConfig = ctx.llmConfig || getLlmConfig(ctx.env || process.env);

  const out = {};

  // 1) 수집
  out.collection = settings.collectionAgent === false
    ? skip('collection')
    : safeRun('collection', () => runCollectionAgent(report));

  // 2) 관련성
  out.relevance = settings.relevanceAgent === false
    ? skip('relevance')
    : safeRun('relevance', () => runRelevanceAgent(report));

  // 3) 위험
  out.risk = settings.riskAgent === false
    ? skip('risk')
    : safeRun('risk', () => runRiskAgent(report));

  // 4) 보고서 작성
  out.report = settings.reportAgent === false
    ? skip('report')
    : safeRun('report', () => runReportAgent(report, { llmEnabled: llmConfig.enabled }));

  // 5) 홍보성과
  out.publicity = settings.publicityAgent === false
    ? skip('publicity')
    : safeRun('publicity', () => runPublicityAgent(report, { tracking: ctx.tracking }));

  // 6) 품질 점검
  out.quality = settings.qualityAgent === false
    ? skip('quality')
    : safeRun('quality', () => runQualityAgent(report));

  // 7) 개선 제안
  out.suggestion = settings.suggestionAgent === false
    ? skip('suggestion')
    : safeRun('suggestion', () => runSuggestionAgent(report, { feedback: ctx.feedback }));

  out.runMeta = {
    agentsEnabled: settings,
    llmEnabled:    llmConfig.enabled,
    llmProvider:   llmConfig.provider,
    llmConfigured: !!(llmConfig.hasOpenAI || llmConfig.hasClaude),
    generatedAt:   new Date().toISOString(),
    durationMs:    Date.now() - t0,
    version:       1,
  };
  return out;
}

function safeRun(name, fn) {
  try {
    return fn();
  } catch (e) {
    console.warn(`[agents] ${name} agent failed:`, e.message);
    return { agent: name, error: e.message || String(e), summary: `${name} 에이전트 실행 중 오류 발생.` };
  }
}

export {
  runCollectionAgent,
  runRelevanceAgent,
  runRiskAgent,
  runReportAgent,
  runPublicityAgent,
  runQualityAgent,
  runSuggestionAgent,
};
