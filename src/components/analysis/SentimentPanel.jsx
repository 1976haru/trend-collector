// ─────────────────────────────────────────────
// SentimentPanel.jsx — 감성 분석 패널
// (감성 데이터가 없을 땐 안내 표시)
// ─────────────────────────────────────────────

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatShort } from '../../utils/dateUtils.js';

const SC = { 긍정: '#22c55e', 부정: '#ef4444', 중립: '#94a3b8' };

export default function SentimentPanel({ articles, sentiments, history }) {
  const [period, setPeriod] = useState('daily');

  const hasSentiment = sentiments && sentiments.length > 0;

  if (!hasSentiment) {
    return (
      <div style={{ textAlign: 'center', padding: '44px 20px', color: '#aaa' }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#666' }}>감성 분석 데이터가 없습니다</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          뉴스 수집 후 Claude API 감성 분석이 가능합니다.<br />
          설정 탭에서 Claude API 키를 입력하거나,<br />
          기사별 수동 라벨을 지정하세요.
        </div>
      </div>
    );
  }

  const posCount = sentiments.filter(s => s.label === '긍정').length;
  const negCount = sentiments.filter(s => s.label === '부정').length;
  const neuCount = sentiments.filter(s => s.label === '중립').length;

  const pieTotals = { 긍정: posCount, 부정: negCount, 중립: neuCount };
  const pieData   = Object.entries(pieTotals).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  const chartData = buildChartData(history, period);

  return (
    <div>
      {/* 요약 카드 */}
      <div style={S.statRow}>
        {[
          { label: '긍정', value: posCount, color: '#22c55e' },
          { label: '부정', value: negCount, color: '#ef4444' },
          { label: '중립', value: neuCount, color: '#94a3b8' },
        ].map(c => (
          <div key={c.label} style={S.card}>
            <div style={{ ...S.num, color: c.color }}>{c.value}</div>
            <div style={S.cl}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 파이 차트 */}
      <div style={S.panel}>
        <div style={S.label}>🥧 이번 수집 감성 분포</div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((e, i) => <Cell key={i} fill={SC[e.name] || '#ccc'} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 기간별 추이 */}
      <div style={S.panel}>
        <div style={S.label}>📈 기간별 감성 추이</div>
        <div style={S.periodRow}>
          {[['daily', '일간'], ['weekly', '주간'], ['monthly', '월간']].map(([v, l]) => (
            <button key={v} style={{ ...S.pb, ...(period === v ? S.pbOn : {}) }} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
        {chartData.length === 0
          ? <div style={{ textAlign: 'center', padding: '22px 0', color: '#aaa', fontSize: 12 }}>수집을 반복하면 추이가 표시됩니다</div>
          : <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="긍정" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="부정" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="중립" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>}
      </div>

      {/* 키워드별 긍정 비율 */}
      <div style={S.panel}>
        <div style={S.label}>🔑 키워드별 긍정 비율</div>
        {[...new Set(articles.map(a => a.keyword))].map(kw => {
          const idxs = articles.map((a, i) => a.keyword === kw ? i : -1).filter(i => i !== -1);
          const ks   = idxs.map(i => sentiments[i]).filter(Boolean);
          if (!ks.length) return null;
          const pos = ks.filter(s => s.label === '긍정').length;
          const pct = Math.round(pos / ks.length * 100);
          return (
            <div key={kw} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <span>{kw} ({ks.length}건)</span>
                <span style={{ color: pct >= 50 ? '#22c55e' : '#ef4444' }}>{pct}% 긍정</span>
              </div>
              <div style={{ background: '#f0ede8', borderRadius: 20, height: 7, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 50 ? '#22c55e' : '#ef4444', borderRadius: 20, transition: 'width .6s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildChartData(history, period) {
  const ws = (history || []).filter(h => h.pos !== undefined);
  if (!ws.length) return [];
  if (period === 'daily') return ws.slice(-7).map(h => ({ name: formatShort(h.date), 긍정: h.pos || 0, 부정: h.neg || 0, 중립: h.neu || 0 }));
  if (period === 'weekly') {
    const wks = {};
    ws.forEach(h => {
      const d = new Date(h.date), k = `${d.getMonth() + 1}월${Math.ceil(d.getDate() / 7)}주`;
      if (!wks[k]) wks[k] = { name: k, 긍정: 0, 부정: 0, 중립: 0 };
      wks[k].긍정 += h.pos || 0; wks[k].부정 += h.neg || 0; wks[k].중립 += h.neu || 0;
    });
    return Object.values(wks).slice(-4);
  }
  const mo = {};
  ws.forEach(h => {
    const d = new Date(h.date), k = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!mo[k]) mo[k] = { name: k, 긍정: 0, 부정: 0, 중립: 0 };
    mo[k].긍정 += h.pos || 0; mo[k].부정 += h.neg || 0; mo[k].중립 += h.neu || 0;
  });
  return Object.values(mo).slice(-6);
}

const S = {
  statRow:   { display: 'flex', gap: 7, marginBottom: 11 },
  card:      { flex: 1, background: 'white', borderRadius: 10, padding: 11, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  num:       { fontSize: 24, fontWeight: 700 },
  cl:        { fontSize: 10, color: '#aaa', marginTop: 1 },
  panel:     { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:     { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },
  periodRow: { display: 'flex', gap: 5, marginBottom: 12 },
  pb:        { padding: '5px 12px', borderRadius: 20, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', color: '#555' },
  pbOn:      { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
};
