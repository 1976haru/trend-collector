// ─────────────────────────────────────────────
// NotificationSettings.jsx — 이메일·카카오톡 알림 설정
// ─────────────────────────────────────────────

import { useState } from 'react';
import { openGmailLink, openNaverMailLink, openMailtoLink } from '../../services/emailService.js';
import { kakaoLogin, kakaoLogout, isKakaoLoggedIn, shareViaKakaoLink } from '../../services/kakaoService.js';

const PROVIDERS = [
  { id: 'gmail',  label: 'Gmail' },
  { id: 'naver',  label: '네이버 메일' },
  { id: 'daum',   label: '다음 메일' },
  { id: 'mailto', label: '기본 앱' },
];

export default function NotificationSettings({ settings, onUpdateEmail, onUpdateKakao, articles, lastUpdated }) {
  const email  = settings.emailConfig  || {};
  const kakao  = settings.kakaoConfig  || {};
  const [kakaoLoggedIn, setKakaoLoggedIn] = useState(() => isKakaoLoggedIn());
  const [status, setStatus] = useState('');

  // ── 이메일 ──────────────────────────────────

  function handleEmailSend() {
    if (!articles.length) { setStatus('수집된 기사가 없습니다.'); return; }
    const to = (email.addresses || []).filter(a => a.includes('@'));
    if (!to.length) { setStatus('수신 이메일을 먼저 입력하세요.'); return; }
    const reportDate = lastUpdated || new Date().toLocaleString('ko-KR');
    const ops = { toEmail: to[0], articles, reportDate };
    if (email.provider === 'gmail')      openGmailLink(ops);
    else if (email.provider === 'naver') openNaverMailLink(ops);
    else                                 openMailtoLink(ops);
    setStatus('✅ 메일 창이 열렸습니다.');
  }

  // ── 카카오톡 ────────────────────────────────

  async function handleKakaoLogin() {
    try {
      await kakaoLogin();
      setKakaoLoggedIn(true);
      onUpdateKakao({ ...kakao, loggedIn: true });
      setStatus('✅ 카카오 로그인 완료');
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
  }

  function handleKakaoShare() {
    if (!articles.length) { setStatus('수집된 기사가 없습니다.'); return; }
    try {
      shareViaKakaoLink(articles, lastUpdated || '');
      setStatus('✅ 카카오 공유 창이 열렸습니다.');
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
  }

  return (
    <div>
      {status && <div style={S.status}>{status}</div>}

      {/* ── 이메일 설정 ── */}
      <div style={S.panel}>
        <div style={S.label}>📧 이메일 발송 설정</div>
        <div style={S.info}>
          설치 없이 Gmail·네이버·다음 메일 앱을 열어 발송합니다.<br />
          수신자를 입력하고 '지금 발송'을 누르면 메일 작성창이 열립니다.
        </div>

        {/* 메일 서비스 선택 */}
        <div style={S.fieldLabel}>메일 서비스</div>
        <div style={S.provRow}>
          {PROVIDERS.map(p => (
            <button key={p.id}
              style={{ ...S.provBtn, ...(email.provider === p.id ? S.provOn : {}) }}
              onClick={() => onUpdateEmail({ ...email, provider: p.id })}>
              {p.label}
            </button>
          ))}
        </div>

        {/* 수신자 */}
        <div style={S.fieldLabel}>수신자 이메일 (최대 3명)</div>
        {(email.addresses || ['']).map((addr, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input style={S.inp}
              placeholder={`수신자 ${i + 1} (예: hong@moj.go.kr)`}
              value={addr}
              onChange={e => {
                const arr = [...(email.addresses || [''])];
                arr[i] = e.target.value;
                onUpdateEmail({ ...email, addresses: arr });
              }} />
            {(email.addresses || []).length > 1 && (
              <button style={S.rmBtn}
                onClick={() => onUpdateEmail({ ...email, addresses: (email.addresses || []).filter((_, j) => j !== i) })}>
                ✕
              </button>
            )}
          </div>
        ))}
        {(email.addresses || []).length < 3 && (
          <button style={S.addBtn}
            onClick={() => onUpdateEmail({ ...email, addresses: [...(email.addresses || ['']), ''] })}>
            + 수신자 추가
          </button>
        )}

        <button style={S.sendBtn} onClick={handleEmailSend}>
          📤 지금 이메일 발송 ({articles.length}건)
        </button>
      </div>

      {/* ── 카카오톡 설정 ── */}
      <div style={S.panel}>
        <div style={S.label}>💬 카카오톡 설정</div>
        <div style={S.info}>
          카카오 JavaScript 앱 키를 입력하세요.<br />
          <a href="https://developers.kakao.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
            developers.kakao.com
          </a>에서 무료로 발급 가능합니다.
        </div>

        <div style={S.fieldLabel}>JavaScript 앱 키</div>
        <input style={S.inp} type="password"
          placeholder="카카오 JavaScript 앱 키"
          value={kakao.jsKey || ''}
          onChange={e => onUpdateKakao({ ...kakao, jsKey: e.target.value })} />

        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
          {!kakaoLoggedIn ? (
            <button style={S.kakaoBtn} onClick={handleKakaoLogin}>🔑 카카오 로그인</button>
          ) : (
            <>
              <button style={{ ...S.kakaoBtn, background: '#22c55e' }} onClick={handleKakaoShare}>
                📤 카카오로 공유
              </button>
              <button style={{ ...S.kakaoBtn, background: '#94a3b8' }}
                onClick={() => { kakaoLogout(); setKakaoLoggedIn(false); }}>
                로그아웃
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 브라우저 알림 ── */}
      <div style={S.panel}>
        <div style={S.label}>🔔 브라우저 알림</div>
        <button style={S.sendBtn}
          onClick={async () => {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
              new Notification('Trend Collector v1', { body: '브라우저 알림이 활성화되었습니다.' });
              setStatus('✅ 브라우저 알림 활성화 완료');
            } else {
              setStatus('❌ 알림 권한이 거부되었습니다.');
            }
          }}>
          🔔 브라우저 알림 허용
        </button>
      </div>
    </div>
  );
}

const S = {
  status:   { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, fontSize: 12, color: '#166534', marginBottom: 10 },
  panel:    { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:    { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },
  info:     { background: '#f8f6f2', borderRadius: 7, padding: 10, fontSize: 11.5, color: '#555', lineHeight: 1.6, marginBottom: 12 },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: '#444', marginBottom: 5, marginTop: 10 },
  inp:      { width: '100%', border: '2px solid #e5e0d8', borderRadius: 8, padding: '8px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafaf8', boxSizing: 'border-box' },
  provRow:  { display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' },
  provBtn:  { padding: '7px 12px', borderRadius: 8, border: '2px solid #e5e0d8', background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#555' },
  provOn:   { borderColor: '#0d1117', background: '#0d1117', color: 'white' },
  rmBtn:    { padding: '8px 11px', borderRadius: 8, border: 'none', background: '#ef4444', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  addBtn:   { padding: '6px 13px', borderRadius: 7, border: '1.5px solid #0d1117', background: 'white', color: '#0d1117', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 },
  sendBtn:  { width: '100%', padding: 11, borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 },
  kakaoBtn: { flex: 1, padding: 11, borderRadius: 8, border: 'none', background: '#fee500', color: '#3a1d1d', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
