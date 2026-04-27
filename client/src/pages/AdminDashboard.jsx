import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  ShieldCheck,
  LogOut,
  Users,
  Repeat,
  Trophy,
  Clock3,
  AlertTriangle,
  MessageSquareText,
  RefreshCw,
  BarChart2,
  Gamepad2,
  Flag,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Inbox,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// ── Colour palette (matches CSS vars, defined here for recharts) ──────────────
const C = {
  accent: 'var(--accent)',
  accent2: 'var(--accent-2)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  muted: 'var(--text-muted)',
  line: 'var(--line-soft)',
  panel: 'var(--panel-strong)',
};

const GUESS_COLOURS = [
  'var(--good)',
  '#6aad5a',
  'var(--warn)',
  '#c97c2a',
  'var(--accent)',
  'var(--bad)',
];

const PIE_COLOURS = ['var(--accent)', 'var(--accent-2)'];
const CATEGORY_COLOURS = {
  offensive: '#c2462e',
  invalid: '#bf7a1a',
  proper_noun: '#5b7f3a',
  misspelled: '#966019',
  other: '#6e6961',
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function fmt(v) { return new Intl.NumberFormat('en-IN').format(Number(v || 0)); }
function pct(v) { return `${Number(v || 0)}%`; }

const tooltipStyle = {
  background: 'var(--panel-strong)',
  border: '2px solid var(--line)',
  borderRadius: 12,
  color: 'var(--text)',
  fontSize: 13,
};

// ── Subcomponents ─────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, label }) {
  return (
    <div className="adm-section-title">
      <Icon size={16} />
      <span>{label}</span>
    </div>
  );
}

function ChartCard({ title, subtitle, children, span1 }) {
  return (
    <article className={`adm-chart-card panel${span1 ? ' adm-span1' : ''}`}>
      <p className="adm-chart-label">{title}</p>
      {subtitle && <p className="adm-chart-sub">{subtitle}</p>}
      <div className="adm-chart-wrap">{children}</div>
    </article>
  );
}

function KpiCard({ title, value, detail, icon: Icon, accentColor, trend }) {
  return (
    <article className="adm-kpi panel" style={{ '--kpi-accent': accentColor || 'var(--accent)' }}>
      <div className="adm-kpi-top">
        <p className="adm-kpi-label">{title}</p>
        <div className="adm-kpi-icon"><Icon size={16} /></div>
      </div>
      <div className="adm-kpi-bottom">
        <h3 className="adm-kpi-value">{value}</h3>
        <div className="adm-kpi-detail">
          {trend === 'up' && <TrendingUp size={12} style={{ color: 'var(--good)' }} />}
          {trend === 'down' && <TrendingDown size={12} style={{ color: 'var(--bad)' }} />}
          {trend === 'flat' && <Minus size={12} style={{ color: 'var(--text-muted)' }} />}
          <span>{detail}</span>
        </div>
      </div>
    </article>
  );
}

function CategoryChip({ category }) {
  const color = CATEGORY_COLOURS[category] || CATEGORY_COLOURS.other;
  return (
    <span className="adm-category-chip" style={{ '--chip-color': color }}>
      {(category || 'other').replace('_', ' ')}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="adm-empty-state">
      <Inbox size={36} strokeWidth={1.5} />
      <p>{message}</p>
    </div>
  );
}

// ── Horizontal guess-dist bar ─────────────────────────────────────────────────
function GuessBars({ data }) {
  const max = Math.max(...data.map((d) => d.solves), 1);
  return (
    <div className="adm-guess-bars">
      {data.map((d, i) => (
        <div key={d.guess} className="adm-guess-row">
          <span className="adm-guess-num">{d.guess}</span>
          <div className="adm-guess-track">
            <div
              className="adm-guess-fill"
              style={{
                width: `${Math.max((d.solves / max) * 100, d.solves > 0 ? 4 : 0)}%`,
                background: GUESS_COLOURS[i],
              }}
            />
          </div>
          <span className="adm-guess-count">{fmt(d.solves)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Top Reported Words ────────────────────────────────────────────────────────
function TopWordsCard({ data }) {
  const max = Math.max(...(data || []).map((d) => d.count), 1);
  if (!data?.length) return <EmptyState message="No reported words yet." />;
  return (
    <div className="adm-top-words">
      {data.map((row) => (
        <div key={row.word} className="adm-top-word-row">
          <span className="adm-top-word-text">{row.word}</span>
          <CategoryChip category={row.category} />
          <div className="adm-top-word-bar-wrap">
            <div
              className="adm-top-word-bar"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
          <span className="adm-top-word-count">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Queue item ────────────────────────────────────────────────────────────────
function QueueItem({ children, actions }) {
  return (
    <div className="adm-queue-item">
      <div className="adm-queue-body">{children}</div>
      <div className="adm-queue-actions">{actions}</div>
    </div>
  );
}

// ── Tab nav ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',    Icon: BarChart2 },
  { id: 'engagement', label: 'Engagement',  Icon: TrendingUp },
  { id: 'moderation', label: 'Moderation',  Icon: Flag },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword]           = useState('');
  const [loginError, setLoginError]       = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData]     = useState(false);
  const [dashboard, setDashboard]         = useState(null);
  const [reports, setReports]             = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [moderating, setModerating]       = useState(false);
  const [activeTab, setActiveTab]         = useState('overview');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const stats  = dashboard?.stats;
  const charts = dashboard?.charts;

  // ── API helpers ─────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard`, { credentials: 'include' });
      if (res.status === 401) { setAuthenticated(false); return; }
      if (res.ok) { setDashboard(await res.json()); setLastRefreshed(new Date()); }
    } finally {
      setLoadingData(false);
    }
  }, []);

  const loadQueues = useCallback(async () => {
    const [rr, fr] = await Promise.all([
      fetch(`${API_URL}/api/admin/reports?status=pending&limit=20`, { credentials: 'include' }),
      fetch(`${API_URL}/api/admin/feedback?status=open&limit=20`,   { credentials: 'include' }),
    ]);
    if (rr.ok) { const p = await rr.json(); setReports(p.reports || []); }
    if (fr.ok) { const p = await fr.json(); setFeedbackItems(p.items || []); }
  }, []);

  const refreshAll = useCallback(() => Promise.all([loadDashboard(), loadQueues()]), [loadDashboard, loadQueues]);

  async function checkSession() {
    setLoadingSession(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/session`, { credentials: 'include' });
      setAuthenticated(res.ok);
      if (res.ok) await refreshAll();
    } catch { setAuthenticated(false); }
    finally { setLoadingSession(false); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) { setLoginError(payload.message || 'Access denied.'); return; }
      setPassword('');
      setAuthenticated(true);
      await refreshAll();
    } catch { setLoginError('Unable to reach admin service.'); }
  }

  async function handleLogout() {
    try { await fetch(`${API_URL}/api/admin/logout`, { method: 'POST', credentials: 'include' }); }
    finally { setAuthenticated(false); setDashboard(null); setReports([]); setFeedbackItems([]); }
  }

  async function updateReport(id, status) {
    setModerating(true);
    try {
      await fetch(`${API_URL}/api/admin/reports/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refreshAll();
    } finally { setModerating(false); }
  }

  async function updateFeedback(id, status) {
    setModerating(true);
    try {
      await fetch(`${API_URL}/api/admin/feedback/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refreshAll();
    } finally { setModerating(false); }
  }

  useEffect(() => { checkSession(); }, []);

  useEffect(() => {
    if (!authenticated) return;
    const id = setInterval(refreshAll, 30_000);
    return () => clearInterval(id);
  }, [authenticated, refreshAll]);

  // ── KPI config ──────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!stats) return [];
    return [
      { title: 'Total Players',      value: fmt(stats.totalUsers),       detail: `${fmt(stats.newUsersToday)} joined today`,         icon: Users,             accentColor: 'var(--accent)',    trend: stats.newUsersToday > 0 ? 'up' : 'flat'          },
      { title: 'Return Rate',        value: pct(stats.hasReturnedRate),  detail: 'players who came back at least once',              icon: Repeat,            accentColor: 'var(--accent-2)',  trend: stats.hasReturnedRate > 50 ? 'up' : 'flat'       },
      { title: 'Round Solve Rate',   value: pct(stats.roundSolveRate),   detail: `${fmt(stats.totalRounds)} rounds played`,          icon: Trophy,            accentColor: 'var(--good)',      trend: stats.roundSolveRate > 50 ? 'up' : 'down'        },
      { title: 'Avg Round Time',     value: `${fmt(stats.avgDuration)}s`, detail: `avg ${stats.avgGuesses} guesses per round`,        icon: Clock3,            accentColor: 'var(--warn)',      trend: 'flat'                                            },
      { title: 'Open Reports',       value: fmt(stats.pendingReports),   detail: 'Needs moderation',                                 icon: AlertTriangle,     accentColor: 'var(--accent)',    trend: stats.pendingReports > 0 ? 'down' : 'up'         },
      { title: 'Open Suggestions',   value: fmt(stats.openFeedback),     detail: 'From Panda Den',                                   icon: MessageSquareText, accentColor: 'var(--accent-2)',  trend: 'flat'                                            },
    ];
  }, [stats]);

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (loadingSession) {
    return (
      <div className="adm-shell adm-centered">
        <div className="adm-spinner" />
        <p className="adm-loading-text">Verifying session…</p>
      </div>
    );
  }

  // ── Render: login ───────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="adm-shell adm-centered">
        <div className="adm-login-card panel">
          <div className="adm-login-icon-wrap">
            <ShieldCheck size={28} />
          </div>
          <h2 className="adm-login-title">Analytics Access</h2>
          <p className="adm-login-sub">Enter the admin password to unlock the dashboard.</p>
          <form className="adm-login-form" onSubmit={handleLogin}>
            <label htmlFor="admin-password" className="adm-field-label">Password</label>
            <input
              id="admin-password"
              type="password"
              className="adm-login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
              placeholder="••••••••••••"
            />
            {loginError && <p className="adm-login-error">{loginError}</p>}
            <button type="submit" className="adm-login-btn">
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: dashboard ───────────────────────────────────────────────────────
  return (
    <div className="adm-shell">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <header className="adm-hero panel">
        <div className="adm-hero-left">
          <p className="adm-hero-kicker">Internal · Admin Only</p>
          <h1 className="adm-hero-title">Analytics Command Center</h1>
          <p className="adm-hero-sub">
            Gameplay quality, retention &amp; moderation · auto-refreshes every 30s
          </p>
        </div>
        <div className="adm-hero-right">
          {lastRefreshed && (
            <p className="adm-last-refresh">
              Last refresh: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
          <div className="adm-hero-actions">
            <button
              type="button"
              className="ghost-btn adm-refresh-btn"
              onClick={refreshAll}
              disabled={loadingData || moderating}
              title="Refresh data"
            >
              <RefreshCw size={15} className={loadingData ? 'adm-spin' : ''} />
              {loadingData ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="ghost-btn danger" onClick={handleLogout}>
              <LogOut size={15} />
              Lock
            </button>
          </div>
        </div>
      </header>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="adm-kpi-grid">
        {kpis.map((k) => <KpiCard key={k.title} {...k} />)}
      </div>

      {/* ── Tab nav ──────────────────────────────────────────────────────── */}
      <nav className="adm-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`adm-tab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* ── Tab: Overview ────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="adm-tab-content">
          <SectionTitle icon={BarChart2} label="Platform Overview" />
          <div className="adm-chart-grid adm-2col">

            {/* 30-day DAU */}
            <ChartCard title="Player Activity — 30 Days" subtitle="Players grouped by last active day (not session count)">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts?.dau30 || []}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="users" stroke={C.accent} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Solo vs Multiplayer pie */}
            <ChartCard title="Game Mode Split" subtitle="Solo vs Multiplayer rounds">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts?.gameModes || []}
                    dataKey="games"
                    nameKey="mode"
                    cx="50%"
                    cy="50%"
                    innerRadius="40%"
                    outerRadius="65%"
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {(charts?.gameModes || []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Word-length solve rate */}
            <ChartCard title="Round Solve Rate by Word Length" subtitle="% of rounds solved — 4, 5, and 6-letter words">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.wordLengthSolveRate || []}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" />
                  <XAxis dataKey="length" tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Solve Rate']} />
                  <Bar dataKey="solveRate" fill={C.good} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Room size distribution */}
            <ChartCard title="Room Size Distribution" subtitle="Number of rounds played by player count">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.roomSizeDistribution || []}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" />
                  <XAxis dataKey="size" tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Rounds']} />
                  <Bar dataKey="rounds" fill={C.accent2} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {/* ── Tab: Engagement ──────────────────────────────────────────────── */}
      {activeTab === 'engagement' && (
        <div className="adm-tab-content">
          <SectionTitle icon={TrendingUp} label="Player Engagement" />
          <div className="adm-chart-grid adm-2col">

            {/* 7-day active */}
            <ChartCard title="7-Day Activity" subtitle="Players grouped by last active day (not session count)">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts?.dau || []}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="users" stroke={C.accent2} strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Rounds per player distribution */}
            <ChartCard title="Rounds Per Player" subtitle="How many rounds each player has played (rounds, not matches)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.roundsPerPlayerDistribution || []}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" />
                  <XAxis dataKey="bucket" tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Players']} />
                  <Bar dataKey="players" fill={C.good} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Peak hours */}
            <ChartCard title="Last Active Hour Distribution" subtitle="UTC hour of each player's most recent session (not session count)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.peakHours || []}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 4" />
                  <XAxis dataKey="hour" tick={{ fill: C.muted, fontSize: 10 }} interval={2} />
                  <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="users" fill={C.accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Guess distribution — horizontal colour bars */}
            <ChartCard title="Guess Distribution" subtitle="How many guesses players needed to solve the word">
              <GuessBars data={charts?.guessDistribution || [
                { guess: '1', solves: 0 }, { guess: '2', solves: 0 },
                { guess: '3', solves: 0 }, { guess: '4', solves: 0 },
                { guess: '5', solves: 0 }, { guess: '6', solves: 0 },
              ]} />
            </ChartCard>
          </div>
        </div>
      )}

      {/* ── Tab: Moderation ──────────────────────────────────────────────── */}
      {activeTab === 'moderation' && (
        <div className="adm-tab-content">
          <SectionTitle icon={Flag} label="Moderation Queues &amp; Reports" />

          <div className="adm-mod-grid">

            {/* Top reported words */}
            <article className="adm-mod-card panel">
              <div className="adm-mod-head">
                <p className="adm-chart-label">Top Reported Words</p>
                <AlertTriangle size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <TopWordsCard data={charts?.topReportedWords} />
            </article>

            {/* Feedback by type pie */}
            <article className="adm-mod-card panel">
              <div className="adm-mod-head">
                <p className="adm-chart-label">Feedback Breakdown</p>
                <MessageSquareText size={15} style={{ color: 'var(--accent-2)' }} />
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts?.feedbackByType || []}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      innerRadius="35%"
                      outerRadius="60%"
                      paddingAngle={4}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {(charts?.feedbackByType || []).map((_, i) => (
                        <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>

            {/* Pending word reports queue */}
            <article className="adm-mod-card adm-mod-full panel">
              <div className="adm-mod-head">
                <p className="adm-chart-label">Pending Word Reports</p>
                <span className="adm-queue-badge">{reports.length}</span>
              </div>
              {!reports.length
                ? <EmptyState message="All clear — no pending word reports." />
                : (
                    <div className="adm-queue-list">
                      {reports.map((r) => (
                        <QueueItem
                          key={r._id}
                          actions={
                            <>
                              <button type="button" className="ghost-btn adm-act-btn" onClick={() => updateReport(r._id, 'reviewed')} disabled={moderating}>
                                <CheckCircle2 size={13} /> Review
                              </button>
                              <button type="button" className="ghost-btn danger adm-act-btn" onClick={() => updateReport(r._id, 'rejected')} disabled={moderating}>
                                <XCircle size={13} /> Reject
                              </button>
                            </>
                          }
                        >
                          <div className="adm-queue-title-row">
                            <span className="adm-queue-word">{r.reportedWord}</span>
                            <CategoryChip category={r.category} />
                          </div>
                          <p className="adm-queue-meta">
                            {r.reporter?.playerName || 'Player'} · Round {r.match?.currentRound}/{r.match?.numRounds}
                          </p>
                          {r.reasonText && <p className="adm-queue-reason">{r.reasonText}</p>}
                        </QueueItem>
                      ))}
                    </div>
                  )}
            </article>

            {/* Open feedback queue */}
            <article className="adm-mod-card adm-mod-full panel">
              <div className="adm-mod-head">
                <p className="adm-chart-label">Open Suggestions &amp; Issues</p>
                <span className="adm-queue-badge">{feedbackItems.length}</span>
              </div>
              {!feedbackItems.length
                ? <EmptyState message="No open feedback — all caught up!" />
                : (
                    <div className="adm-queue-list">
                      {feedbackItems.map((item) => (
                        <QueueItem
                          key={item._id}
                          actions={
                            <>
                              <button type="button" className="ghost-btn adm-act-btn" onClick={() => updateFeedback(item._id, 'reviewed')} disabled={moderating}>
                                <CheckCircle2 size={13} /> Review
                              </button>
                              <button type="button" className="ghost-btn adm-act-btn" onClick={() => updateFeedback(item._id, 'resolved')} disabled={moderating}>
                                Resolved
                              </button>
                            </>
                          }
                        >
                          <div className="adm-queue-title-row">
                            <span className="adm-queue-word">{item.title}</span>
                            <CategoryChip category={item.type} />
                          </div>
                          <p className="adm-queue-meta">{new Date(item.createdAt).toLocaleString()}</p>
                          <p className="adm-queue-reason">{item.message}</p>
                          {item.contactEmail && (
                            <p className="adm-queue-meta">✉ {item.contactEmail}</p>
                          )}
                        </QueueItem>
                      ))}
                    </div>
                  )}
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
