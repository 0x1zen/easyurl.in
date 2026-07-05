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
  ReferenceLine,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DestinationChange {
  id: number;
  oldUrl: string;
  newUrl: string;
  changedAt: string;
}

interface AnalyticsData {
  totalClicks: number;
  retentionDays: number;
  bucketSize: "day" | "week" | "month";
  clicksOverTime: { date: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDeviceType: { deviceType: string; count: number }[];
  byBrowser: { browser: string; count: number }[];
  byOs: { os: string; count: number }[];
  byDayOfWeek: { dayOfWeek: string; count: number }[];
  byLanguage: { language: string; count: number }[];
  destinationChanges: DestinationChange[];
}

interface UrlListItem {
  id: number;
  short_code: string;
  is_custom_alias: boolean;
}

interface BarItem {
  label: string;
  count: number;
  icon?: ReactNode;
}

interface StatChipDef {
  bg: string;
  color: string;
  icon: ReactNode;
}

type SegmentOption = 7 | 30 | "all";

// ── Constants ─────────────────────────────────────────────────────────────────

// Desktop = blue, Mobile = violet, Tablet = teal, overflow = gray
const DONUT_COLORS = ["#1f6feb", "#7c5cff", "#0ea5a5", "#9aa2ad"];

// Day-of-week rank colors: index 0 = highest count (darkest), 3 = lowest (lightest)
const DOW_COLORS = ["#1f6feb", "#4f8cf0", "#9dc0f8", "#c3d9fb"];

const SEGMENTS: { label: string; value: SegmentOption }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "All time", value: "all" },
];

// ISO 3166-1 alpha-2 → display name
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", IN: "India", GB: "United Kingdom",
  DE: "Germany", FR: "France", CA: "Canada", AU: "Australia",
  JP: "Japan", CN: "China", BR: "Brazil", RU: "Russia",
  KR: "South Korea", SG: "Singapore", NL: "Netherlands",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  CH: "Switzerland", AT: "Austria", BE: "Belgium", ES: "Spain",
  IT: "Italy", PT: "Portugal", PL: "Poland", CZ: "Czechia",
  HU: "Hungary", RO: "Romania", UA: "Ukraine", GR: "Greece",
  TR: "Turkey", IL: "Israel", ZA: "South Africa", MX: "Mexico",
  AR: "Argentina", CL: "Chile", CO: "Colombia", VN: "Vietnam",
  TH: "Thailand", ID: "Indonesia", MY: "Malaysia", PH: "Philippines",
  PK: "Pakistan", BD: "Bangladesh", EG: "Egypt", NG: "Nigeria",
  KE: "Kenya", NZ: "New Zealand", IE: "Ireland", SA: "Saudi Arabia",
  AE: "United Arab Emirates", HK: "Hong Kong", TW: "Taiwan",
  ZZ: "Unknown",
};

// Browser name → Simple Icons slug (https://cdn.simpleicons.org/{slug})
const BROWSER_SLUGS: Record<string, string> = {
  Chrome: "googlechrome",
  Firefox: "firefox",
  Safari: "safari",
  Edge: "microsoftedge",
  Opera: "opera",
  "Samsung Internet": "samsung",
  "Samsung Browser": "samsung",
  Brave: "brave",
  Vivaldi: "vivaldi",
  "Internet Explorer": "internetexplorer",
};

// OS name → Simple Icons slug
const OS_SLUGS: Record<string, string> = {
  Windows: "windows",
  macOS: "apple",
  iOS: "apple",
  Android: "android",
  Linux: "linux",
  Ubuntu: "ubuntu",
  Fedora: "fedora",
  Debian: "debian",
  "Chrome OS": "googlechrome",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function formatAxisLabel(
  v: string | number,
  bucketSize: "day" | "week" | "month"
): string {
  const s = String(v);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(s);
  if (isNaN(date.getTime())) return s;

  if (bucketSize === "week") {
    const weekOfMonth = Math.ceil(date.getDate() / 7);
    return date.toLocaleDateString("en", { month: "short" }) + " W" + weekOfMonth;
  }
  if (bucketSize === "month") {
    return date.toLocaleDateString("en", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
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

function getCountryDisplay(country: string): string {
  if (/^[A-Z]{2}$/.test(country)) return COUNTRY_NAMES[country] ?? country;
  return country;
}

function getDowColor(count: number, sortedUniqueCounts: number[]): string {
  if (count === 0) return DOW_COLORS[DOW_COLORS.length - 1];
  const rank = sortedUniqueCounts.indexOf(count);
  return DOW_COLORS[Math.min(rank, DOW_COLORS.length - 1)];
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconCursor() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3l14 9-7 1-3 7-4-17z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconMonitor({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconTablet() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Icon helper components ────────────────────────────────────────────────────

function DeviceTypeIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t === "mobile") return <IconPhone />;
  if (t === "tablet") return <IconTablet />;
  return <IconMonitor size={14} />;
}

function CountryFlag({ country }: { country: string }) {
  let iso: string | undefined;
  if (/^[A-Z]{2}$/.test(country)) {
    iso = country.toLowerCase();
  } else {
    const found = Object.entries(COUNTRY_NAMES).find(
      ([, name]) => name.toLowerCase() === country.toLowerCase()
    );
    iso = found ? found[0].toLowerCase() : undefined;
  }
  if (iso === undefined || iso === "zz") return null;
  return (
    <img
      src={`https://flagcdn.com/20x15/${iso}.png`}
      srcSet={`https://flagcdn.com/40x30/${iso}.png 2x`}
      width={20}
      height={15}
      alt=""
      style={{ borderRadius: 2, border: "1px solid #e7ebf1", display: "block", flexShrink: 0 }}
    />
  );
}

// Inline SVGs for brands where the CDN icon is unreliable or missing
function IconWindows() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" fill="#0078D4">
      <path d="M2.5 3.5h8.5v8.5H2.5zM13 2.5h8.5v8.5H13zM2.5 13h8.5v8.5H2.5zM13 13h8.5v8.5H13z" />
    </svg>
  );
}

function IconEdge() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0078D4" d="M21.86 8.54A10 10 0 1 0 12 22a9.62 9.62 0 0 0 5-1.28v-.09a6.51 6.51 0 0 1-4.36-6.07 6.51 6.51 0 0 1 .26-1.81 5.57 5.57 0 0 1 8.66-4.71 9.93 9.93 0 0 0 .3-1.5z" />
      <path fill="#50E6FF" d="M11.73 7.7a5.16 5.16 0 0 1 2.4.56A9.94 9.94 0 0 0 7.82 2.5C4.19 2.5 1 4.76 1 9.13a7.74 7.74 0 0 0 2.35 5.51 6.4 6.4 0 0 1-.19-1.5A6.5 6.5 0 0 1 9.68 7.7z" />
    </svg>
  );
}

function CdnBrandImg({ slug }: { slug: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}`}
      width={16}
      height={16}
      alt=""
      onError={() => setFailed(true)}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

function BrandIcon({ name, slugMap }: { name: string; slugMap: Record<string, string> }) {
  if (name === "Windows") return <IconWindows />;
  if (name === "Edge") return <IconEdge />;
  const slug = slugMap[name];
  if (slug === undefined) return null;
  return <CdnBrandImg slug={slug} />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subline,
  sublineType = "muted",
  chip,
}: {
  label: string;
  value: string | number;
  subline?: string;
  sublineType?: "positive" | "negative" | "muted";
  chip?: StatChipDef;
}) {
  return (
    <div className="card analytics-stat-card">
      <div className="analytics-stat-card-top">
        <span className="analytics-stat-label">{label}</span>
        {chip !== undefined && (
          <span
            className="analytics-stat-chip"
            style={{ background: chip.bg, color: chip.color }}
          >
            {chip.icon}
          </span>
        )}
      </div>
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
            <span className="breakdown-item-label-wrap">
              {item.icon !== undefined && (
                <span className="breakdown-item-icon">{item.icon}</span>
              )}
              <span className="breakdown-item-label">{item.label}</span>
            </span>
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

function formatLanguage(code: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" });
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}

function findClosestDate(
  changedAt: string,
  clicksOverTime: { date: string; count: number }[]
): string | null {
  if (clicksOverTime.length === 0) return null;
  const target = new Date(changedAt).getTime();
  let closest: string | null = null;
  let minDiff = Infinity;
  for (const point of clicksOverTime) {
    const diff = Math.abs(new Date(point.date).getTime() - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point.date;
    }
  }
  return closest;
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

  // Sorted unique click counts descending — used for rank-based DOW bar coloring
  const sortedDowCounts =
    data !== null
      ? [...new Set(data.byDayOfWeek.map((d) => d.count))].sort((a, b) => b - a)
      : [];

  return (
    <div className="dash-page">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <Link to="/" className="navbar-brand">
            <img src="https://res.cloudinary.com/dwokx2ugh/image/upload/v1783216133/favicon-48_zot5eo.png" width={28} height={28} alt="" className="navbar-logo-mark" />
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

        {/* Title row */}
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
              <p className="text-muted">
                <Link to="/login">Sign in</Link> to access analytics for your links.
              </p>
            )}
          </div>
        )}

        {/* Charts */}
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

            {/* Stat cards — each with a colored icon chip */}
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
                chip={{ bg: "#e8f0fd", color: "#1f6feb", icon: <IconCursor /> }}
              />
              <StatCard
                label="Countries"
                value={data.byCountry.length}
                subline="reached"
                sublineType="muted"
                chip={{ bg: "#e4f6f4", color: "#0ea5a5", icon: <IconGlobe /> }}
              />
              <StatCard
                label="Top Device"
                value={data.byDeviceType[0]?.deviceType ?? "N/A"}
                subline={
                  topDevicePct !== null ? `${topDevicePct}% of clicks` : undefined
                }
                sublineType="muted"
                chip={{ bg: "#efeafe", color: "#7c5cff", icon: <IconMonitor /> }}
              />
              <StatCard
                label="Top Browser"
                value={data.byBrowser[0]?.browser ?? "N/A"}
                subline={
                  topBrowserPct !== null ? `${topBrowserPct}% of clicks` : undefined
                }
                sublineType="muted"
                chip={{ bg: "#fef2e2", color: "#f59e0b", icon: <IconClock /> }}
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
                  margin={{ top: 24, right: 16, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="clicksAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1f6feb" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#1f6feb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f0f2f5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string | number) => formatAxisLabel(v, data.bucketSize)}
                    tick={{ fontSize: 12, fill: "#9aa2ad" }}
                    axisLine={false}
                    tickLine={false}
                    interval={data.bucketSize === "day" ? "preserveStartEnd" : 0}
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
                    labelFormatter={(label) => formatAxisLabel(label as string | number, data.bucketSize)}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#1f6feb"
                    strokeWidth={2.5}
                    fill="url(#clicksAreaGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#fff", stroke: "#1f6feb", strokeWidth: 2 }}
                  />
                  {data.destinationChanges.map((change) => {
                    const xValue = findClosestDate(change.changedAt, data.clicksOverTime);
                    if (xValue === null) return null;
                    return (
                      <ReferenceLine
                        key={change.id}
                        x={xValue}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                        strokeWidth={2}
                        label={{
                          value: "↓ destination changed",
                          position: "insideTopLeft",
                          fontSize: 10,
                          fill: "#f59e0b",
                          offset: 8,
                        }}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {data.destinationChanges.length > 0 && (
              <div className="dest-change-note">
                <p className="dest-change-note-intro">
                  ⚡ Dashed lines indicate when this link's destination was changed.
                </p>
                <ul className="dest-change-list">
                  {data.destinationChanges.map((change) => (
                    <li key={change.id}>
                      {new Date(change.changedAt).toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                      })}
                      {" — changed from "}
                      <span className="dest-change-domain">{extractHostname(change.oldUrl)}</span>
                      {" to "}
                      <span className="dest-change-domain">{extractHostname(change.newUrl)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2-column: device donut + day of week bar */}
            <div className="analytics-charts-grid">
              {/* Device donut — Desktop blue, Mobile violet, Tablet teal */}
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
                            className="device-legend-icon"
                            style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}
                          >
                            <DeviceTypeIcon type={entry.deviceType} />
                          </span>
                          <span className="device-legend-name">{entry.deviceType}</span>
                          <strong className="device-legend-pct">{pct}%</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ChartCard>

              {/* Day of week — max bar darkest blue, rest stepped lighter */}
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
                          fill={getDowColor(entry.count, sortedDowCounts)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Top breakdowns — flags, browser icons, OS icons */}
            <ChartCard title="Top breakdowns">
              <div className="breakdown-grid">
                <BreakdownColumn
                  header="Country"
                  items={data.byCountry.slice(0, 5).map((d) => ({
                    label: getCountryDisplay(d.country),
                    count: d.count,
                    icon: <CountryFlag country={d.country} />,
                  }))}
                />
                <BreakdownColumn
                  header="Browser"
                  items={data.byBrowser.slice(0, 5).map((d) => ({
                    label: d.browser,
                    count: d.count,
                    icon: <BrandIcon name={d.browser} slugMap={BROWSER_SLUGS} />,
                  }))}
                />
                <BreakdownColumn
                  header="Operating System"
                  items={data.byOs.slice(0, 5).map((d) => ({
                    label: d.os,
                    count: d.count,
                    icon: <BrandIcon name={d.os} slugMap={OS_SLUGS} />,
                  }))}
                />
                <BreakdownColumn
                  header="Language"
                  items={data.byLanguage.slice(0, 5).map((d) => ({
                    label: formatLanguage(d.language),
                    count: d.count,
                  }))}
                />
              </div>
            </ChartCard>
          </div>
        )}
      </main>
    </div>
  );
}
