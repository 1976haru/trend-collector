// ─────────────────────────────────────────────
// tests/stress/youtubeTest.js — YouTube 모듈 안전성 / 진단 검증
//
// API 키 없이도 앱이 정상 동작하고, 진단 응답이 secret 노출 없이 boolean 만
// 반환하는지 확인. child_process 로 env 격리.
// ─────────────────────────────────────────────

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const YT_URL = pathToFileURL(path.join(ROOT, 'server/youtube/index.js')).href;

const results = [];
const start = Date.now();
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, ms: Date.now() - t0 });
    console.log(`  ✅ ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, passed: false, failMsg: e.message || String(e), ms: Date.now() - t0 });
    console.error(`  ❌ ${name}  — ${e.message || e}`);
  }
}
function group(label) { console.log(`\n=== ${label} ===`); }

function runCase({ env = {}, action }) {
  const envSet = Object.entries(env).map(([k, v]) =>
    v === null ? `delete process.env[${JSON.stringify(k)}];`
               : `process.env[${JSON.stringify(k)}] = ${JSON.stringify(String(v))};`
  ).join('\n');
  const code = `
    delete process.env.YOUTUBE_DATA_ENABLED;
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_TRENDS_ENABLED;
    delete process.env.YOUTUBE_TRENDS_PROVIDER;
    ${envSet}
    const yt = await import(${JSON.stringify(YT_URL)});
    const out = ${action};
    process.stdout.write('JSON_OUT::' + JSON.stringify(out));
  `;
  let stdout = '';
  try {
    stdout = execSync(`node --input-type=module -e "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }).toString();
  } catch (e) {
    stdout = (e.stdout?.toString() || '') + '\n--- stderr ---\n' + (e.stderr?.toString() || '');
  }
  const m = stdout.match(/JSON_OUT::([\s\S]+)$/m);
  if (!m) throw new Error(`child output 파싱 실패: ${stdout.slice(0, 400)}`);
  return JSON.parse(m[1]);
}

async function main() {
  group('1) 비활성 / 미설정 — 앱 정상 동작');
  await test('YOUTUBE_DATA_ENABLED 미지정 → ready=false, fetchYouTubeInsights throw 안 함', async () => {
    const out = runCase({
      env: {},
      action: 'await yt.fetchYouTubeInsights("보호관찰", { period: "30d" })',
    });
    assert(out.enabled === false);
    assert(out.error && /비활성화/.test(out.error));
    assert(out.videoCount === 0);
    assert(Array.isArray(out.topVideos));
  });
  await test('YOUTUBE_DATA_ENABLED=true 인데 API 키 없음 → 친절한 한국어 오류', async () => {
    const out = runCase({
      env: { YOUTUBE_DATA_ENABLED: 'true' },
      action: 'await yt.fetchYouTubeInsights("보호관찰")',
    });
    assert(/YOUTUBE_API_KEY/.test(out.error || ''));
  });
  await test('isYouTubeDataEnabled / isYouTubeTrendsEnabled — env 변형 정규화', async () => {
    const out = runCase({
      env: { YOUTUBE_DATA_ENABLED: 'TRUE', YOUTUBE_API_KEY: 'AIzaABCD1234567890', YOUTUBE_TRENDS_ENABLED: '1' },
      action: '({ data: yt.isYouTubeDataEnabled(), trends: yt.isYouTubeTrendsEnabled() })',
    });
    assert(out.data === true, `data=${out.data}`);
    assert(out.trends === true, `trends=${out.trends}`);
  });
  await test('YOUTUBE_TRENDS_PROVIDER — 알 수 없는 값은 manual 로 처리', async () => {
    const out = runCase({
      env: { YOUTUBE_TRENDS_PROVIDER: 'foo' },
      action: 'yt.getYouTubeTrendsProvider()',
    });
    assert(out === 'manual');
  });

  group('2) 진단 — secret 절대 노출 금지');
  await test('getYouTubeDiagnostics — apiKey 평문 미포함, 마스킹 ID 만', async () => {
    const out = runCase({
      env: { YOUTUBE_DATA_ENABLED: 'true', YOUTUBE_API_KEY: 'AIzaSyTOPSECRET123456' },
      action: 'yt.getYouTubeDiagnostics()',
    });
    const json = JSON.stringify(out);
    assert(!json.includes('AIzaSyTOPSECRET'), `apiKey 평문 노출: ${json}`);
    assert(out.dataApi.apiKeyMasked.startsWith('AIza'));
    assert(out.dataApi.apiKeyMasked.endsWith('*'));
    assert(out.dataApi.hasYOUTUBE_API_KEY === true);
    assert(out.dataApi.ready === true);
  });
  await test('진단 — 키 없을 때 마스킹 빈 문자열', async () => {
    const out = runCase({
      env: { YOUTUBE_DATA_ENABLED: 'true' },
      action: 'yt.getYouTubeDiagnostics()',
    });
    assert(out.dataApi.apiKeyMasked === '');
    assert(out.dataApi.hasYOUTUBE_API_KEY === false);
    assert(out.dataApi.ready === false);
  });

  group('3) fetchYouTubeInsightsForKeywords — 한도 보호 / 실패 graceful');
  await test('빈 키워드 배열 — items=[]', async () => {
    const out = runCase({
      env: {},
      action: 'await yt.fetchYouTubeInsightsForKeywords([])',
    });
    assert(Array.isArray(out.items) && out.items.length === 0);
    assert(out.enabled === false);
  });
  await test('5건 초과 — 처음 5만 호출, 나머지는 placeholder (provider="skipped")', async () => {
    const out = runCase({
      env: {},
      action: 'await yt.fetchYouTubeInsightsForKeywords(["a","b","c","d","e","f","g"])',
    });
    assert(out.items.length === 7, `len=${out.items.length}`);
    const skipped = out.items.filter(x => x.provider === 'skipped');
    assert(skipped.length === 2, `skipped=${skipped.length}`);
  });
  await test('전체 실패해도 throw 안 함 — provider 잘못된 키', async () => {
    const out = runCase({
      env: { YOUTUBE_DATA_ENABLED: 'true', YOUTUBE_API_KEY: 'INVALID_KEY' },
      action: 'await yt.fetchYouTubeInsights("보호관찰", { period: "7d", maxResults: 1 })',
    });
    assert(out.videoCount === 0);
    // error 필드는 fetch 실패/네트워크 실패 시 채워지거나 비어있을 수 있음
  });

  // ────────────────────────────────────────────
  const failed = results.filter(r => !r.passed);
  console.log(`\n──────────────────────────────────────────`);
  console.log(`총 ${results.length}건 중 통과 ${results.length - failed.length} · 실패 ${failed.length}  (${Date.now() - start}ms)`);
  if (failed.length) {
    for (const f of failed) console.log(`  ❌ ${f.name}\n     → ${f.failMsg}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
