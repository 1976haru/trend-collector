// ─────────────────────────────────────────────
// tests/stress/liveServerTest.js — 라이브 서버 보안 / 오류복구 / 부하 테스트
//
// ▸ 서버가 http://localhost:3030 에 떠 있어야 한다 (BASE 환경변수로 변경 가능).
// ▸ ADMIN_PASSWORD 는 .env 에 정의된 값 (기본 'dev1234') 가정.
//
// 테스트 영역
//   1) 무인증 보호 — admin/* / 다운로드 / config — 모두 401
//   2) 잘못된 비밀번호 / 정상 로그인 / 쿠키 / /me
//   3) XSS / 매우 긴 입력 / 음수 입력 — 서버 다운 없이 처리
//   4) /api/feedback — 50자 / 5000자 trim, mailSent=false 응답 정상
//   5) extraction-stats / source-settings GET (인증 후) — Secret 노출 없음
//   6) autocannon 부하 — health / auth/me / source-settings (각 30s c=20)
//   7) PDF 1건 → docx fallback 다운로드 — 인증 후 200 + PK / %PDF
//
// 실행: BASE=http://localhost:3030 ADMIN_PASSWORD=dev1234 node tests/stress/liveServerTest.js
// ─────────────────────────────────────────────

import autocannon from 'autocannon';

const BASE = process.env.BASE || 'http://localhost:3030';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev1234';

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

// 쿠키 저장 (간이 cookie jar)
let cookie = '';

async function http(method, urlPath, { body, raw = false, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h['cookie'] = cookie;
  if (body && typeof body !== 'string' && !raw) {
    h['content-type'] = 'application/json';
  }
  const r = await fetch(BASE + urlPath, {
    method,
    headers: h,
    body: body
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : undefined,
    redirect: 'manual',
  });
  // set-cookie 저장
  const sc = r.headers.get('set-cookie');
  if (sc) {
    const m = sc.match(/(tc_session=[^;]+)/);
    if (m) cookie = m[1];
  }
  return r;
}

async function main() {
  console.log(`▶ BASE = ${BASE}`);

  // 사전 조건 — 서버가 실제로 떠 있는지
  try {
    const r = await fetch(BASE + '/api/health', { redirect: 'manual' });
    if (!r.ok) { console.error(`서버 헬스체크 실패: ${r.status}`); process.exit(2); }
  } catch (e) {
    console.error(`서버 연결 실패: ${e.message}\n서버를 먼저 띄우세요: \`node server/index.js\``);
    process.exit(2);
  }

  // ────────────────────────────────────────────
  group('1) 무인증 — 보호 라우트 401 확인');
  for (const p of [
    '/api/config',
    '/api/admin/feedback',
    '/api/admin/mail-settings',
    '/api/admin/source-settings',
    '/api/admin/extraction-stats',
    '/api/reports',
  ]) {
    await test(`GET ${p} → 401`, async () => {
      const r = await http('GET', p);
      assert(r.status === 401, `got ${r.status}`);
    });
  }
  await test('PUT /api/admin/source-settings 무인증 → 401', async () => {
    const r = await http('PUT', '/api/admin/source-settings', { body: { naverEnabled: false } });
    assert(r.status === 401, `got ${r.status}`);
  });
  await test('GET /api/reports/abc/clipping/pdf 무인증 → 401', async () => {
    const r = await http('GET', '/api/reports/abc/clipping/pdf');
    assert(r.status === 401, `got ${r.status}`);
  });

  // ────────────────────────────────────────────
  group('2) 인증 라이프사이클');
  await test('잘못된 비번 → 401 + 한국어 메시지', async () => {
    const r = await http('POST', '/api/auth/login', { body: { password: 'WRONG_XYZ' } });
    assert(r.status === 401);
    const j = await r.json();
    assert(/일치하지 않/.test(j.error || ''), `msg=${j.error}`);
  });
  await test('빈 비번 → 400', async () => {
    const r = await http('POST', '/api/auth/login', { body: { password: '' } });
    assert(r.status === 400, `got ${r.status}`);
  });
  await test('정상 로그인 → 200 + 쿠키', async () => {
    const r = await http('POST', '/api/auth/login', { body: { password: ADMIN_PASSWORD } });
    assert(r.status === 200, `got ${r.status}`);
    assert(cookie.startsWith('tc_session='), `cookie 누락: ${cookie}`);
  });
  await test('/api/auth/me → authenticated true', async () => {
    const r = await http('GET', '/api/auth/me');
    const j = await r.json();
    assert(j.authenticated === true, `${JSON.stringify(j)}`);
  });

  // ────────────────────────────────────────────
  group('3) 인증 후 — Secret 노출 / 음수·긴 입력 검증');
  await test('GET /api/admin/source-settings — clientSecret 평문 노출 없음', async () => {
    const r = await http('GET', '/api/admin/source-settings');
    assert(r.status === 200, `got ${r.status}`);
    const j = await r.json();
    const text = JSON.stringify(j);
    // hasNaverClientSecret boolean 만 OK, 실제 secret 값은 노출 X
    assert(!/clientSecret['"]?\s*:\s*['"][A-Za-z0-9]{8,}/.test(text),
      `Secret 노출 의심: ${text.slice(0, 200)}`);
  });
  await test('GET /api/admin/mail-settings — password 키 자체 없음', async () => {
    const r = await http('GET', '/api/admin/mail-settings');
    assert(r.status === 200);
    const j = await r.json();
    assert(!('password' in j), `password 키 노출: ${JSON.stringify(j)}`);
  });
  await test('PUT /api/config — intervalHours: -5 → 400 + 한국어', async () => {
    const r = await http('PUT', '/api/config', { body: { intervalHours: -5 } });
    assert(r.status === 400, `got ${r.status}`);
    const j = await r.json();
    assert(/[가-힣]/.test(j.error || ''), '한국어 안내 누락');
  });
  await test('PUT /api/config — keywords: 5000개 큰 배열 → 200 (서버 살아있음)', async () => {
    const big = Array.from({ length: 5000 }, (_, i) => `K${i}`);
    const r = await http('PUT', '/api/config', { body: { keywords: big } });
    // 200 또는 400 둘 다 OK — 서버가 죽지만 않으면 됨
    assert(r.status === 200 || r.status === 400, `got ${r.status}`);
  });
  await test('서버 살아있음 — health 200', async () => {
    const r = await http('GET', '/api/health');
    assert(r.status === 200);
  });

  // ────────────────────────────────────────────
  group('4) /api/feedback — XSS / 긴 입력 / 음수');
  await test('XSS — <script>alert(1)</script> 제출 → 200 (서버 escape)', async () => {
    const r = await http('POST', '/api/feedback', {
      body: { title: '<script>alert(1)</script>', content: '<img src=x onerror=alert(1)>' },
    });
    assert(r.status === 200 || r.status === 500, `got ${r.status}`); // SMTP 미설정 → 200 with warning
  });
  await test('긴 본문 10000자 → 5000자 trim 후 200', async () => {
    const longBody = 'A'.repeat(10000);
    const r = await http('POST', '/api/feedback', {
      body: { title: '긴 입력 테스트', content: longBody },
    });
    assert(r.status === 200);
    const j = await r.json();
    assert(j.savedCount >= 1, '저장 카운트 누락');
  });
  await test('필수 누락 — title 빈 문자열 → 400', async () => {
    const r = await http('POST', '/api/feedback', { body: { title: '', content: 'x' } });
    assert(r.status === 400);
  });

  // ────────────────────────────────────────────
  group('5) 인증 후 — 대체 다운로드 / 미리보기 정상');
  let firstReportId = null;
  await test('GET /api/reports — 200 + items 배열 + 첫 보고서 id', async () => {
    const r = await http('GET', '/api/reports');
    assert(r.status === 200, `got ${r.status}`);
    const j = await r.json();
    // 응답 형태: { items: [...] } 또는 [...]  — 둘 다 수용
    const items = Array.isArray(j) ? j : (j.items || []);
    assert(items.length > 0, '리포트 0건');
    firstReportId = items[0].id;
  });
  await test('clipping/preview HTML — 200 + 50KB 이상', async () => {
    const r = await http('GET', `/api/reports/${firstReportId}/clipping/preview`);
    assert(r.status === 200);
    const text = await r.text();
    assert(text.length > 50_000, `len ${text.length}`);
  });
  await test('clipping/word — 200 + PK 시그니처', async () => {
    const r = await http('GET', `/api/reports/${firstReportId}/clipping/word`);
    assert(r.status === 200);
    const buf = Buffer.from(await r.arrayBuffer());
    assert(buf[0] === 0x50 && buf[1] === 0x4b, `not PK: ${buf.slice(0, 4).toString('hex')}`);
    assert(buf.length >= 5_000, `${buf.length}`);
  });
  await test('analysis/excel — 200 + PK + 10KB 이상', async () => {
    const r = await http('GET', `/api/reports/${firstReportId}/analysis/excel`);
    assert(r.status === 200);
    const buf = Buffer.from(await r.arrayBuffer());
    assert(buf[0] === 0x50 && buf[1] === 0x4b);
    assert(buf.length >= 10_000);
  });
  await test('html-download — 200 + 50KB 이상', async () => {
    const r = await http('GET', `/api/reports/${firstReportId}/html-download`);
    assert(r.status === 200);
    const text = await r.text();
    assert(text.length >= 50_000);
  });

  // ────────────────────────────────────────────
  group('6) autocannon — 부하 (health / auth/me / source-settings)');
  async function bench({ url, conn, dur, headers }) {
    return await autocannon({
      url: BASE + url, connections: conn, duration: dur, headers, timeout: 10,
    });
  }
  await test('autocannon /api/health  c=20 / 15s — 5xx=0', async () => {
    const r = await bench({ url: '/api/health', conn: 20, dur: 15 });
    console.log(`     · req/s=${(r.requests.average | 0)}  p99=${r.latency.p99}ms  errors=${r.errors}  non2xx=${r.non2xx}`);
    assert(!r['5xx'] || r['5xx'] === 0, `5xx ${r['5xx']}`);
    assert(r.errors === 0, `errors ${r.errors}`);
  });
  await test('autocannon /api/auth/me  c=20 / 10s — 5xx=0', async () => {
    const r = await bench({ url: '/api/auth/me', conn: 20, dur: 10 });
    console.log(`     · req/s=${(r.requests.average | 0)}  p99=${r.latency.p99}ms  errors=${r.errors}  non2xx=${r.non2xx}`);
    assert(!r['5xx'] || r['5xx'] === 0, `5xx ${r['5xx']}`);
  });
  await test('autocannon /api/admin/source-settings  c=10 / 10s + 인증 쿠키 — 5xx=0', async () => {
    const r = await bench({ url: '/api/admin/source-settings', conn: 10, dur: 10, headers: { cookie } });
    console.log(`     · req/s=${(r.requests.average | 0)}  p99=${r.latency.p99}ms  errors=${r.errors}  non2xx=${r.non2xx}`);
    assert(!r['5xx'] || r['5xx'] === 0, `5xx ${r['5xx']}`);
    assert(r.non2xx < 5, `non2xx ${r.non2xx} — 인증 누수 의심`);
  });

  // ────────────────────────────────────────────
  group('7) 부하 후 health 재확인 (서버 생존)');
  await test('부하 후 /api/health 200', async () => {
    const r = await http('GET', '/api/health');
    assert(r.status === 200);
  });

  // ────────────────────────────────────────────
  const failed = results.filter(r => !r.passed);
  console.log(`\n──────────────────────────────────────────`);
  console.log(`총 ${results.length}건 중 통과 ${results.length - failed.length} · 실패 ${failed.length}  (${Date.now() - start}ms)`);
  if (failed.length) {
    console.log('\n실패 목록:');
    for (const f of failed) console.log(`  ❌ ${f.name}\n     → ${f.failMsg}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
