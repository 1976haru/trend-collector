// ─────────────────────────────────────────────
// ScheduleSettings.jsx — 스케줄 설정 UI
// interval(n시간 간격) / daily(매일 특정 시각) 지원
// ─────────────────────────────────────────────

import { useState } from 'react';
import { SCHEDULE_TYPES, CHANNELS } from '../../constants/config.js';
import { formatFull } from '../../utils/dateUtils.js';

const NOTIFY_LABELS = {
  [CHANNELS.EMAIL]:   '📧 이메일',
  [CHANNELS.KAKAO]:   '💬 카카오톡',
  [CHANNELS.BROWSER]: '🔔 브라우저 알림',
};

export default function ScheduleSettings({ schedules, onAdd, onRemove, onToggle, countdown }) {
  const [type,    setType]    = useState(SCHEDULE_TYPES.DAILY);
  const [hours,   setHours]   = useState('6');
  const [time,    setTime]    = useState('09:00');
  const [label,   setLabel]   = useState('');
  const [channel, setChannel] = useState(CHANNELS.EMAIL);

  function handleAdd() {
    onAdd({ type, hours: Number(hours), time, label: label || `스케줄 ${schedules.length + 1}`, channel });
    setLabel('');
  }

  return (
    <div>
      {/* 현재 카운트다운 */}
      {countdown && (
        <div style={S.cd}>
          ⏰ 다음 수집까지 <strong>{countdown}</strong>
        </div>
      )}

      {/* 새 스케줄 추가 */}
      <div style={S.panel}>
        <div style={S.label}>➕ 새 스케줄 추가</div>

        {/* 타입 선택 */}
        <div style={S.row}>
          {[SCHEDULE_TYPES.DAILY, SCHEDULE_TYPES.INTERVAL].map(t => (
            <button key={t} style={{ ...S.typeBtn, ...(type === t ? S.typeBtnOn : {}) }}
              onClick={() => setType(t)}>
              {t === SCHEDULE_TYPES.DAILY ? '📅 매일 특정 시각' : '⏱ n시간 간격'}
            </button>
          ))}
        </div>

        {/* 타입별 옵션 */}
        {type === SCHEDULE_TYPES.DAILY ? (
          <div style={S.row}>
            <label style={S.fieldLabel}>수집 시각</label>
            <input type="time" style={S.inp} value={time} onChange={e => setTime(e.target.value)} />
          </div>
        ) : (
          <div style={S.row}>
            <label style={S.fieldLabel}>간격</label>
            <select style={S.inp} value={hours} onChange={e => setHours(e.target.value)}>
              {['1','2','3','6','12','24'].map(h => (
                <option key={h} value={h}>{h}시간마다</option>
              ))}
            </select>
          </div>
        )}

        {/* 알림 채널 */}
        <div style={S.row}>
          <label style={S.fieldLabel}>알림 채널</label>
          <select style={S.inp} value={channel} onChange={e => setChannel(e.target.value)}>
            {Object.entries(NOTIFY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 이름 (선택) */}
        <div style={S.row}>
          <label style={S.fieldLabel}>이름 (선택)</label>
          <input style={S.inp} placeholder="예: 오전 스크랩" value={label}
            onChange={e => setLabel(e.target.value)} />
        </div>

        <button style={S.addBtn} onClick={handleAdd}>✅ 스케줄 추가</button>
      </div>

      {/* 등록된 스케줄 목록 */}
      <div style={S.panel}>
        <div style={S.label}>📋 등록된 스케줄 ({schedules.length}개)</div>
        {schedules.length === 0 ? (
          <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '20px 0' }}>
            스케줄이 없습니다. 위에서 추가해주세요.
          </div>
        ) : (
          schedules.map(s => (
            <div key={s.id} style={S.schedRow}>
              <div style={S.schedInfo}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</span>
                <span style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {s.type === SCHEDULE_TYPES.DAILY ? `매일 ${s.time}` : `${s.hours}시간마다`}
                  {' · '}{NOTIFY_LABELS[s.channel] || s.channel}
                </span>
                {s.nextAt && (
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    다음: {formatFull(s.nextAt)}
                  </span>
                )}
                {s.lastRun && (
                  <span style={{ fontSize: 10, color: '#22c55e' }}>
                    마지막 실행: {formatFull(s.lastRun)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button style={{ ...S.sm, background: s.enabled ? '#22c55e' : '#94a3b8' }}
                  onClick={() => onToggle(s.id)}>
                  {s.enabled ? 'ON' : 'OFF'}
                </button>
                <button style={{ ...S.sm, background: '#ef4444' }}
                  onClick={() => onRemove(s.id)}>삭제</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 안내 */}
      <div style={S.info}>
        💡 스케줄은 브라우저가 열려있는 동안 실행됩니다.<br />
        백그라운드 자동화가 필요하면 GitHub Actions 설정을 README에서 확인하세요.
      </div>
    </div>
  );
}

const S = {
  cd:       { background: '#0d1117', color: '#7ec8e3', borderRadius: 10, padding: '11px 15px', marginBottom: 11, fontSize: 13, textAlign: 'center' },
  panel:    { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:    { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12 },
  row:      { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: '#555' },
  inp:      { border: '2px solid #e5e0d8', borderRadius: 8, padding: '8px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafaf8' },
  typeBtn:  { flex: 1, padding: '9px 6px', borderRadius: 8, border: '2px solid #e5e0d8', background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#555' },
  typeBtnOn: { borderColor: '#0d1117', background: '#0d1117', color: 'white' },
  addBtn:   { width: '100%', padding: 11, borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 },
  schedRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f0ede8', gap: 8 },
  schedInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  sm:       { padding: '5px 10px', borderRadius: 6, border: 'none', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  info:     { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 11, fontSize: 11.5, color: '#92400e', lineHeight: 1.6 },
};
