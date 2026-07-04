import { useState, useEffect, useRef, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  totalClicks: number;
  retentionDays: number;
  clicksOverTime: { date: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDeviceType: { deviceType: string; count: number }[];
  byBrowser: { browser: string; count: number }[];
  byOs: { os: string; count: number }[];
  byDayOfWeek: { dayOfWeek: string; count: number }[];
}

interface UrlListItem {
  id: number;
  short_code: string;
  is_custom_alias: boolean;
}

interface BarItem {
  label: string;
  count: number;
}

type SegmentOption = 7 | 30 | "all";

// ── Constants ─────────────────────────────────────────────────────────────────

const DONUT_COLORS = ["#1f8a5b", "#7cc4a3", "#dceee5", "#9aa2ad"];

const SEGMENTS: { label: string; value: SegmentOption }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "All time", value: "all" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDayLabel(v: string | number): string {
  const s = String(v);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en", {
      weekday: "short",
    });
  }
  const date = new Date(s);
  return isNaN(date.getTime()) ? s : date.toLocaleDateString("en", { weekday: "short" });
}

function getTrend(
  clicksOverTime: { date: string; count: number }[]
): { pct: number; isPositive: boolean } | null {
  if (clicksOverTime.length < 2) return null;
  const first = clicksOverTime[0]?.count ?? 0;
  const last = clicksOverTime[clicksOverTime.length - 1]?.count ?? 0;
  if (first === 0) return null;
  const pct = Math.round(((last - first) / first) * 100);
  if (pct === 0) return null;
  return { pct: Math.abs(pct), isPositive: last > first };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subline,
  sublineType = "muted",
}: {
  label: string;
  value: string | number;
  subline?: string;
  sublineType?: "positive" | "negative" | "muted";
}) {
  return (
    <div className="card analytics-stat-card">
      <span className="analytics-stat-label">{label}</span>
      <strong className="analytics-stat-value">{value}</strong>
      {subline !== undefined && (
        <span className={`analytics-stat-subline analytics-stat-subline--${sublineType}`}>
          {subline}
        </span>
      )}
    </div>
  );
}

function ChartCard({
  title,
  rightLabel,
  children,
}: {
  title: string;
  rightLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="card analytics-chart-card">
      <div className="analytics-chart-card-header">
        <h3 className="analytics-chart-title">{title}</h3>
        {rightLabel !== undefined && (
          <span className="analytics-chart-label">{rightLabel}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function BreakdownColumn({ header, items }: { header: string; items: BarItem[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="breakdown-col">
      <p className="breakdown-col-header">{header}</p>
      {items.map((item) => (
        <div className="breakdown-item" key={item.label}>
          <div className="breakdown-item-top">
            <span className="breakdown-item-label">{item.label}</span>
            <strong className="breakdown-item-count">
              {item.count.toLocaleString()}
            </strong>
          </div>
          <div className="breakdown-bar-track">
            <div
              className="breakdown-bar-fill"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Analytics page ────────────────────────────────────────────────────────────

export default function Analytics() {
  const { id } = useParams<{ id: string }>();
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [selectedDays, setSelectedDays] = useState<SegmentOption>(7);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [chartsUpdating, setChartsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [shortCode, setShortCode] = useState<string | null>(null);

  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!token || !id) return;

    if (!hasLoadedOnce.current) {
      setInitialLoading(true);
      hasLoadedOnce.current = true;
    } else {
      setChartsUpdating(true);
    }

    const params = selectedDays !== "all" ? `?days=${selectedDays}` : "";
    apiRequest<AnalyticsData>(`/urls/${id}/analytics${params}`, { token })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        setData(null);
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => {
        setInitialLoading(false);
        setChartsUpdating(false);
      });
  }, [token, id, selectedDays]);

  useEffect(() => {
    if (!token) return;
    apiRequest<UrlListItem[]>("/urls", { token })
      .then((urls) => {
        setIsPro(urls.some((u) => u.is_custom_alias));
        const numId = parseInt(id ?? "", 10);
        const matched = urls.find((u) => u.id === numId);
        if (matched) setShortCode(matched.short_code);
      })
      .catch(() => {});
  }, [token, id]);

  function handleLogout(): void {
    logout();
    void navigate("/");
  }

  const isAccessDenied =
    error !== null &&
    (error.includes("403") ||
      error.toLowerCase().includes("access denied") ||
      error.toLowerCase().includes("trial") ||
      error.toLowerCase().includes("expired") ||
      error.toLowerCase().includes("upgrade"));

  const trend = data !== null ? getTrend(data.clicksOverTime) : null;
  const topDevicePct =
    data !== null && data.byDeviceType.length > 0 && data.totalClicks > 0
      ? Math.round((data.byDeviceType[0].count / data.totalClicks) * 100)
      : null;
  const topBrowserPct =
    data !== null && data.byBrowser.length > 0 && data.totalClicks > 0
      ? Math.round((data.byBrowser[0].count / data.totalClicks) * 100)
      : null;
  const maxDayCount =
    data !== null ? Math.max(...data.byDayOfWeek.map((d) => d.count), 0) : 0;

  return (
    <div className="dash-page">
      {/* Header — identical to Dashboard */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <Link to="/" className="navbar-brand">
            <span className="navbar-logo-mark" aria-hidden="true">e</span>
            <span className="navbar-wordmark">
              easyurl<span className="navbar-tld">.in</span>
            </span>
          </Link>
          <div className="dash-header-right">
            <span className="dash-plan-badge">
              {isPro ? "Pro plan" : "Free plan"}
            </span>
            <span className="dash-header-sep" aria-hidden="true" />
            <span className="dash-avatar" aria-label="Account">A</span>
            <button type="button" className="dash-logout-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="dash-body analytics-body">
        {/* Back navigation */}
        <Link to="/dashboard" className="analytics-back-link">
          ← Back to dashboard
        </Link>

        {/* Title row: heading left, segment control right */}
        <div className="analytics-title-row">
          <div>
            <h1 className="dash-heading">Link Analytics</h1>
            <p className="analytics-subtitle">
              {shortCode !== null
                ? `easyurl.in/${shortCode} · Link #${id ?? "?"}`
                : `Link #${id ?? "?"}`}
            </p>
          </div>
          <div className="analytics-segment-wrap">
            {chartsUpdating && (
              <span className="analytics-updating">Updating…</span>
            )}
            <div className="analytics-segment" role="group" aria-label="Date range">
              {SEGMENTS.map((seg) => (
                <button
                  key={String(seg.value)}
                  type="button"
                  className={`analytics-segment-btn${
                    selectedDays === seg.value ? " analytics-segment-btn--active" : ""
                  }`}
                  onClick={() => {
                    if (seg.value !== selectedDays) setSelectedDays(seg.value);
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Initial full-page loading */}
        {initialLoading && (
          <p className="dash-status-text">Loading analytics…</p>
        )}

        {/* Error state */}
        {!initialLoading && error !== null && (
          <div className="analytics-error-block">
            <p className="analytics-error-msg">{error}</p>
            {isAccessDenied && (
              <Link to="/#pricing" className="btn">Upgrade to Pro</Link>
            )}
          </div>
        )}

        {/* Charts — dimmable while a re-fetch is in flight */}
        {!initialLoading && error === null && data !== null && (
          <div
            className={
              chartsUpdating
                ? "analytics-charts analytics-charts--updating"
                : "analytics-charts"
            }
          >
            {data.totalClicks === 0 && (
              <p className="analytics-empty-notice">
                No clicks yet — share your link to start seeing data.
              </p>
            )}

            {/* Stat cards */}
            <div className="analytics-stat-row">
              <StatCard
                label="Total Clicks"
                value={data.totalClicks.toLocaleString()}
                subline={
                  trend !== null
                    ? `${trend.isPositive ? "↑" : "↓"} ${trend.pct}% vs period start`
                    : undefined
                }
                sublineType={
                  trend !== null
                    ? trend.isPositive
                      ? "positive"
                      : "negative"
                    : undefined
                }
              />
              <StatCard
                label="Countries"
                value={data.byCountry.length}
                subline="reached"
                sublineType="muted"
              />
              <StatCard
                label="Top Device"
                value={data.byDeviceType[0]?.deviceType ?? "N/A"}
                subline={
                  topDevicePct !== null ? `${topDevicePct}% of clicks` : undefined
                }
                sublineType="muted"
              />
              <StatCard
                label="Top Browser"
                value={data.byBrowser[0]?.browser ?? "N/A"}
                subline={
                  topBrowserPct !== null ? `${topBrowserPct}% of clicks` : undefined
                }
                sublineType="muted"
              />
            </div>

            {/* Clicks over time — full width */}
            <ChartCard
              title="Clicks over time"
              rightLabel={
                selectedDays === "all" ? "All time" : `Last ${data.retentionDays} days`
              }
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={data.clicksOverTime}
                  margin={{ top: 4, right: 16, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="clicksAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1f8a5b" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#1f8a5b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f0f2f5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string | number) => formatDayLabel(v)}
                    tick={{ fontSize: 12, fill: "#9aa2ad" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#9aa2ad" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value) => [
                      typeof value === "number" ? value.toLocaleString() : String(value),
                      "Clicks",
                    ]}
                    labelFormatter={(label) => formatDayLabel(label as string | number)}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#1f8a5b"
                    strokeWidth={2.5}
                    fill="url(#clicksAreaGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#fff", stroke: "#1f8a5b", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 2-column row: device donut + day of week bar */}
            <div className="analytics-charts-grid">
              {/* Device donut with custom right-side legend */}
              <ChartCard title="Clicks by device">
                <div className="device-chart-wrap">
                  <div className="device-donut-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byDeviceType}
                          dataKey="count"
                          nameKey="deviceType"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          strokeWidth={0}
                        >
                          {data.byDeviceType.map((_entry, i) => (
                            <Cell
                              key={`cell-${i}`}
                              fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            typeof value === "number"
                              ? `${value.toLocaleString()} clicks`
                              : String(value)
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="device-legend">
                    {data.byDeviceType.map((entry, i) => {
                      const pct =
                        data.totalClicks > 0
                          ? Math.round((entry.count / data.totalClicks) * 100)
                          : 0;
                      return (
                        <div className="device-legend-row" key={entry.deviceType}>
                          <span
                            className="device-legend-dot"
                            style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                          />
                          <span className="device-legend-name">{entry.deviceType}</span>
                          <strong className="device-legend-pct">{pct}%</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ChartCard>

              {/* Day of week — max bar highlighted in primary, others in light emerald */}
              <ChartCard title="Clicks by day of week">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={data.byDayOfWeek}
                    margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#f0f2f5" vertical={false} />
                    <XAxis
                      dataKey="dayOfWeek"
                      tickFormatter={(v: string | number) => String(v).charAt(0)}
                      tick={{ fontSize: 12, fill: "#9aa2ad" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value) => [
                        typeof value === "number" ? value.toLocaleString() : String(value),
                        "Clicks",
                      ]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data.byDayOfWeek.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={
                            entry.count === maxDayCount && maxDayCount > 0
                              ? "#1f8a5b"
                              : "#dceee5"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Top breakdowns — single card, 3-column grid inside */}
            <ChartCard title="Top breakdowns">
              <div className="breakdown-grid">
                <BreakdownColumn
                  header="Country"
                  items={data.byCountry
                    .slice(0, 5)
                    .map((d) => ({ label: d.country, count: d.count }))}
                />
                <BreakdownColumn
                  header="Browser"
                  items={data.byBrowser
                    .slice(0, 5)
                    .map((d) => ({ label: d.browser, count: d.count }))}
                />
                <BreakdownColumn
                  header="Operating System"
                  items={data.byOs
                    .slice(0, 5)
                    .map((d) => ({ label: d.os, count: d.count }))}
                />
              </div>
            </ChartCard>
          </div>
        )}
      </main>
    </div>
  );
}
