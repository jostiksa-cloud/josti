import "./styles.css";
import "leaflet/dist/leaflet.css";
import { type ReactNode, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";

class ApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}
type Row = Record<string, unknown>;
type Lang = "ar" | "en";
const tx = (lang: Lang, ar: string, en: string) => (lang === "ar" ? ar : en);
const text = (value: unknown) => (value == null ? "" : String(value));
function when(value: unknown, lang: Lang) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const DEFAULT_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
};

function useMapTiles() {
  const [tiles, setTiles] = useState(DEFAULT_TILES);
  useEffect(() => {
    api<Row>("/public/map-style")
      .then((row) => {
        if (text(row.tileUrl)) setTiles({ url: text(row.tileUrl), attribution: text(row.attribution) || DEFAULT_TILES.attribution });
      })
      .catch(() => undefined);
  }, []);
  return tiles;
}

async function api<T>(path: string, options: { method?: string; json?: unknown } = {}): Promise<T> {
  const headers = new Headers({ "X-JOSTI-Client": "web" });
  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error?.message ?? "Request failed");
  return (payload.data ?? payload) as T;
}

function AdminApp() {
  const [lang, setLang] = useState<Lang>((localStorage.getItem("josti-admin-lang") as Lang) || "ar");
  const [dark, setDark] = useState(localStorage.getItem("josti-admin-theme") === "dark");
  const [account, setAccount] = useState<Row | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("ltr", lang === "en");
    localStorage.setItem("josti-admin-lang", lang);
  }, [lang]);
  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("josti-admin-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    api<Row>("/auth/me")
      .then((me) => setAccount(text(me.role) === "administrator" ? me : null))
      .catch(() => setAccount(null))
      .finally(() => setReady(true));
  }, []);
  if (!ready) return <p className="main">{tx(lang, "جار التحميل…", "Loading…")}</p>;
  return (
    <BrowserRouter>
      <Shell
        lang={lang}
        setLang={setLang}
        dark={dark}
        setDark={setDark}
        account={account}
        setAccount={setAccount}
      >
        <Routes>
          <Route path="/" element={<Queue lang={lang} account={account} />} />
          <Route
            path="/login"
            element={
              <Login lang={lang} setLang={setLang} dark={dark} setDark={setDark} onAuth={setAccount} />
            }
          />
          <Route path="/users" element={<Users lang={lang} account={account} />} />
          <Route path="/users/:id" element={<UserDetail lang={lang} account={account} />} />
          <Route path="/fleet" element={<FleetBoard lang={lang} account={account} />} />
          <Route path="/fleet/:id" element={<FleetDetail lang={lang} account={account} />} />
          <Route path="/finance" element={<Finance lang={lang} account={account} />} />
          <Route path="/map" element={<LiveMap lang={lang} account={account} />} />
          <Route path="/requests/:id" element={<RequestDetail lang={lang} account={account} />} />
          <Route path="/trips/:id" element={<TripDetail lang={lang} account={account} />} />
          <Route path="/incidents/:id" element={<IncidentDetail lang={lang} account={account} />} />
          <Route path="/documents/:id" element={<DocumentDetail lang={lang} account={account} />} />
          <Route path="/integrations" element={<Integrations lang={lang} account={account} />} />
          <Route path="/audit" element={<Audit lang={lang} account={account} />} />
          <Route path="/audit/:id" element={<AuditDetail lang={lang} account={account} />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

function Shell({
  lang,
  setLang,
  dark,
  setDark,
  account,
  setAccount,
  children,
}: {
  lang: Lang;
  setLang: (v: Lang) => void;
  dark: boolean;
  setDark: (value: boolean | ((value: boolean) => boolean)) => void;
  account: Row | null;
  setAccount: (v: Row | null) => void;
  children: ReactNode;
}) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const links = [
    ["/", tx(lang, "لوحة المتابعة", "Overview")],
    ["/users", tx(lang, "التوثيق", "Verification")],
    ["/fleet", tx(lang, "المركبات والسائقون", "Vehicles & drivers")],
    ["/finance", tx(lang, "التقارير والرسوم", "Reports & fees")],
    ["/map", tx(lang, "التتبع", "Tracking")],
    ["/audit", tx(lang, "السجل", "Audit")],
    ["/integrations", tx(lang, "التكاملات", "Integrations")],
  ];
  return (
    <div className="app">
      {open ? (
        <button
          className="backdrop"
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside className={open ? "side open" : "side"}>
        <img className="logo" src="/brand/JOSTI_Arabic_Tagline_Reverse.svg" alt="JOSTI" />
        <div className="brandline">{tx(lang, "نعرف الطريق", "We know the way")}</div>
        <div className="navlabel">{tx(lang, "مساحة العمل", "WORKSPACE")}</div>
        <nav>
          {links.map(([path, label]) => (
            <NavLink
              key={path}
              to={path ?? "/"}
              end={path === "/"}
              className={({ isActive }) => (isActive ? "active" : undefined)}
              onClick={() => setOpen(false)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="top">
          <button className="ghost menu" type="button" onClick={() => setOpen((value) => !value)}>
            {tx(lang, "القائمة", "Menu")}
          </button>
          <strong>{text(account?.fullName) || tx(lang, "إدارة جوستي", "JOSTI Operations")}</strong>
          <div className="row">
            <button className="ghost" type="button" onClick={() => setDark((value) => !value)}>
              {dark ? tx(lang, "فاتح", "Light") : tx(lang, "داكن", "Dark")}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            >
              {lang === "ar" ? "EN" : "عربي"}
            </button>
            {account ? (
              <button
                className="ghost"
                type="button"
                onClick={async () => {
                  await api("/auth/logout", { method: "POST", json: {} });
                  setAccount(null);
                  nav("/login");
                }}
              >
                {tx(lang, "خروج", "Log out")}
              </button>
            ) : null}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function Login({
  lang,
  setLang,
  dark,
  setDark,
  onAuth,
}: {
  lang: Lang;
  setLang: (value: Lang) => void;
  dark: boolean;
  setDark: (value: boolean | ((value: boolean) => boolean)) => void;
  onAuth: (row: Row) => void;
}) {
  const nav = useNavigate();
  const [error, setError] = useState("");
  return (
    <form
      className="card login-wrap"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api("/auth/login", {
            json: { email: form.get("email"), password: form.get("password") },
          });
          const me = await api<Row>("/auth/me");
          if (text(me.role) !== "administrator")
            throw new ApiError(
              tx(lang, "هذا الدخول للإداريين فقط.", "This sign-in is for administrators."),
            );
          onAuth(me);
          nav("/");
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Error");
        }
      }}
    >
      <img className="logo-color" src="/brand/JOSTI_Arabic_Tagline_Color.svg" alt="JOSTI" />
      <img className="logo-reverse" src="/brand/JOSTI_Arabic_Tagline_Reverse.svg" alt="JOSTI" />
      <div className="row">
        <button className="ghost" type="button" onClick={() => setDark((value) => !value)}>
          {dark ? tx(lang, "الوضع الفاتح", "Light mode") : tx(lang, "الوضع الداكن", "Dark mode")}
        </button>
        <button className="ghost" type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {lang === "ar" ? "English" : "العربية"}
        </button>
      </div>
      <h1>{tx(lang, "دخول الإدارة", "Administrator sign-in")}</h1>
      {error ? <div className="err">{error}</div> : null}
      <label>
        {tx(lang, "البريد", "Email")}
        <input name="email" type="email" required />
      </label>
      <label>
        {tx(lang, "كلمة المرور", "Password")}
        <input name="password" type="password" required />
      </label>
      <button className="primary" type="submit">
        {tx(lang, "دخول", "Sign in")}
      </button>
    </form>
  );
}

function need(account: Row | null) {
  return account ? null : <Navigate to="/login" replace />;
}

const labels: Record<string, [string, string]> = {
  closed: ["مغلقة", "Closed"],
  in_transit: ["في الطريق", "In transit"],
  pending: ["مستحقة", "Pending"],
  settled: ["مسددة خارجياً", "Settled externally"],
  exempt: ["معفاة", "Exempt"],
  delivered: ["تم التسليم", "Delivered"],
  assigned: ["معيّنة", "Assigned"],
  loaded: ["تم التحميل", "Loaded"],
  trip_started: ["بدأت الرحلة", "Trip started"],
  arrived_at_port: ["وصلت الميناء", "Arrived at port"],
  arrived_at_destination: ["وصلت الوجهة", "Arrived at destination"],
  en_route_to_port: ["في الطريق إلى الميناء", "En route to port"],
  ready_for_admin_review: ["بانتظار الإفراج", "Ready for release"],
  customs_clearance: ["قيد التخليص", "Customs clearance"],
  candidate_responses: ["مرشحون", "Candidates"],
  trip_confirmed: ["رحلة مؤكدة", "Trip confirmed"],
  completed: ["مكتمل", "Completed"],
  cancelled: ["ملغى", "Cancelled"],
  open: ["مفتوح", "Open"],
  resolved: ["مغلق", "Resolved"],
  delay: ["تأخير", "Delay"],
  container_chassis: ["شاسيه حاويات", "Container chassis"],
};

function label(lang: Lang, status: string) {
  const pair = labels[status];
  return pair ? tx(lang, pair[0], pair[1]) : status;
}

const STATUS_COLOR: Record<string, string> = {
  closed: "#168663",
  in_transit: "#32D5E7",
  delivered: "#4b2a72",
  pending: "#b57a13",
  settled: "#168663",
  ready_for_admin_review: "#b57a13",
  customs_clearance: "#7b7489",
  cancelled: "#a33b4a",
};

function ReportBoard({ lang, report, fresh }: { lang: Lang; report: Row; fresh: string }) {
  const trips = Array.isArray(report.tripsByStatus) ? (report.tripsByStatus as Row[]) : [];
  const carriers = Array.isArray(report.carrierPerformance)
    ? (report.carrierPerformance as Row[])
    : [];
  const fees = Array.isArray(report.fees) ? (report.fees as Row[]) : [];
  const live = (report.live as Row | undefined) ?? {};
  const requests = Array.isArray(live.requestsByStatus) ? (live.requestsByStatus as Row[]) : [];
  const countOf = (status: string) => text(trips.find((row) => row.status === status)?.count ?? 0);
  const pending = fees.find((row) => row.status === "pending");
  const tripTotal = trips.reduce((sum, row) => sum + Number(row.count ?? 0), 0) || 1;
  const carrierMax = Math.max(1, ...carriers.map((row) => Number(row.trips ?? 0)));
  return (
    <section className="dashboard">
      <div className="monitor-head">
        <div>
          <p className="eyebrow">{tx(lang, "لوحة المراقبة", "Monitoring")}</p>
          <h2>{tx(lang, "الأرقام الحية", "Live figures")}</h2>
        </div>
        <div className="live-pill">
          <i className="pulse" />
          {fresh}
        </div>
      </div>
      <div className="kpi-grid">
        <article className="kpi">
          <span>{tx(lang, "رحلات مغلقة", "Closed trips")}</span>
          <strong>{countOf("closed")}</strong>
          <small>status: closed</small>
        </article>
        <article className="kpi">
          <span>{tx(lang, "رحلات في الطريق", "Trips in transit")}</span>
          <strong>{countOf("in_transit")}</strong>
          <small>status: in_transit</small>
        </article>
        <article className="kpi">
          <span>{tx(lang, "رسوم مستحقة", "Pending fees")}</span>
          <strong>{text(pending?.amount ?? 0)}</strong>
          <small>SAR · count {text(pending?.count ?? 0)} · status: pending</small>
        </article>
      </div>
      <div className="stats">
        <article className="stat">
          <span>{tx(lang, "طلبات", "Requests")}</span>
          <strong>{text(live.requests ?? 0)}</strong>
        </article>
        <article className="stat">
          <span>{tx(lang, "بانتظار الإفراج", "Waiting for release")}</span>
          <strong>{text(live.waitingRelease ?? 0)}</strong>
        </article>
        <article className="stat">
          <span>{tx(lang, "بلاغات مفتوحة", "Open incidents")}</span>
          <strong>{text(live.openIncidents ?? 0)}</strong>
        </article>
        <article className="stat">
          <span>{tx(lang, "مركبات ظاهرة", "Vehicles reporting")}</span>
          <strong>{text(live.vehiclesLive ?? 0)}</strong>
          <small>{tx(lang, "آخر 15 دقيقة", "Last 15 minutes")}</small>
        </article>
      </div>
      <div className="grid2">
        <section className="card">
          <h2>{tx(lang, "الرحلات حسب الحالة", "Trips by status")}</h2>
          <div className="mix" aria-hidden="true">
            {trips.map((row) => (
              <i
                key={text(row.status)}
                style={{
                  width: `${(Number(row.count ?? 0) / tripTotal) * 100}%`,
                  background: STATUS_COLOR[text(row.status)] ?? "#2e1748",
                }}
              />
            ))}
          </div>
          <ul className="split">
            {trips.map((row) => (
              <li key={text(row.status)}>
                <span>
                  {label(lang, text(row.status))}
                  <div className="field-key">status: {text(row.status)}</div>
                </span>
                <b>{text(row.count)}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>{tx(lang, "الطلبات حسب الحالة", "Requests by status")}</h2>
          <ul className="split">
            {requests.map((row) => (
              <li key={text(row.status)}>
                <span>{label(lang, text(row.status))}</span>
                <b>{text(row.count)}</b>
              </li>
            ))}
          </ul>
          <h2>{tx(lang, "رسوم المنصة", "Platform fees")}</h2>
          <ul className="split">
            {fees.map((row) => (
              <li key={text(row.status)}>
                <span>
                  {label(lang, text(row.status))}
                  <div className="field-key">
                    status: {text(row.status)} · count: {text(row.count)}
                  </div>
                </span>
                <b>{text(row.amount)} SAR</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card">
        <h2>{tx(lang, "أداء الناقلين", "Carrier performance")}</h2>
        <ul className="split">
          {carriers.map((row) => (
            <li key={text(row.legalName)}>
              <span>
                {text(row.legalName)}
                <div className="carrier-bar">
                  <b style={{ width: `${(Number(row.trips ?? 0) / carrierMax) * 100}%` }} />
                </div>
              </span>
              <b>
                {text(row.trips)} · {row.rating == null ? "—" : text(row.rating)}
              </b>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function Queue({ lang, account }: { lang: Lang; account: Row | null }) {
  const nav = useNavigate();
  const blocked = need(account);
  const [requests, setRequests] = useState<Row[]>([]);
  const [trips, setTrips] = useState<Row[]>([]);
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [report, setReport] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const load = async () => {
    const [requestRows, tripRows, incidentRows, summary] = await Promise.all([
      api<Row[]>("/admin/requests"),
      api<Row[]>("/admin/trips"),
      api<Row[]>("/admin/incidents"),
      api<Row>("/admin/reports/summary"),
    ]);
    setRequests(requestRows);
    setTrips(tripRows);
    setIncidents(incidentRows);
    setReport(summary);
    setUpdatedAt(new Date());
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    const refresh = () =>
      load().catch((caught: Error) => {
        if (alive) setError(caught.message);
      });
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [account]);
  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt.getTime()) / 1000)) : null;
  const fresh =
    seconds == null
      ? tx(lang, "جار التحديث", "Refreshing")
      : seconds < 5
        ? tx(lang, "مباشر · الآن", "Live · just now")
        : tx(lang, `مباشر · قبل ${seconds} ث`, `Live · ${seconds}s ago`);
  if (blocked) return blocked;
  return (
    <>
      <div className="page-head">
        <h1>{tx(lang, "كل رحلة تحت نظرك", "Every journey, in view")}</h1>
        <p className="muted">
          {tx(
            lang,
            "الإفراج للناقلين يدوي. موافقة الناقل ليست تعييناً للرحلة.",
            "Release to carriers is manual. A carrier response is not a trip assignment.",
          )}
        </p>
      </div>
      {error ? <div className="err">{error}</div> : null}
      {report ? <ReportBoard lang={lang} report={report} fresh={fresh} /> : null}
      <h2>{tx(lang, "الطلبات", "Requests")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "المرجع", "Reference")}</th>
              <th>{tx(lang, "الميناء", "Port")}</th>
              <th>{tx(lang, "الحاوية", "Container")}</th>
              <th>{tx(lang, "الوجهة", "Destination")}</th>
              <th>{tx(lang, "الحالة", "Status")}</th>
              <th>{tx(lang, "الإجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((row) => (
              <tr className="clickable" key={text(row.id)} onClick={() => nav(`/requests/${text(row.id)}`)}>
                <td>{text(row.reference)}</td>
                <td>{text(row.portCode)}</td>
                <td>{text(row.containerNumber)}</td>
                <td>{text(row.destination)}</td>
                <td>{label(lang, text(row.status))}</td>
                <td>
                  {text(row.status) === "ready_for_admin_review" ? (
                    <button
                      className="cyan"
                      type="button"
                      onClick={async (event) => {
                        event.stopPropagation();
                        await api(`/requests/${text(row.id)}/release`, {
                          json: { notes: "Manual release" },
                        });
                        await load();
                      }}
                    >
                      {tx(lang, "إفراج", "Release")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{tx(lang, "الرحلات", "Trips")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "الرحلة", "Trip")}</th>
              <th>{tx(lang, "الحالة", "Status")}</th>
              <th>{tx(lang, "السعر", "Price")}</th>
              <th>{tx(lang, "الإجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((row) => (
              <tr className="clickable" key={text(row.id)} onClick={() => nav(`/trips/${text(row.id)}`)}>
                <td>{text(row.reference)}</td>
                <td>{label(lang, text(row.status))}</td>
                <td>{text(row.agreedPrice) || text(row.price)}</td>
                <td>
                  {text(row.status) === "delivered" ? (
                    <button
                      className="primary"
                      type="button"
                      onClick={async (event) => {
                        event.stopPropagation();
                        await api(`/trips/${text(row.id)}/transition`, {
                          json: { toStatus: "closed" },
                        });
                        await load();
                      }}
                    >
                      {tx(lang, "إغلاق", "Close")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{tx(lang, "البلاغات", "Incidents")}</h2>
      <div className="record-list">
        {incidents.map((row) => (
        <button className="record" key={text(row.id)} type="button" onClick={() => nav(`/incidents/${text(row.id)}`)}>
          <div>
            <strong>{text(row.incidentType)}</strong>
            <p className="muted">{text(row.description)}</p>
          </div>
          <span className="badge">{label(lang, text(row.status))}</span>
        </button>
        ))}
      </div>
      <a href="/api/v1/admin/exports/trips.csv">{tx(lang, "تصدير الرحلات", "Export trips")}</a>
    </>
  );
}

function Users({ lang, account }: { lang: Lang; account: Row | null }) {
  const nav = useNavigate();
  const blocked = need(account);
  const [rows, setRows] = useState<Row[]>([]);
  const [docs, setDocs] = useState<Row[]>([]);
  const [expiring, setExpiring] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    setRows(await api<Row[]>(`/admin/users?q=${encodeURIComponent(query)}`));
    setDocs(await api<Row[]>("/admin/documents"));
    setExpiring(await api<Row[]>("/admin/expiry"));
  };
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account, query]);
  if (blocked) return blocked;
  return (
    <>
      <h1>{tx(lang, "التحقق والحسابات", "Verification and accounts")}</h1>
      {error ? <div className="err">{error}</div> : null}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tx(lang, "بحث", "Search")}
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "الحساب", "Account")}</th>
              <th>{tx(lang, "الدور", "Role")}</th>
              <th>{tx(lang, "الحالة", "Status")}</th>
              <th>{tx(lang, "الإجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="clickable" key={text(row.id)} onClick={() => nav(`/users/${text(row.id)}`)}>
                <td>
                  {text(row.fullName)}
                  <div className="muted">{text(row.email)}</div>
                </td>
                <td>{text(row.role)}</td>
                <td>{text(row.status)}</td>
                <td>
                  <button
                    className="ghost"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      api(`/admin/users/${text(row.id)}/status`, {
                        method: "PATCH",
                        json: { status: "verified" },
                      }).then(load);
                    }}
                  >
                    {tx(lang, "موثّق", "Verified")}
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      api(`/admin/users/${text(row.id)}/status`, {
                        method: "PATCH",
                        json: { status: "active" },
                      })
                        .then(load)
                        .catch((caught: Error) => setError(caught.message));
                    }}
                  >
                    {tx(lang, "تفعيل", "Activate")}
                  </button>
                  <button
                    className="danger"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      api(`/admin/users/${text(row.id)}/status`, {
                        method: "PATCH",
                        json: { status: "suspended", reason: "Administrative suspension" },
                      }).then(load);
                    }}
                  >
                    {tx(lang, "إيقاف", "Suspend")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{tx(lang, "مستندات قاربت على الانتهاء", "Documents nearing expiry")}</h2>
      {expiring.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tx(lang, "النوع", "Type")}</th>
                <th>{tx(lang, "الانتهاء", "Expires")}</th>
                <th>{tx(lang, "الحالة", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map((row) => (
                <tr className="clickable" key={text(row.id)} onClick={() => nav(`/documents/${text(row.id)}`)}>
                  <td>{text(row.docType)}</td>
                  <td>{text(row.expiresOn)}</td>
                  <td>{text(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{tx(lang, "لا توجد مستندات خلال 30 يوماً.", "No documents expire within 30 days.")}</p>
      )}
      <h2>{tx(lang, "المستندات", "Documents")}</h2>
      <div className="record-list">
      {docs
        .filter((doc) => text(doc.status) === "pending")
        .map((doc) => (
          <article className="record" key={text(doc.id)} onClick={() => nav(`/documents/${text(doc.id)}`)}>
            <div>
              <strong>{text(doc.docType)}</strong>
              <p className="muted">{text(doc.originalFilename)}</p>
            </div>
            <span className="row">
              <button
                className="cyan"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  api(`/documents/${text(doc.id)}/review`, { json: { decision: "approved" } }).then(load);
                }}
              >
                {tx(lang, "اعتماد", "Approve")}
              </button>
              <button
                className="danger"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  api(`/documents/${text(doc.id)}/review`, {
                    json: { decision: "rejected", notes: "Rejected" },
                  }).then(load);
                }}
              >
                {tx(lang, "رفض", "Reject")}
              </button>
            </span>
          </article>
        ))}
      </div>
    </>
  );
}

function FleetBoard({ lang, account }: { lang: Lang; account: Row | null }) {
  const nav = useNavigate();
  const blocked = need(account);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    const [vehicleRows, driverRows] = await Promise.all([api<Row[]>("/vehicles"), api<Row[]>("/drivers")]);
    setVehicles(vehicleRows);
    setDrivers(driverRows);
  };
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account]);
  const setStatus = (kind: "vehicles" | "drivers", id: string, status: string) => {
    api(`/admin/${kind}/${id}/status`, { method: "PATCH", json: { status, reason: "Administrative review" } })
      .then(load)
      .catch((caught: Error) => setError(caught.message));
  };
  if (blocked) return blocked;
  return (
    <>
      <h1>{tx(lang, "المركبات والسائقون", "Vehicles and drivers")}</h1>
      <p className="muted">
        {tx(
          lang,
          "كل المركبات والسائقون المسجلون على المنصة. التفعيل يبقى بعد اكتمال المستندات.",
          "Every vehicle and driver registered on the platform. Activation still requires complete documents.",
        )}
      </p>
      {error ? <div className="err">{error}</div> : null}
      <h2>{tx(lang, "المركبات", "Vehicles")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "اللوحة", "Plate")}</th>
              <th>{tx(lang, "النوع", "Type")}</th>
              <th>{tx(lang, "التوفر", "Availability")}</th>
              <th>{tx(lang, "الحالة", "Status")}</th>
              <th>{tx(lang, "الإجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((row) => (
              <tr className="clickable" key={text(row.id)} onClick={() => nav(`/fleet/${text(row.id)}`)}>
                <td>{text(row.plateNumber)}</td>
                <td>{text(row.truckType)}</td>
                <td>{text(row.availability)}</td>
                <td>{text(row.status)}</td>
                <td>
                  <button className="primary" type="button" onClick={(event) => { event.stopPropagation(); setStatus("vehicles", text(row.id), "active"); }}>
                    {tx(lang, "تفعيل", "Activate")}
                  </button>
                  <button className="danger" type="button" onClick={(event) => { event.stopPropagation(); setStatus("vehicles", text(row.id), "suspended"); }}>
                    {tx(lang, "إيقاف", "Suspend")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{tx(lang, "السائقون", "Drivers")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "الاسم", "Name")}</th>
              <th>{tx(lang, "البريد", "Email")}</th>
              <th>{tx(lang, "الرخصة", "License")}</th>
              <th>{tx(lang, "الحالة", "Status")}</th>
              <th>{tx(lang, "الإجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((row) => (
              <tr className="clickable" key={text(row.id)} onClick={() => nav(`/fleet/${text(row.id)}`)}>
                <td>{text(row.fullName)}</td>
                <td>{text(row.email)}</td>
                <td>{text(row.licenseNumber)}</td>
                <td>{text(row.status)}</td>
                <td>
                  <button className="primary" type="button" onClick={(event) => { event.stopPropagation(); setStatus("drivers", text(row.id), "active"); }}>
                    {tx(lang, "تفعيل", "Activate")}
                  </button>
                  <button className="danger" type="button" onClick={(event) => { event.stopPropagation(); setStatus("drivers", text(row.id), "suspended"); }}>
                    {tx(lang, "إيقاف", "Suspend")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Finance({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = need(account);
  const [fees, setFees] = useState<Row[]>([]);
  const [policy, setPolicy] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setFees(await api<Row[]>("/admin/fees"));
    setPolicy(await api<Row>("/admin/fee-policy"));
  };
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account]);
  if (blocked) return blocked;
  return (
    <>
      <h1>{tx(lang, "الرسوم والتسويات الخارجية", "Fees and external settlements")}</h1>
      <p className="muted">
        {tx(
          lang,
          "لا توجد بوابة دفع أو محفظة. الفترة المجانية غير مفعّلة حتى تُعتمد سياستها.",
          "There is no payment gateway or wallet. The free period stays inactive until its policy is approved.",
        )}
      </p>
      {error ? <div className="err">{error}</div> : null}
      {policy ? (
        <p>
          {tx(lang, "الرسم الحالي", "Current fee")}: {text(policy.feeAmount)}{" "}
          {text(policy.feeCurrency)} · {tx(lang, "فترة مجانية", "Free period")}:{" "}
          {String(policy.freePeriodActive)}
        </p>
      ) : null}
      <form
        className="card"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await api("/admin/fee-policy", {
              method: "PATCH",
              json: {
                amount: Number(form.get("amount")),
                currency: "SAR",
                freePeriodActive: form.get("active") === "on",
                freePeriodStartsOn: form.get("start") || null,
                freePeriodEndsOn: form.get("end") || null,
                freePeriodEligibility: form.get("eligibility") || null,
              },
            });
            await load();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Error");
          }
        }}
      >
        <label>
          {tx(lang, "المبلغ", "Amount")}
          <input name="amount" type="number" defaultValue={50} />
        </label>
        <label>
          <span>{tx(lang, "تفعيل الفترة المجانية", "Activate free period")}</span>
          <input name="active" type="checkbox" />
        </label>
        <label>
          {tx(lang, "البداية", "Start")}
          <input name="start" type="date" />
        </label>
        <label>
          {tx(lang, "النهاية", "End")}
          <input name="end" type="date" />
        </label>
        <label>
          {tx(lang, "الأهلية", "Eligibility")}
          <select name="eligibility">
            <option value="">—</option>
            <option value="all_completed_trips">all_completed_trips</option>
            <option value="none">none</option>
          </select>
        </label>
        <button className="primary" type="submit">
          {tx(lang, "حفظ السياسة", "Save policy")}
        </button>
      </form>
      <div className="record-list">
      {fees.map((fee) => (
        <article className="record" key={text(fee.id)}>
          <Link to={`/trips/${text(fee.tripId)}`}>
            <strong>{text(fee.tripReference)}</strong>
            <p className="muted">{text(fee.amount)} {text(fee.currency)} · {when(fee.createdAt, lang)}</p>
          </Link>
          <span className="badge">{label(lang, text(fee.status))}</span>
          {text(fee.status) === "pending" ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await api(`/admin/fees/${text(fee.id)}/settlements`, {
                  json: { externalReference: form.get("ref") },
                });
                await load();
              }}
            >
              <input
                name="ref"
                required
                placeholder={tx(lang, "مرجع خارجي", "External reference")}
              />
              <button className="cyan" type="submit">
                {tx(lang, "تسجيل تسوية", "Record settlement")}
              </button>
            </form>
          ) : null}
        </article>
      ))}
      </div>
      <a href="/api/v1/admin/exports/fees.csv">{tx(lang, "تصدير الرسوم", "Export fees")}</a>{" "}
      <a href="/api/v1/admin/exports/trips.csv">{tx(lang, "تصدير الرحلات", "Export trips")}</a>
    </>
  );
}

function LiveMap({ lang, account }: { lang: Lang; account: Row | null }) {
  const tiles = useMapTiles();
  const nav = useNavigate();
  const blocked = need(account);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (account)
      api<Row[]>("/admin/map")
        .then(setRows)
        .catch(() => setRows([]));
  }, [account]);
  if (blocked) return blocked;
  return (
    <>
      <h1>{tx(lang, "آخر ظهور", "Last seen")}</h1>
      <div className="map">
        <MapContainer center={[24.2, 45.0]} zoom={5} style={{ height: "100%" }}>
          <TileLayer attribution={tiles.attribution} url={tiles.url} />
          {rows.map((row) => (
            <CircleMarker
              key={`${text(row.vehicleId)}-${text(row.recordedAt)}`}
              center={[Number(row.latitude), Number(row.longitude)]}
              radius={7}
            >
              <Popup>
                <Link to={`/fleet/${text(row.vehicleId)}`}>{text(row.plateNumber)}</Link>
                {text(row.tripId) ? <> · <Link to={`/trips/${text(row.tripId)}`}>{tx(lang, "الرحلة", "Trip")}</Link></> : null}
                <div>{when(row.recordedAt, lang)}</div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "اللوحة", "Plate")}</th>
              <th>{tx(lang, "النوع", "Type")}</th>
              <th>{tx(lang, "التوفر", "Availability")}</th>
              <th>{tx(lang, "آخر ظهور", "Last seen")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="clickable" key={`${text(row.vehicleId)}-${text(row.recordedAt)}`} onClick={() => nav(`/fleet/${text(row.vehicleId)}`)}>
                <td>{text(row.plateNumber)}</td>
                <td>{text(row.truckType)}</td>
                <td>{text(row.availability)}</td>
                <td>{when(row.recordedAt, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="facts">
      {rows
        .filter(([, value]) => value && value !== "—")
        .map(([name, value]) => (
          <div className="fact" key={name}>
            <span>{name}</span>
            <b>{value}</b>
          </div>
        ))}
    </div>
  );
}

function StatusLog({ lang, events }: { lang: Lang; events: Row[] }) {
  if (!events.length) return null;
  return (
    <section className="card">
      <h2>{tx(lang, "سجل الحالة", "Status log")}</h2>
      <ol className="timeline">
        {events.map((event) => (
          <li key={text(event.id)}>
            <strong>{label(lang, text(event.newStatus))}</strong>
            <span>{when(event.createdAt, lang)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RequestDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = () => api<Row>(`/requests/${id}`).then(setRow);
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account, id]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  const history = (row.history as Row[] | undefined) ?? [];
  const responses = (row.responses as Row[] | undefined) ?? [];
  const trip = (row.trip as Row | null) ?? null;
  return (
    <>
      <Link className="back" to="/">{tx(lang, "العودة إلى المتابعة", "Back to overview")}</Link>
      <section className="hero-card">
        <span className="badge">{label(lang, text(row.status))}</span>
        <h1>{text(row.reference)}</h1>
        <p>{text(row.portCode)} · {text(row.containerNumber)}</p>
      </section>
      {error ? <div className="err">{error}</div> : null}
      <Facts
        rows={[
          [tx(lang, "التحميل", "Loading"), text(row.loadingLocation)],
          [tx(lang, "موعد التحميل", "Loading time"), when(row.scheduledLoadingAt, lang)],
          [tx(lang, "الوجهة", "Destination"), text(row.destination)],
          [tx(lang, "الوصول المتوقع", "Expected arrival"), when(row.expectedDeliveryAt, lang)],
          [tx(lang, "نوع الحاوية", "Container type"), text(row.containerType)],
          [tx(lang, "الشاحنة", "Truck"), label(lang, text(row.truckType))],
          [tx(lang, "السعر المعتمد", "Approved price"), text(row.approvedPrice) ? `${text(row.approvedPrice)} SAR` : ""],
          [tx(lang, "التعليمات", "Instructions"), text(row.instructions)],
          [tx(lang, "ملاحظات الإفراج", "Release notes"), text(row.releaseNotes)],
        ]}
      />
      {trip ? <Link to={`/trips/${text(trip.id)}`}>{tx(lang, "فتح الرحلة", "Open the trip")} · {text(trip.reference)}</Link> : null}
      <StatusLog lang={lang} events={history} />
      {responses.length ? (
        <section className="card">
          <h2>{tx(lang, "المرشحون", "Candidates")}</h2>
          {responses.map((response) => (
            <p key={text(response.id)}>
              {text(response.legalName) || text(response.carrierOrgId)} · {text(response.status)} · {text(response.acceptedPrice)} SAR
            </p>
          ))}
        </section>
      ) : null}
      {text(row.status) === "ready_for_admin_review" ? (
        <button className="cyan" type="button" onClick={async () => {
          await api(`/requests/${id}/release`, { json: { notes: "Manual release" } });
          await load();
        }}>{tx(lang, "إفراج", "Release")}</button>
      ) : null}
    </>
  );
}

function TripDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const tiles = useMapTiles();
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [tracking, setTracking] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setRow(await api<Row>(`/trips/${id}`));
    setTracking(await api<Row>(`/trips/${id}/tracking`).catch(() => null));
  };
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account, id]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  const history = (row.history as Row[] | undefined) ?? [];
  const points = (tracking?.points as Row[] | undefined) ?? [];
  const line = [...points].reverse().map((point) => [Number(point.latitude), Number(point.longitude)] as [number, number]).filter((point) => Number.isFinite(point[0]));
  const current = (tracking?.current as Row | undefined) ?? null;
  const fee = (row.fee as Row | null) ?? null;
  const delivery = (row.delivery as Row | null) ?? null;
  return (
    <>
      <Link className="back" to="/">{tx(lang, "العودة إلى المتابعة", "Back to overview")}</Link>
      <section className="hero-card">
        <span className="badge">{label(lang, text(row.status))}</span>
        <h1>{text(row.reference)}</h1>
        <p>{text(row.requestReference)} · {text(row.agreedPrice)} SAR</p>
      </section>
      {error ? <div className="err">{error}</div> : null}
      {line.length ? (
        <div className="map">
          <MapContainer center={line[line.length - 1] ?? [24.2, 45]} zoom={7} style={{ height: "100%" }}>
            <TileLayer attribution={tiles.attribution} url={tiles.url} />
            <Polyline positions={line} pathOptions={{ color: "#32D5E7", weight: 5 }} />
            {current ? <CircleMarker center={[Number(current.latitude), Number(current.longitude)]} radius={8} /> : null}
          </MapContainer>
        </div>
      ) : <p className="muted">{tx(lang, "لا يوجد مسار بعد.", "No route has been recorded yet.")}</p>}
      <Facts
        rows={[
          [tx(lang, "الحالة", "Status"), label(lang, text(row.status))],
          [tx(lang, "السعر", "Price"), `${text(row.agreedPrice)} SAR`],
          [tx(lang, "رسم المنصة", "Platform fee"), fee ? `${text(fee.amount)} ${text(fee.currency)} · ${text(fee.status)}` : ""],
          [tx(lang, "المستلم", "Recipient"), text(delivery?.recipientName)],
          [tx(lang, "وقت التسليم", "Delivered"), delivery ? when(delivery.deliveredAt, lang) : ""],
          [tx(lang, "آخر موقع", "Last location"), current ? `${text(current.latitude)}, ${text(current.longitude)}` : ""],
          [tx(lang, "وقت الموقع", "Location time"), current ? when(current.recordedAt, lang) : ""],
          [tx(lang, "نقاط التتبع", "Tracking points"), String(points.length)],
        ]}
      />
      {text(row.requestId) ? <Link to={`/requests/${text(row.requestId)}`}>{tx(lang, "فتح الطلب", "Open the request")}</Link> : null}
      <StatusLog lang={lang} events={history} />
      {text(row.status) === "delivered" ? (
        <button className="primary" type="button" onClick={async () => {
          await api(`/trips/${id}/transition`, { json: { toStatus: "closed" } });
          await load();
        }}>{tx(lang, "إغلاق الرحلة", "Close trip")}</button>
      ) : null}
    </>
  );
}

function IncidentDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    api<Row[]>("/admin/incidents").then((rows) => {
      const found = rows.find((item) => text(item.id) === id) ?? null;
      if (!found) setError(tx(lang, "البلاغ غير موجود.", "This incident was not found."));
      setRow(found);
    });
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account, id]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  return (
    <>
      <Link className="back" to="/">{tx(lang, "العودة إلى المتابعة", "Back to overview")}</Link>
      <section className="hero-card">
        <span className="badge">{label(lang, text(row.status))}</span>
        <h1>{label(lang, text(row.incidentType))}</h1>
        <p>{when(row.createdAt, lang)}</p>
      </section>
      <section className="card stack">
        <p>{text(row.description)}</p>
        <Facts
          rows={[
            [tx(lang, "الحل", "Resolution"), text(row.resolution)],
            [tx(lang, "أُغلق في", "Resolved"), when(row.resolvedAt, lang)],
          ]}
        />
        {text(row.tripId) ? <Link to={`/trips/${text(row.tripId)}`}>{tx(lang, "فتح الرحلة", "Open the trip")}</Link> : null}
        {text(row.status) === "open" ? (
          <button className="ghost" type="button" onClick={async () => {
            await api(`/admin/incidents/${id}/resolve`, { json: { status: "resolved", resolution: "Reviewed" } });
            await load();
          }}>{tx(lang, "إغلاق البلاغ", "Resolve")}</button>
        ) : null}
      </section>
    </>
  );
}

function AuditDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!account) return;
    api<Row[]>("/admin/audit")
      .then((rows) => {
        const found = rows.find((item) => text(item.id) === id) ?? null;
        if (!found) setError(tx(lang, "السجل غير موجود.", "This log entry was not found."));
        setRow(found);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [account, id, lang]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  const metadata = row.metadata && typeof row.metadata === "object" ? JSON.stringify(row.metadata, null, 2) : text(row.metadata);
  return (
    <>
      <Link className="back" to="/audit">{tx(lang, "العودة إلى السجل", "Back to the log")}</Link>
      <section className="hero-card">
        <span className="badge">{text(row.entityType)}</span>
        <h1>{text(row.action)}</h1>
        <p>{when(row.createdAt, lang)}</p>
      </section>
      <Facts
        rows={[
          [tx(lang, "الكيان", "Entity"), text(row.entityId)],
          [tx(lang, "المنفّذ", "Actor"), text(row.actorUserId)],
          [tx(lang, "العنوان", "Address"), text(row.ip)],
        ]}
      />
      {metadata ? <pre className="meta">{metadata}</pre> : null}
      {text(row.entityType) === "account" && text(row.entityId) ? <Link to={`/users/${text(row.entityId)}`}>{tx(lang, "فتح الحساب", "Open the account")}</Link> : null}
      {text(row.entityType) === "trip" && text(row.entityId) ? <Link to={`/trips/${text(row.entityId)}`}>{tx(lang, "فتح الرحلة", "Open the trip")}</Link> : null}
      {text(row.entityType) === "request" && text(row.entityId) ? <Link to={`/requests/${text(row.entityId)}`}>{tx(lang, "فتح الطلب", "Open the request")}</Link> : null}
    </>
  );
}

function UserDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!account) return;
    api<Row[]>("/admin/users?q=")
      .then((rows) => setRow(rows.find((item) => text(item.id) === id) ?? null))
      .catch((caught: Error) => setError(caught.message));
  }, [account, id]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  const permissions = Array.isArray(row.adminPermissions) ? (row.adminPermissions as string[]).join(", ") : "";
  return (
    <>
      <Link className="back" to="/users">{tx(lang, "العودة إلى الحسابات", "Back to accounts")}</Link>
      <section className="hero-card">
        <span className="badge">{text(row.status)}</span>
        <h1>{text(row.fullName)}</h1>
        <p>{text(row.email)}</p>
      </section>
      <Facts
        rows={[
          [tx(lang, "الدور", "Role"), text(row.role)],
          [tx(lang, "الجوال", "Phone"), text(row.phone)],
          [tx(lang, "الصلاحيات", "Permissions"), permissions],
          [tx(lang, "أُنشئ", "Created"), when(row.createdAt, lang)],
        ]}
      />
    </>
  );
}

function FleetDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [kind, setKind] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!account) return;
    Promise.all([api<Row[]>("/vehicles"), api<Row[]>("/drivers")])
      .then(([vehicles, drivers]) => {
        const vehicle = vehicles.find((item) => text(item.id) === id);
        const driver = drivers.find((item) => text(item.id) === id);
        setKind(vehicle ? "vehicle" : "driver");
        setRow(vehicle ?? driver ?? null);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [account, id]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  return (
    <>
      <Link className="back" to="/fleet">{tx(lang, "العودة إلى الأسطول", "Back to the fleet")}</Link>
      <section className="hero-card">
        <span className="badge">{text(row.status)}</span>
        <h1>{kind === "vehicle" ? text(row.plateNumber) : text(row.fullName)}</h1>
        <p>{kind === "vehicle" ? text(row.truckType) : text(row.email)}</p>
      </section>
      <Facts
        rows={kind === "vehicle"
          ? [
              [tx(lang, "التوفر", "Availability"), text(row.availability)],
              [tx(lang, "التأمين", "Insurance"), text(row.insuranceExpiry)],
              [tx(lang, "الفحص", "Inspection"), text(row.inspectionExpiry)],
            ]
          : [
              [tx(lang, "الرخصة", "License"), text(row.licenseNumber)],
              [tx(lang, "انتهاء الرخصة", "License expiry"), text(row.licenseExpiry)],
              [tx(lang, "التوفر", "Availability"), text(row.availability)],
              [tx(lang, "الجوال", "Phone"), text(row.phone)],
            ]}
      />
    </>
  );
}

function DocumentDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = need(account);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    api<Row[]>("/admin/documents").then((rows) => {
      const found = rows.find((item) => text(item.id) === id) ?? null;
      if (!found) setError(tx(lang, "المستند غير موجود.", "This document was not found."));
      setRow(found);
    });
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account, id]);
  if (blocked) return blocked;
  if (!row) return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  return (
    <>
      <Link className="back" to="/users">{tx(lang, "العودة إلى التحقق", "Back to verification")}</Link>
      <section className="hero-card">
        <span className="badge">{text(row.status)}</span>
        <h1>{text(row.docType)}</h1>
        <p>{text(row.originalFilename)}</p>
      </section>
      {error ? <div className="err">{error}</div> : null}
      <Facts
        rows={[
          [tx(lang, "رُفع", "Uploaded"), when(row.createdAt, lang)],
          [tx(lang, "ينتهي", "Expires"), text(row.expiresOn)],
          [tx(lang, "المركبة", "Vehicle"), text(row.vehicleId)],
          [tx(lang, "السائق", "Driver"), text(row.driverId)],
        ]}
      />
      <div className="row">
        <a href={`/api/v1/documents/${id}/download`}>{tx(lang, "عرض الملف", "Open the file")}</a>
        {text(row.status) === "pending" ? (
          <>
            <button className="cyan" type="button" onClick={async () => {
              await api(`/documents/${id}/review`, { json: { decision: "approved" } });
              await load();
            }}>{tx(lang, "اعتماد", "Approve")}</button>
            <button className="danger" type="button" onClick={async () => {
              await api(`/documents/${id}/review`, { json: { decision: "rejected", notes: "Rejected" } });
              await load();
            }}>{tx(lang, "رفض", "Reject")}</button>
          </>
        ) : null}
      </div>
    </>
  );
}

function Integrations({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = need(account);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const load = () => api<Row[]>("/admin/integrations").then(setRows);
  useEffect(() => {
    if (account) void load().catch((caught: Error) => setError(caught.message));
  }, [account]);
  if (blocked) return blocked;
  const categories = ["maps", "messaging", "email", "storage", "operations", "other"];
  return (
    <>
      <div className="page-head">
        <h1>{tx(lang, "بيانات التكامل", "Integration data")}</h1>
        <p className="muted">
          {tx(
            lang,
            "إدارة عناوين الربط والمفاتيح للمنصات المتصلة. المفاتيح المحفوظة لا تُعرض كاملة.",
            "Manage connection details and keys for connected platforms. Saved keys are never shown in full.",
          )}
        </p>
      </div>
      {error ? <div className="err">{error}</div> : null}
      {saved ? <div className="badge ok">{saved}</div> : null}
      <div className="platform-grid">
        {rows.map((row) => {
          const fields = Array.isArray(row.fields) ? (row.fields as Row[]) : [];
          return (
            <form
              className="card platform"
              key={`${text(row.code)}-${text(row.updatedAt)}`}
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const publicConfig: Record<string, string | number | boolean> = {};
                const secrets: Record<string, string> = {};
                for (const field of fields) {
                  const key = text(field.key);
                  if (text(field.kind) === "boolean") {
                    publicConfig[key] = form.get(key) === "on";
                    continue;
                  }
                  const value = text(form.get(key));
                  if (field.secret) {
                    if (value) secrets[key] = value;
                  } else if (text(field.kind) === "number") {
                    if (value) publicConfig[key] = Number(value);
                  } else if (value) publicConfig[key] = value;
                }
                try {
                  await api(`/admin/integrations/${text(row.code)}`, {
                    method: "PATCH",
                    json: {
                      enabled: form.get("enabled") === "on",
                      endpoint: text(form.get("endpoint")) || null,
                      notes: text(form.get("notes")) || null,
                      nameEn: text(form.get("nameEn")) || undefined,
                      nameAr: text(form.get("nameAr")) || undefined,
                      category: text(form.get("category")) || undefined,
                      publicConfig,
                      secrets,
                    },
                  });
                  setSaved(tx(lang, "تم حفظ بيانات الربط.", "Connection details saved."));
                  setError("");
                  await load();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Error");
                }
              }}
            >
              <div className="platform-top">
                <div>
                  <span className="eyebrow">{text(row.category)}</span>
                  <h2>{lang === "ar" ? text(row.nameAr) : text(row.nameEn)}</h2>
                </div>
                <span className={`badge ${text(row.status) === "ready" ? "ok" : text(row.status) === "disabled" ? "" : "warn"}`}>
                  {text(row.status) === "ready"
                    ? tx(lang, "جاهز", "Ready")
                    : text(row.status) === "disabled"
                      ? tx(lang, "متوقف", "Disabled")
                      : tx(lang, "ناقص", "Incomplete")}
                </span>
              </div>
              <label className="check">
                <input name="enabled" type="checkbox" defaultChecked={Boolean(row.enabled)} />
                <span>{tx(lang, "تفعيل هذا الربط", "Enable this connection")}</span>
              </label>
              {row.builtin ? null : (
                <>
                  <label>
                    {tx(lang, "الاسم", "Name")}
                    <input name="nameEn" defaultValue={text(row.nameEn)} required />
                  </label>
                  <label>
                    {tx(lang, "الاسم بالعربية", "Arabic name")}
                    <input name="nameAr" defaultValue={text(row.nameAr)} required />
                  </label>
                  <label>
                    {tx(lang, "التصنيف", "Category")}
                    <select name="category" defaultValue={text(row.category)}>
                      {categories.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tx(lang, "عنوان الربط", "Endpoint")}
                    <input name="endpoint" defaultValue={text(row.endpoint)} placeholder="https://" />
                  </label>
                </>
              )}
              {fields.map((field) => (
                <label key={text(field.key)}>
                  {lang === "ar" ? text(field.labelAr) : text(field.labelEn)}
                  {text(field.kind) === "boolean" ? (
                    <input name={text(field.key)} type="checkbox" defaultChecked={text(field.value) === "true"} />
                  ) : (
                    <input
                      name={text(field.key)}
                      type={field.secret ? "password" : text(field.kind) === "number" ? "number" : "text"}
                      defaultValue={field.secret ? "" : text(field.value)}
                      placeholder={field.secret && field.configured ? text(field.hint) : ""}
                      autoComplete="off"
                    />
                  )}
                  {text(field.origin) === "environment" ? (
                    <span className="field-key">{tx(lang, "القيمة الحالية من إعداد الخادم", "Current value comes from the server environment")}</span>
                  ) : null}
                  {field.secret && field.configured ? (
                    <span className="field-key">{tx(lang, "اتركه فارغاً للإبقاء على المفتاح الحالي", "Leave blank to keep the current key")} · {text(field.hint)}</span>
                  ) : null}
                </label>
              ))}
              <label>
                {tx(lang, "ملاحظات", "Notes")}
                <textarea name="notes" defaultValue={text(row.notes)} />
              </label>
              <div className="row">
                <button className="primary" type="submit">{tx(lang, "حفظ", "Save")}</button>
                {row.builtin ? null : (
                  <button
                    className="danger"
                    type="button"
                    onClick={async () => {
                      await api(`/admin/integrations/${text(row.code)}`, { method: "DELETE" });
                      await load();
                    }}
                  >
                    {tx(lang, "حذف", "Remove")}
                  </button>
                )}
              </div>
            </form>
          );
        })}
      </div>
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await api("/admin/integrations", {
              json: {
                nameEn: form.get("nameEn"),
                nameAr: form.get("nameAr"),
                category: form.get("category"),
                endpoint: text(form.get("endpoint")) || null,
                notes: text(form.get("notes")) || null,
                enabled: form.get("enabled") === "on",
                publicConfig: text(form.get("clientId")) ? { clientId: text(form.get("clientId")) } : {},
                secrets: text(form.get("apiKey")) ? { apiKey: text(form.get("apiKey")) } : {},
              },
            });
            event.currentTarget.reset();
            setSaved(tx(lang, "أُضيفت المنصة.", "Platform added."));
            setError("");
            await load();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Error");
          }
        }}
      >
        <h2>{tx(lang, "إضافة منصة", "Add a platform")}</h2>
        <div className="grid2">
          <label>
            {tx(lang, "الاسم", "Name")}
            <input name="nameEn" required />
          </label>
          <label>
            {tx(lang, "الاسم بالعربية", "Arabic name")}
            <input name="nameAr" required />
          </label>
          <label>
            {tx(lang, "التصنيف", "Category")}
            <select name="category" defaultValue="other">
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            {tx(lang, "عنوان الربط", "Endpoint")}
            <input name="endpoint" placeholder="https://" />
          </label>
          <label>
            {tx(lang, "معرف العميل", "Client id")}
            <input name="clientId" autoComplete="off" />
          </label>
          <label>
            {tx(lang, "مفتاح الربط", "API key")}
            <input name="apiKey" type="password" autoComplete="off" />
          </label>
        </div>
        <label>
          {tx(lang, "ملاحظات", "Notes")}
          <textarea name="notes" />
        </label>
        <label className="check">
          <input name="enabled" type="checkbox" defaultChecked />
          <span>{tx(lang, "تفعيل", "Enabled")}</span>
        </label>
        <button className="cyan" type="submit">{tx(lang, "إضافة", "Add platform")}</button>
      </form>
    </>
  );
}

function Audit({ lang, account }: { lang: Lang; account: Row | null }) {
  const nav = useNavigate();
  const blocked = need(account);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (account)
      api<Row[]>("/admin/audit")
        .then(setRows)
        .catch((caught: Error) => setError(caught.message));
  }, [account]);
  if (blocked) return blocked;
  return (
    <>
      <h1>{tx(lang, "سجل التدقيق", "Audit log")}</h1>
      {error ? <div className="err">{error}</div> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "الوقت", "When")}</th>
              <th>{tx(lang, "الإجراء", "Action")}</th>
              <th>{tx(lang, "النوع", "Type")}</th>
              <th>{tx(lang, "المرجع", "Record")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="clickable" key={text(row.id)} onClick={() => nav(`/audit/${text(row.id)}`)}>
                <td>{when(row.createdAt, lang)}</td>
                <td>{text(row.action)}</td>
                <td>{text(row.entityType)}</td>
                <td>{text(row.entityId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
