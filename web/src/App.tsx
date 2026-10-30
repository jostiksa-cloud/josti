import { type ReactNode, useEffect, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiError, api, type Row, text } from "./api";

type Lang = "ar" | "en";
const tx = (lang: Lang, ar: string, en: string) => (lang === "ar" ? ar : en);
const statusNames: Record<string, [string, string]> = {
  closed: ["مغلقة", "Closed"],
  in_transit: ["في الطريق", "In transit"],
  delivered: ["تم التسليم", "Delivered"],
  loaded: ["تم التحميل", "Loaded"],
  trip_started: ["بدأت الرحلة", "Trip started"],
  arrived_at_port: ["وصلت الميناء", "Arrived at port"],
  arrived_at_destination: ["وصلت الوجهة", "Arrived"],
  en_route_to_port: ["إلى الميناء", "En route to port"],
  ready_for_admin_review: ["بانتظار الإفراج", "Ready for release"],
  customs_clearance: ["قيد التخليص", "Customs clearance"],
  candidate_responses: ["مرشحون", "Candidates"],
  trip_confirmed: ["رحلة مؤكدة", "Trip confirmed"],
  completed: ["مكتمل", "Completed"],
  cancelled: ["ملغى", "Cancelled"],
  released: ["مُفرج", "Released"],
  draft: ["مسودة", "Draft"],
  trip_status: ["تحديث الرحلة", "Trip update"],
  document_review: ["مراجعة مستند", "Document review"],
  request_created: ["طلب جديد", "New request"],
  request_released: ["إفراج للناقلين", "Released to carriers"],
  ready_for_release: ["جاهز للإفراج", "Ready for release"],
  candidate_accepted: ["ترشيح مقبول", "Candidate accepted"],
  skipped_no_token: ["لا يوجد جهاز", "No device registered"],
  container_chassis: ["شاسيه حاويات", "Container chassis"],
};
function statusName(lang: Lang, status: string) {
  const pair = statusNames[status];
  return pair ? tx(lang, pair[0], pair[1]) : status.replaceAll("_", " ");
}
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
const DEMO_PASSWORD = "Password123";

const demoAccounts = [
  {
    role: "merchant",
    email: "merchant@josti.test",
    ar: "تاجر",
    en: "Merchant",
    whoAr: "ليلى الحربي",
    whoEn: "Layla Al-Harbi",
    orgAr: "تجارة الخليج للتجزئة",
    orgEn: "Gulf Retail Trading",
  },
  {
    role: "customs_broker",
    email: "broker@josti.test",
    ar: "مخلص جمركي",
    en: "Customs broker",
    whoAr: "عمر الزهراني",
    whoEn: "Omar Al-Zahrani",
    orgAr: "مكتب البحر الأحمر للتخليص",
    orgEn: "Red Sea Customs Office",
  },
  {
    role: "carrier",
    email: "carrier@josti.test",
    ar: "ناقل",
    en: "Carrier",
    whoAr: "ناصر العتيبي",
    whoEn: "Nasser Al-Otaibi",
    orgAr: "شركة نجد للنقل",
    orgEn: "Najd Transport",
  },
  {
    role: "driver",
    email: "driver@josti.test",
    ar: "سائق",
    en: "Driver",
    whoAr: "فهد الحربي",
    whoEn: "Fahad Al-Harbi",
    orgAr: "شركة نجد للنقل",
    orgEn: "Najd Transport",
  },
] as const;

export function App() {
  const location = useLocation();
  const [lang, setLang] = useState<Lang>((localStorage.getItem("josti-lang") as Lang) || "ar");
  const [dark, setDark] = useState(localStorage.getItem("josti-theme") === "dark");
  const [account, setAccount] = useState<Row | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("ltr", lang === "en");
    localStorage.setItem("josti-lang", lang);
  }, [lang]);
  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("josti-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    api<Row>("/auth/me")
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setReady(true));
  }, []);
  if (!ready) return <p className="main">{tx(lang, "جار التحميل…", "Loading…")}</p>;
  const authRoute = location.pathname === "/login" || location.pathname === "/register";
  if (authRoute) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<Login lang={lang} setLang={setLang} dark={dark} setDark={setDark} onAuth={setAccount} />}
        />
        <Route
          path="/register"
          element={<Register lang={lang} setLang={setLang} dark={dark} setDark={setDark} onAuth={setAccount} />}
        />
      </Routes>
    );
  }
  return (
    <Shell
      lang={lang}
      setLang={setLang}
      dark={dark}
      setDark={setDark}
      account={account}
      setAccount={setAccount}
    >
      <Routes>
        <Route
          path="/"
          element={account ? <Dashboard lang={lang} account={account} /> : <Home lang={lang} />}
        />
        <Route path="/map" element={<Home lang={lang} account={account} />} />
        <Route path="/requests" element={<Requests lang={lang} account={account} />} />
        <Route path="/requests/new" element={<NewRequest lang={lang} account={account} />} />
        <Route path="/requests/:id" element={<RequestDetail lang={lang} account={account} />} />
        <Route path="/fleet" element={<Fleet lang={lang} account={account} />} />
        <Route path="/trips" element={<Trips lang={lang} account={account} />} />
        <Route path="/trips/:id" element={<TripDetail lang={lang} account={account} />} />
        <Route path="/documents" element={<Documents lang={lang} account={account} />} />
        <Route path="/notifications" element={<Notifications lang={lang} account={account} />} />
        <Route path="/notifications/:id" element={<NotificationDetail lang={lang} account={account} />} />
        <Route
          path="/profile"
          element={<Profile lang={lang} account={account} setAccount={setAccount} />}
        />
      </Routes>
    </Shell>
  );
}

function AuthFrame({
  lang,
  setLang,
  dark,
  setDark,
  children,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  dark: boolean;
  setDark: (value: boolean | ((value: boolean) => boolean)) => void;
  children: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <section className="auth-brand">
        <div>
          <img className="logo" src="/brand/JOSTI_Arabic_Tagline_Reverse.svg" alt="JOSTI" />
          {lang === "en" ? <p className="brandline">We know the way</p> : null}
        </div>
        <div className="auth-copy">
          <span className="auth-kicker">JOSTI</span>
          <h1>{tx(lang, "ثقة تربط الميناء بالمستودع", "Trust connects port to warehouse")}</h1>
          <p>
            {tx(
              lang,
              "منصة واحدة للتاجر والمخلص الجمركي والناقل والسائق. جوستي ينسّق الرحلة ولا يملك أسطولاً.",
              "One platform for the merchant, customs broker, carrier, and driver. JOSTI coordinates the journey and does not own a fleet.",
            )}
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-tools">
          <button className="auth-tool" type="button" onClick={() => setDark((value) => !value)}>
            {dark ? tx(lang, "الوضع الفاتح", "Light mode") : tx(lang, "الوضع الداكن", "Dark mode")}
          </button>
          <button
            className="auth-tool"
            type="button"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </div>
        {children}
      </section>
    </div>
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
  setLang: (lang: Lang) => void;
  dark: boolean;
  setDark: (value: boolean | ((value: boolean) => boolean)) => void;
  account: Row | null;
  setAccount: (row: Row | null) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const role = text(account?.role);
  const items = menuFor(lang, role);
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
        <div className="brand">
          <img className="logo" src="/brand/JOSTI_Arabic_Tagline_Reverse.svg" alt="JOSTI" />
        </div>
        <div className="brandline">{tx(lang, "نعرف الطريق", "We know the way")}</div>
        <div className="navlabel">{tx(lang, "مساحة العمل", "WORKSPACE")}</div>
        <nav>
          {items.map(([path, label]) => (
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
        <div className="side-bottom">
          <div className="sidecard">
            <span className="pill blue">
              <i className="dot" />
              {tx(lang, "شبكة نقل موثوقة", "A trusted transport network")}
            </span>
            <p>
              {tx(
                lang,
                "من الميناء إلى المستودع، كل خطوة في مكان واحد.",
                "From port to warehouse. Every step in one place.",
              )}
            </p>
            {!account ? (
              <Link to="/register" onClick={() => setOpen(false)}>
                <button className="cyan sm" type="button" style={{ width: "100%" }}>
                  {tx(lang, "انضم إلى جوستي", "Join JOSTI")}
                </button>
              </Link>
            ) : (
              <Link to="/notifications" onClick={() => setOpen(false)}>
                <button className="cyan sm" type="button" style={{ width: "100%" }}>
                  {tx(lang, "التنبيهات", "Alerts")}
                </button>
              </Link>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="top">
          <button className="ghost menu" type="button" onClick={() => setOpen((value) => !value)}>
            {tx(lang, "القائمة", "Menu")}
          </button>
          <strong>{text(account?.fullName) || "JOSTI"}</strong>
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
            ) : (
              <Link to="/login">
                <button className="primary" type="button">
                  {tx(lang, "دخول", "Log in")}
                </button>
              </Link>
            )}
          </div>
        </div>
        {account && text(account.status) !== "active" ? (
          <div className="err">
            {tx(
              lang,
              "الحساب ليس نشطًا بعد. يمكن رفع المستندات، والعمليات مقيدة حتى التفعيل.",
              "This account is not active yet. Documents can be uploaded, but operations stay restricted until activation.",
            )}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

function menuFor(lang: Lang, role: string): [string, string][] {
  const dashboard: [string, string] = ["/", tx(lang, "لوحتي", "My dashboard")];
  const requests: [string, string] = ["/requests", tx(lang, "طلباتي", "My requests")];
  const trips: [string, string] = ["/trips", tx(lang, "رحلاتي", "My trips")];
  const fleet: [string, string] = ["/fleet", tx(lang, "أسطولي", "My fleet")];
  const map: [string, string] = ["/map", tx(lang, "الخريطة", "Port map")];
  const documents: [string, string] = ["/documents", tx(lang, "مستنداتي", "My documents")];
  const alerts: [string, string] = ["/notifications", tx(lang, "تنبيهاتي", "My alerts")];
  const account: [string, string] = ["/profile", tx(lang, "حسابي", "My account")];
  if (!role) return [map, account];
  if (role === "driver") return [dashboard, trips, documents, alerts, account];
  if (role === "carrier")
    return [dashboard, map, ["/requests", tx(lang, "الترشيح", "Candidacy")], trips, fleet, documents, alerts, account];
  if (role === "customs_broker") return [dashboard, map, requests, trips, documents, alerts, account];
  if (role === "merchant") return [dashboard, map, requests, trips, documents, alerts, account];
  return [dashboard, account];
}

function Dashboard({ lang, account }: { lang: Lang; account: Row }) {
  const role = text(account.role);
  const [requests, setRequests] = useState<Row[]>([]);
  const [trips, setTrips] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (role !== "driver")
      api<Row[]>("/requests")
        .then(setRequests)
        .catch((caught: ApiError) => setError(caught.message));
    if (role === "carrier")
      api<Row[]>("/requests/available")
        .then(setOpen)
        .catch(() => setOpen([]));
    api<Row[]>("/trips")
      .then(setTrips)
      .catch(() => setTrips([]));
  }, [role]);
  const intro: Record<string, string> = {
    merchant: tx(
      lang,
      "هذه لوحة التاجر. الطلبات والرحلات المعروضة تخص منظمتك فقط.",
      "This is the merchant dashboard. Requests and trips belong only to your organization.",
    ),
    customs_broker: tx(
      lang,
      "هذه لوحة المخلص. تظهر الطلبات التي عُيّنت لمكتبك فقط.",
      "This is the broker dashboard. Only requests assigned to your office are shown.",
    ),
    carrier: tx(
      lang,
      "هذه لوحة الناقل. الترشيحات المفتوحة والرحلات المعينة لشركتك فقط.",
      "This is the carrier dashboard. Only open candidacies and trips assigned to your company are shown.",
    ),
    driver: tx(
      lang,
      "هذه لوحة السائق. تظهر الرحلات المعينة لك فقط.",
      "This is the driver dashboard. Only trips assigned to you are shown.",
    ),
  };
  const recent = role === "driver" || role === "carrier" ? trips : requests;
  const activeTrips = trips.filter((row) => !["delivered", "closed"].includes(text(row.status))).length;
  const doneTrips = trips.filter((row) => ["delivered", "closed"].includes(text(row.status))).length;
  return (
    <>
      <div className="breadcrumb">JOSTI / {tx(lang, "لوحة العمل", "Workspace")}</div>
      <div className="page-title">
        <div>
          <h1>{tx(lang, "كل رحلة تحت نظرك", "Every journey, in view")}</h1>
          <p>{intro[role] ?? intro.merchant}</p>
        </div>
        {role === "merchant" ? (
          <Link to="/requests/new">
            <button className="cyan" type="button">
              {tx(lang, "طلب نقل جديد", "New transport request")}
            </button>
          </Link>
        ) : (
          <Link to={role === "driver" ? "/trips" : "/requests"}>
            <button className="outline" type="button">
              {role === "driver"
                ? tx(lang, "عرض الرحلات", "View trips")
                : tx(lang, "عرض الطلبات", "View requests")}
            </button>
          </Link>
        )}
      </div>
      {error ? <div className="err">{error}</div> : null}
      <section className="hero">
        <div>
          <span className="eyebrow">{tx(lang, "مرحباً بك في جوستي", "WELCOME TO JOSTI")}</span>
          <h1>
            {role === "driver"
              ? tx(lang, "رحلتك واضحة من البداية", "Your next step is clear")
              : tx(lang, "ثقة تربط الميناء بالمستودع", "Trust connects port to warehouse")}
          </h1>
          <p>
            {tx(
              lang,
              "طلبات منظمة، ناقلون موثقون، وتتبع يبقيك على اطلاع حتى التسليم.",
              "Organized requests, verified carriers, and visibility through delivery.",
            )}
          </p>
        </div>
        <div className="heroaside">
          <b>{text(account.fullName).split(" ")[0] || "JOSTI"}</b>
          <span>{statusName(lang, text(account.status))}</span>
        </div>
      </section>
      <div className="stats">
        {role !== "driver" ? (
          <div className="stat">
            <span className="label">
              {role === "carrier"
                ? tx(lang, "ترشيحاتي", "My candidacies")
                : tx(lang, "طلباتي", "My requests")}
            </span>
            <span className="value">{requests.length}</span>
          </div>
        ) : null}
        {role === "carrier" ? (
          <div className="stat">
            <span className="label">{tx(lang, "متاح للترشيح", "Open to respond")}</span>
            <span className="value">{open.length}</span>
          </div>
        ) : null}
        <div className="stat">
          <span className="label">{tx(lang, "رحلات نشطة", "Active trips")}</span>
          <span className="value">{activeTrips}</span>
        </div>
        <div className="stat">
          <span className="label">{tx(lang, "مكتملة", "Completed")}</span>
          <span className="value">{doneTrips}</span>
        </div>
        <div className="stat">
          <span className="label">{tx(lang, "إجمالي الرحلات", "All trips")}</span>
          <span className="value">{trips.length}</span>
        </div>
      </div>
      <h2>{tx(lang, "الأحدث", "Latest")}</h2>
      {recent.length ? (
        <div className="record-list">
          {recent.slice(0, 5).map((row) => (
            <Link
              className="record"
              key={text(row.id)}
              to={role === "driver" || row.driverId ? `/trips/${text(row.id)}` : `/requests/${text(row.id)}`}
            >
              <div>
                <strong>{text(row.reference) || text(row.containerNumber)}</strong>
                <p className="muted">{text(row.destination) || text(row.portCode)}</p>
              </div>
              <span className="badge">{statusName(lang, text(row.status))}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">{tx(lang, "لا توجد سجلات مرتبطة بهذا الحساب.", "No records are linked to this account.")}</p>
      )}
    </>
  );
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
        if (text(row.tileUrl))
          setTiles({ url: text(row.tileUrl), attribution: text(row.attribution) || DEFAULT_TILES.attribution });
      })
      .catch(() => undefined);
  }, []);
  return tiles;
}

function Home({ lang, account }: { lang: Lang; account: Row | null }) {
  const tiles = useMapTiles();
  const [port, setPort] = useState("JED");
  const [ports, setPorts] = useState<Row[]>([]);
  const [trucks, setTrucks] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const guest = !account;
  useEffect(() => {
    api<Row[]>("/public/ports")
      .then(setPorts)
      .catch((error: ApiError) => setError(error.message));
  }, []);
  useEffect(() => {
    api<Row[]>(`/public/map?port=${port}`)
      .then(setTrucks)
      .catch((error: ApiError) => setError(error.message));
  }, [port]);
  const center = ports.find((item) => item.code === port) ?? { latitude: 21.49, longitude: 39.19 };
  const visible = trucks.filter(
    (truck) => filter === "all" || text(truck.availability) === filter,
  );
  return (
    <>
      <div className="breadcrumb">JOSTI / {tx(lang, "الخريطة", "Map")}</div>
      <div className="page-title">
        <div>
          <h1>{tx(lang, "خريطة حركة النقل", "Transport activity map")}</h1>
          <p>
            {tx(
              lang,
              "استكشف الشاحنات حول الموانئ. المواقع تقريبية ولا تعرض أرقام الجوال.",
              "Explore trucks around the ports. Locations are approximate and phone numbers stay hidden.",
            )}
          </p>
        </div>
        {guest ? (
          <Link to="/register">
            <button className="cyan" type="button">
              {tx(lang, "انضم إلى جوستي", "Join JOSTI")}
            </button>
          </Link>
        ) : text(account?.role) === "merchant" ? (
          <Link to="/requests/new">
            <button className="cyan" type="button">
              {tx(lang, "طلب نقل", "Request transport")}
            </button>
          </Link>
        ) : null}
      </div>
      {guest ? (
      <section className="hero" style={{ marginBottom: 4 }}>
        <div>
          <span className="eyebrow">JOSTI · {tx(lang, "جوستي", "TRUSTED CONNECTION")}</span>
          <h1>
            {tx(
              lang,
              "نعرف الطريق. ونربطك بمن يعرفه.",
              "We know the way. Connect with those who do.",
            )}
          </h1>
          <p>
            {tx(
              lang,
              "منصة سعودية تجمع التاجر والمخلص والناقل في رحلة واضحة، موثقة، وقابلة للتتبع.",
              "A Saudi platform connecting merchants, brokers and carriers in a verified, visible journey.",
            )}
          </p>
          <div className="row wrap" style={{ marginTop: 14 }}>
            <Link to="/register">
              <button className="cyan" type="button">
                {tx(lang, "إنشاء حساب", "Create account")}
              </button>
            </Link>
            <Link to="/login">
              <button className="outline" type="button" style={{ color: "white", borderColor: "#ffffff55" }}>
                {tx(lang, "تسجيل الدخول", "Sign in")}
              </button>
            </Link>
          </div>
        </div>
        <div className="heroaside">
          <b>4</b>
          <span>{tx(lang, "موانئ مدعومة", "Supported ports")}</span>
          <p className="muted" style={{ color: "#d7c6ea" }}>
            {tx(lang, "جدة · رابغ · ينبع · الدمام", "Jeddah · Rabigh · Yanbu · Dammam")}
          </p>
        </div>
      </section>
      ) : null}
      {error ? <div className="err">{error}</div> : null}
      <div className="row wrap">
        {ports.map((item) => (
          <button
            key={text(item.code)}
            className={item.code === port ? "chip active" : "chip"}
            type="button"
            onClick={() => setPort(text(item.code))}
          >
            {lang === "ar" ? text(item.nameAr) : text(item.nameEn)}
          </button>
        ))}
      </div>
      <div className="row wrap">
        {(
          [
            ["all", "الكل", "All"],
            ["available", "متاحة", "Available"],
            ["waiting", "بانتظار", "Waiting"],
            ["on_trip", "في رحلة", "On trip"],
          ] as const
        ).map(([key, ar, en]) => (
          <button
            key={key}
            className={filter === key ? "chip active" : "chip"}
            type="button"
            onClick={() => setFilter(key)}
          >
            {tx(lang, ar, en)}
          </button>
        ))}
      </div>
      <div className="map">
        <MapContainer
          key={port}
          center={[Number(center.latitude), Number(center.longitude)]}
          zoom={8}
          style={{ height: "100%" }}
        >
          <TileLayer attribution={tiles.attribution} url={tiles.url} />
          {visible.map((truck) => (
            <CircleMarker
              key={text(truck.vehicleId)}
              center={[Number(truck.latitude), Number(truck.longitude)]}
              radius={8}
              pathOptions={{ color: "#2e1748" }}
            >
              <Popup>
                <strong>{text(truck.carrierName)}</strong>
                <div>
                  {text(truck.truckType)} · {text(truck.availability)}
                </div>
                <div>
                  {tx(lang, "يبعد", "Distance")} {text(truck.distanceKm)} km
                </div>
                <div>
                  {truck.stale
                    ? tx(lang, "موقع غير محدث", "Stale location")
                    : tx(lang, "موقع حديث", "Fresh location")}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="notice">
        {tx(
          lang,
          "الخريطة التشغيلية تستخدم مواقع تقريبية للموانئ. لا تُعرض بيانات GPS المحاكاة كإحداثيات دقيقة.",
          "The operational map uses approximate port positions. Simulated GPS is never shown as precise coordinates.",
        )}
      </p>
      {visible.length === 0 ? (
        <div className="empty">
          {tx(
            lang,
            "لا توجد شاحنات ظاهرة حول هذا الميناء.",
            "No trucks are currently shown around this port.",
          )}
        </div>
      ) : null}
    </>
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
  setLang: (lang: Lang) => void;
  dark: boolean;
  setDark: (value: boolean | ((value: boolean) => boolean)) => void;
  onAuth: (row: Row) => void;
}) {
  const nav = useNavigate();
  const [role, setRole] = useState<(typeof demoAccounts)[number]["role"]>("merchant");
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const selected = demoAccounts.find((account) => account.role === role) ?? demoAccounts[0];
  return (
    <AuthFrame lang={lang} setLang={setLang} dark={dark} setDark={setDark}>
      <form
        className="auth-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await api("/auth/login", { json: { email, password } });
            const me = await api<Row>("/auth/me");
            if (text(me.role) !== role) {
              await api("/auth/logout", { method: "POST", json: {} });
              setError(
                tx(
                  lang,
                  "هذا الحساب لا يطابق نوع الحساب الذي اخترته.",
                  "This account does not match the account type you selected.",
                ),
              );
              return;
            }
            onAuth(me);
            nav("/");
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Error");
          }
        }}
      >
        <img className="auth-mark" src="/brand/JOSTI_Symbol_Color.svg" alt="" />
        <div>
          <span className="auth-kicker">{tx(lang, "دخول المنصة", "Platform sign-in")}</span>
          <h1>{tx(lang, "اختر نوع الحساب", "Choose the account type")}</h1>
          <p className="muted">
            {tx(
              lang,
              "أربعة أدوار مستقلة. اختيار الدور يعبّئ حساب التجربة، ويمكنك تعديل البريد وكلمة المرور.",
              "Four separate roles. Choosing one fills the demonstration account. You can still edit the email and password.",
            )}
          </p>
        </div>
        <div className="role-grid" role="group" aria-label={tx(lang, "نوع الحساب", "Account type")}>
          {demoAccounts.map((account) => (
            <button
              key={account.role}
              className={role === account.role ? "role-card active" : "role-card"}
              type="button"
              onClick={() => {
                setRole(account.role);
                setEmail(account.email);
                setPassword(DEMO_PASSWORD);
                setError("");
              }}
            >
              <strong>{tx(lang, account.ar, account.en)}</strong>
              <small>{tx(lang, account.orgAr, account.orgEn)}</small>
            </button>
          ))}
        </div>
        {error ? <div className="err">{error}</div> : null}
        <label>
          {tx(lang, "البريد الإلكتروني", "Email address")}
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {tx(lang, "كلمة المرور", "Password")}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <p className="demo-note">
          {tx(lang, selected.whoAr, selected.whoEn)} · {selected.email}
          <br />
          {tx(lang, "كلمة مرور التجربة للحسابات الأربعة:", "Demonstration password for all four accounts:")}{" "}
          {DEMO_PASSWORD}
        </p>
        <button className="cyan auth-submit" type="submit">
          {tx(lang, "دخول", "Log in")}
        </button>
        <Link className="auth-link" to={`/register?role=${role}`}>
          {tx(
            lang,
            `إنشاء حساب ${selected.ar}`,
            `Create a ${selected.en.toLowerCase()} account`,
          )}
        </Link>
      </form>
    </AuthFrame>
  );
}

function Register({
  lang,
  setLang,
  dark,
  setDark,
  onAuth,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  dark: boolean;
  setDark: (value: boolean | ((value: boolean) => boolean)) => void;
  onAuth: (row: Row) => void;
}) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get("role");
  const [role, setRole] = useState(
    requested === "merchant" ||
      requested === "customs_broker" ||
      requested === "carrier" ||
      requested === "driver"
      ? requested
      : "merchant",
  );
  const [error, setError] = useState("");
  return (
    <AuthFrame lang={lang} setLang={setLang} dark={dark} setDark={setDark}>
    <form
      className="auth-card"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const organizationType =
          role === "merchant"
            ? "merchant"
            : role === "customs_broker"
              ? "broker"
              : form.get("carrierKind") === "independent"
                ? "independent_carrier"
                : "carrier_company";
        try {
          await api("/auth/register", {
            json: {
              email: form.get("email"),
              password: form.get("password"),
              fullName: form.get("fullName"),
              phone: form.get("phone"),
              locale: lang,
              role,
              organization: {
                type: organizationType,
                legalName: form.get("legalName") || form.get("fullName"),
                nationalAddress: form.get("nationalAddress") || undefined,
                iban: form.get("iban") || undefined,
                carrierKind: role === "carrier" ? form.get("carrierKind") : undefined,
                existingOrganizationId:
                  role === "driver" ? form.get("existingOrganizationId") : undefined,
                joinCode: role === "driver" ? form.get("joinCode") : undefined,
              },
            },
          });
          onAuth(await api<Row>("/auth/me"));
          nav("/documents");
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : "Error");
        }
      }}
    >
      <img className="auth-mark" src="/brand/JOSTI_Symbol_Color.svg" alt="" />
      <h1>{tx(lang, "تسجيل", "Register")}</h1>
      <p className="muted">
        {tx(
          lang,
          "لا يمكن الجمع بين هوية تاجر ومخلص في حساب واحد. لا يوجد ربط تلقائي مع فسح.",
          "A merchant and a customs broker cannot share one account. There is no automatic Fasah connection.",
        )}
      </p>
      {error ? <div className="err">{error}</div> : null}
      <label>
        {tx(lang, "الدور", "Role")}
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="merchant">{tx(lang, "تاجر", "Merchant")}</option>
          <option value="customs_broker">{tx(lang, "مخلص جمركي", "Customs broker")}</option>
          <option value="carrier">{tx(lang, "ناقل", "Carrier")}</option>
          <option value="driver">{tx(lang, "سائق", "Driver")}</option>
        </select>
      </label>
      <label>
        {tx(lang, "الاسم", "Name")}
        <input name="fullName" required />
      </label>
      <label>
        {tx(lang, "البريد", "Email")}
        <input name="email" type="email" required />
      </label>
      <label>
        {tx(lang, "الجوال", "Mobile")}
        <input name="phone" required />
      </label>
      <label>
        {tx(lang, "كلمة المرور", "Password")}
        <input name="password" type="password" required />
      </label>
      {role !== "driver" ? (
        <label>
          {tx(lang, "الاسم النظامي", "Legal name")}
          <input name="legalName" required />
        </label>
      ) : null}
      <label>
        {tx(lang, "العنوان الوطني", "National address")}
        <input name="nationalAddress" />
      </label>
      {role === "merchant" ? (
        <label>
          IBAN
          <input name="iban" placeholder="SA" />
        </label>
      ) : null}
      {role === "carrier" ? (
        <label>
          {tx(lang, "نوع الناقل", "Carrier type")}
          <select name="carrierKind">
            <option value="company">{tx(lang, "شركة", "Company")}</option>
            <option value="independent">{tx(lang, "ناقل فرد", "Independent")}</option>
          </select>
        </label>
      ) : null}
      {role === "driver" ? (
        <>
          <label>
            {tx(lang, "معرف شركة النقل", "Carrier organization id")}
            <input name="existingOrganizationId" required />
          </label>
          <label>
            {tx(lang, "رمز الانضمام", "Join code")}
            <input name="joinCode" required />
          </label>
        </>
      ) : null}
      <button className="cyan auth-submit" type="submit">
        {tx(lang, "إنشاء الحساب", "Create account")}
      </button>
      <Link className="auth-link" to="/login">
        {tx(lang, "لديك حساب؟ ادخل", "Already registered? Log in")}
      </Link>
    </form>
    </AuthFrame>
  );
}

function gate(account: Row | null) {
  if (!account) return <Navigate to="/login" replace />;
  return null;
}

function Requests({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = gate(account);
  const [rows, setRows] = useState<Row[]>([]);
  const [available, setAvailable] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const role = text(account?.role);
  useEffect(() => {
    if (!account || role === "driver") return;
    api<Row[]>("/requests")
      .then(setRows)
      .catch((caught: ApiError) => setError(caught.message));
    if (role === "carrier")
      api<Row[]>("/requests/available")
        .then(setAvailable)
        .catch(() => setAvailable([]));
  }, [account, role]);
  if (blocked) return blocked;
  if (role === "driver") return <Navigate to="/trips" replace />;
  const source = role === "carrier" ? available : rows;
  const filtered = source.filter((row) => {
    const status = text(row.status);
    const hay = `${text(row.reference)} ${text(row.containerNumber)} ${text(row.destination)}`.toLowerCase();
    if (search && !hay.includes(search.toLowerCase())) return false;
    if (filter === "all") return true;
    if (filter === "broker") return status === "customs_clearance" || status === "returned_for_correction";
    if (filter === "admin") return status === "ready_for_admin_review";
    if (filter === "released")
      return status === "released_to_carriers" || status === "candidate_responses";
    if (filter === "assigned") return status === "carrier_selected" || status === "trip_confirmed";
    if (filter === "closed") return status === "completed" || status === "cancelled";
    return true;
  });
  const filters = [
    ["all", "الكل", "All"],
    ["broker", "قيد التخليص", "Clearance"],
    ["admin", "مراجعة الإدارة", "Admin review"],
    ["released", "الناقلون", "Carriers"],
    ["assigned", "رحلات مؤكدة", "Assigned"],
    ["closed", "مغلقة", "Closed"],
  ] as const;
  return (
    <>
      <div className="breadcrumb">JOSTI / {tx(lang, "الطلبات", "Requests")}</div>
      <div className="page-title">
        <div>
          <h1>
            {role === "carrier"
              ? tx(lang, "طلبات الترشيح", "Candidacy requests")
              : tx(lang, "طلبات النقل", "Transport requests")}
          </h1>
          <p>
            {tx(
              lang,
              "التخليص أولاً، ثم مراجعة الإدارة، ثم اختيار الناقل المناسب.",
              "Clearance, admin review, then the right carrier.",
            )}
          </p>
        </div>
        {role === "merchant" ? (
          <Link to="/requests/new">
            <button className="cyan" type="button">
              {tx(lang, "طلب جديد", "New request")}
            </button>
          </Link>
        ) : null}
      </div>
      {error ? <div className="err">{error}</div> : null}
      <section className="panel pad">
        <div className="sectionhead wrap">
          <div className="row wrap">
            {filters.map(([key, ar, en]) => (
              <button
                key={key}
                className={filter === key ? "chip active" : "chip"}
                type="button"
                onClick={() => setFilter(key)}
              >
                {tx(lang, ar, en)}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tx(lang, "ابحث عن طلب...", "Search requests...")}
            style={{ maxWidth: 220 }}
          />
        </div>
        <RequestTable
          lang={lang}
          rows={filtered}
          empty={tx(lang, "لا توجد طلبات.", "No requests.")}
        />
      </section>
      {role === "carrier" && rows.length ? (
        <section className="panel pad">
          <div className="sectionhead">
            <h2>{tx(lang, "ترشيحاتي", "My candidacies")}</h2>
          </div>
          <RequestTable lang={lang} rows={rows} empty="" />
        </section>
      ) : null}
    </>
  );
}

function requestPillTone(status: string) {
  if (status === "completed" || status === "trip_confirmed" || status === "closed") return "green";
  if (status === "customs_clearance" || status === "ready_for_admin_review" || status === "returned_for_correction")
    return "amber";
  if (status === "cancelled") return "red";
  return "blue";
}

function RequestTable({ lang, rows, empty }: { lang: Lang; rows: Row[]; empty: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="record-list">
      {rows.map((row) => (
        <Link className="record" key={text(row.id)} to={`/requests/${text(row.id)}`}>
          <div>
            <strong>{text(row.reference)}</strong>
            <p className="muted">
              {text(row.portCode)} · {text(row.containerNumber)}
              {text(row.destination) ? ` · ${text(row.destination)}` : ""}
            </p>
          </div>
          <span className={`pill ${requestPillTone(text(row.status))}`}>
            <i className="dot" />
            {statusName(lang, text(row.status))}
          </span>
        </Link>
      ))}
    </div>
  );
}

function NewRequest({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = gate(account);
  const nav = useNavigate();
  const [brokers, setBrokers] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Row[]>("/public/brokers")
      .then(setBrokers)
      .catch(() => setBrokers([]));
  }, []);
  if (blocked) return blocked;
  if (text(account?.role) !== "merchant") return <Navigate to="/" replace />;
  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const useDefault = form.get("brokerMode") === "default";
        try {
          const created = await api<Row>("/requests", {
            json: {
              useDefaultBroker: useDefault,
              brokerOrganizationId: useDefault ? undefined : form.get("brokerOrganizationId"),
              portCode: form.get("portCode"),
              containerNumber: form.get("containerNumber"),
              containerType: form.get("containerType"),
              truckType: form.get("truckType"),
              loadingLocation: form.get("loadingLocation"),
              destination: form.get("destination"),
              scheduledLoadingAt: new Date(String(form.get("scheduledLoadingAt"))).toISOString(),
              expectedDeliveryAt: new Date(String(form.get("expectedDeliveryAt"))).toISOString(),
              instructions: form.get("instructions") || undefined,
              proposedPrice: form.get("proposedPrice")
                ? Number(form.get("proposedPrice"))
                : undefined,
            },
          });
          nav(`/requests/${text(created.id)}`);
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : "Error");
        }
      }}
    >
      <h1>{tx(lang, "طلب نقل", "Transport request")}</h1>
      <p className="muted">
        {tx(
          lang,
          "السعر المقترح غير ملزم. المخلص يحدد السعر المعتمد، والإدارة تفرج الطلب يدويًا.",
          "A proposed price is not binding. The broker sets the approved price, and an administrator releases the request manually.",
        )}
      </p>
      {error ? <div className="err">{error}</div> : null}
      <label>
        {tx(lang, "المخلص", "Broker")}
        <select name="brokerMode">
          <option value="default">{tx(lang, "المخلص الافتراضي", "Saved default broker")}</option>
          <option value="choose">{tx(lang, "اختيار لهذا الطلب", "Choose for this request")}</option>
        </select>
      </label>
      <label>
        {tx(lang, "مخلص محدد", "Selected broker")}
        <select name="brokerOrganizationId">
          <option value="">{tx(lang, "—", "—")}</option>
          {brokers.map((broker) => (
            <option key={text(broker.id)} value={text(broker.id)}>
              {text(broker.legalName)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tx(lang, "الميناء", "Port")}
        <select name="portCode">
          <option>JED</option>
          <option>RAB</option>
          <option>YAN</option>
          <option>DMM</option>
        </select>
      </label>
      <label>
        {tx(lang, "رقم الحاوية", "Container number")}
        <input name="containerNumber" required placeholder="ABCD1234567" />
      </label>
      <label>
        {tx(lang, "نوع الحاوية", "Container type")}
        <select name="containerType">
          <option>20ft</option>
          <option>40ft</option>
          <option>40ft_hc</option>
          <option>45ft</option>
          <option>reefer_20</option>
          <option>reefer_40</option>
        </select>
      </label>
      <label>
        {tx(lang, "نوع الشاحنة", "Truck type")}
        <select name="truckType">
          <option>container_chassis</option>
          <option>flatbed</option>
          <option>lowbed</option>
          <option>side_loader</option>
          <option>reefer</option>
        </select>
      </label>
      <label>
        {tx(lang, "موقع التحميل", "Loading location")}
        <input name="loadingLocation" required />
      </label>
      <label>
        {tx(lang, "الوجهة", "Destination")}
        <input name="destination" required />
      </label>
      <label>
        {tx(lang, "وقت التحميل", "Loading time")}
        <input name="scheduledLoadingAt" type="datetime-local" required />
      </label>
      <label>
        {tx(lang, "الوصول المتوقع", "Expected delivery")}
        <input name="expectedDeliveryAt" type="datetime-local" required />
      </label>
      <label>
        {tx(lang, "تعليمات", "Instructions")}
        <textarea name="instructions" />
      </label>
      <label>
        {tx(lang, "سعر مقترح غير ملزم", "Non-binding proposed price")}
        <input name="proposedPrice" type="number" min="1" />
      </label>
      <button className="primary" type="submit">
        {tx(lang, "إرسال للمخلص", "Send to broker")}
      </button>
    </form>
  );
}

function RequestDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = gate(account);
  const [row, setRow] = useState<Row | null>(null);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = () =>
    api<Row>(`/requests/${id}`)
      .then(setRow)
      .catch((caught: ApiError) => setError(caught.message));
  useEffect(() => {
    if (account) void load();
  }, [account, id]);
  useEffect(() => {
    if (text(account?.role) !== "carrier") return;
    api<Row[]>("/vehicles")
      .then(setVehicles)
      .catch(() => setVehicles([]));
    api<Row[]>("/drivers")
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, [account]);
  if (blocked) return blocked;
  if (!row)
    return error ? (
      <div className="err">{error}</div>
    ) : (
      <p>{tx(lang, "جار التحميل…", "Loading…")}</p>
    );
  const responses = (row.responses as Row[] | undefined) ?? [];
  const history = (row.history as Row[] | undefined) ?? [];
  const role = text(account?.role);
  return (
    <>
      <Link className="back" to="/requests">
        {tx(lang, "العودة إلى الطلبات", "Back to requests")}
      </Link>
      <section className="hero-card">
        <span className="badge">{statusName(lang, text(row.status))}</span>
        <h1>{text(row.reference)}</h1>
        <p>
          {text(row.portCode)} · {text(row.containerNumber)}
        </p>
      </section>
      <section className="dossier">
        <div className="card kv">
          <span>{tx(lang, "التحميل", "Loading")}</span>
          <b>{text(row.loadingLocation)}</b>
          <span>{tx(lang, "موعد التحميل", "Loading time")}</span>
          <b>{when(row.scheduledLoadingAt, lang)}</b>
          <span>{tx(lang, "الوجهة", "Destination")}</span>
          <b>{text(row.destination)}</b>
          <span>{tx(lang, "الوصول المتوقع", "Expected arrival")}</span>
          <b>{when(row.expectedDeliveryAt, lang)}</b>
          <span>{tx(lang, "الحاوية", "Container")}</span>
          <b>
            {text(row.containerNumber)} · {text(row.containerType)}
          </b>
          <span>{tx(lang, "الشاحنة", "Truck")}</span>
          <b>{statusName(lang, text(row.truckType))}</b>
          <span>{tx(lang, "التعليمات", "Instructions")}</span>
          <b>{text(row.instructions) || "—"}</b>
        </div>
        <div className="card invoice">
          <h2>{tx(lang, "التسعير", "Pricing")}</h2>
          {role !== "carrier" ? (
            <p>
              {tx(lang, "السعر المقترح", "Proposed")}: {text(row.proposedPrice) || "—"} SAR
            </p>
          ) : null}
          <p>
            {tx(lang, "السعر المعتمد", "Approved")}: {text(row.approvedPrice) || "—"} SAR
          </p>
          {(row.trip as Row | null) ? (
            <Link to={`/trips/${text((row.trip as Row).id)}`}>
              {tx(lang, "تتبع الرحلة على الخريطة", "Track this order on the map")} ·{" "}
              {text((row.trip as Row).reference)}
            </Link>
          ) : (
            <p className="muted">
              {tx(lang, "الخريطة تظهر بعد تعيين الرحلة.", "The map opens after a trip is assigned.")}
            </p>
          )}
        </div>
      </section>
      {history.length ? (
        <section className="card">
          <h2>{tx(lang, "سجل الحالة", "Status log")}</h2>
          <ol className="timeline">
            {history.map((event) => (
              <li key={text(event.id)}>
                <strong>{statusName(lang, text(event.newStatus))}</strong>
                <span>{when(event.createdAt, lang)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {message ? <div className="badge ok">{message}</div> : null}
      {error ? <div className="err">{error}</div> : null}
      {role === "customs_broker" &&
      ["customs_clearance", "returned_for_correction"].includes(text(row.status)) ? (
        <form
          className="card"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const file = form.get("file");
            try {
              if (file instanceof File && file.size) {
                const upload = new FormData();
                upload.set("file", file);
                upload.set("docType", "clearance_evidence");
                upload.set("requestId", id);
                await api("/documents", { form: upload });
              }
              await api(`/requests/${id}/clearance`, {
                json: {
                  approvedPrice: Number(form.get("approvedPrice")),
                  externalPaymentConfirmed: form.get("payment") === "on",
                  permitsConfirmed: form.get("permits") === "on",
                  confirmReady: form.get("ready") === "on",
                  progressNote: form.get("note"),
                },
              });
              setMessage(
                tx(
                  lang,
                  "تم الحفظ. الإفراج الإداري ما زال مطلوبًا.",
                  "Saved. Administrative release is still required.",
                ),
              );
              await load();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Error");
            }
          }}
        >
          <h2>{tx(lang, "التخليص", "Clearance")}</h2>
          <label>
            {tx(lang, "السعر المعتمد", "Approved price")}
            <input
              name="approvedPrice"
              type="number"
              required
              defaultValue={text(row.approvedPrice)}
            />
          </label>
          <label>
            <span>{tx(lang, "تأكيد سداد خارجي", "External payment recorded")}</span>
            <input name="payment" type="checkbox" />
          </label>
          <label>
            <span>{tx(lang, "التصاريح جاهزة", "Permits ready")}</span>
            <input name="permits" type="checkbox" />
          </label>
          <label>
            {tx(lang, "مستند التخليص", "Clearance document")}
            <input name="file" type="file" accept="image/*,.pdf" />
          </label>
          <label>
            {tx(lang, "ملاحظة", "Note")}
            <textarea name="note" />
          </label>
          <label>
            <span>{tx(lang, "تأكيد الجاهزية للمراجعة", "Confirm readiness for review")}</span>
            <input name="ready" type="checkbox" />
          </label>
          <button className="primary" type="submit">
            {tx(lang, "حفظ", "Save")}
          </button>
          <button
            className="danger"
            type="button"
            onClick={async () => {
              await api(`/requests/${id}/clearance`, {
                json: { returnForCorrection: true, returnReason: "Incomplete" },
              });
              await load();
            }}
          >
            {tx(lang, "إعادة للتصحيح", "Return for correction")}
          </button>
        </form>
      ) : null}
      {role === "carrier" &&
      ["released_to_carriers", "candidate_responses"].includes(text(row.status)) ? (
        <form
          className="card"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api(`/requests/${id}/responses`, {
                json: { vehicleId: form.get("vehicleId"), driverId: form.get("driverId") },
              });
              setMessage(
                tx(
                  lang,
                  "تمت إضافتك كمرشح فقط، وليس تعيينًا نهائيًا.",
                  "You were added as a candidate only. This is not a final assignment.",
                ),
              );
              await load();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Error");
            }
          }}
        >
          <h2>{tx(lang, "قبول السعر كمرشح", "Accept the price as a candidate")}</h2>
          <label>
            {tx(lang, "المركبة", "Vehicle")}
            <select name="vehicleId">
              {vehicles.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.plateNumber)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx(lang, "السائق", "Driver")}
            <select name="driverId">
              {drivers.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.fullName)}
                </option>
              ))}
            </select>
          </label>
          <button className="cyan" type="submit">
            {tx(lang, "ترشيح", "Become a candidate")}
          </button>
        </form>
      ) : null}
      {responses.length ? (
        <table>
          <thead>
            <tr>
              <th>{tx(lang, "الناقل", "Carrier")}</th>
              <th>{tx(lang, "الحالة", "Status")}</th>
              <th>{tx(lang, "السعر", "Price")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {responses.map((response) => (
              <tr key={text(response.id)}>
                <td>{text(response.legalName) || text(response.carrierOrgId)}</td>
                <td>
                  {text(response.status) === "candidate"
                    ? tx(lang, "مرشح", "Candidate")
                    : text(response.status)}
                </td>
                <td>{text(response.acceptedPrice)}</td>
                <td>
                  {["merchant", "customs_broker"].includes(role) &&
                  text(response.status) === "candidate" ? (
                    <button
                      className="primary"
                      type="button"
                      onClick={async () => {
                        try {
                          const trip = await api<Row>(`/requests/${id}/select`, {
                            json: { responseId: response.id },
                          });
                          setMessage(
                            `${tx(lang, "تم التعيين النهائي", "Final assignment confirmed")} ${text(trip.reference)}`,
                          );
                          await load();
                        } catch (caught) {
                          setError(caught instanceof ApiError ? caught.message : "Error");
                        }
                      }}
                    >
                      {tx(lang, "تعيين نهائي", "Final assignment")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{tx(lang, "لا يوجد مرشحون بعد.", "No candidates yet.")}</p>
      )}
    </>
  );
}

function Fleet({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = gate(account);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    setVehicles(await api<Row[]>("/vehicles"));
    setDrivers(await api<Row[]>("/drivers"));
  };
  useEffect(() => {
    if (text(account?.role) === "carrier")
      void load().catch((caught: ApiError) => setError(caught.message));
  }, [account]);
  if (blocked) return blocked;
  if (text(account?.role) !== "carrier") return <Navigate to="/" replace />;
  return (
    <>
      <h1>{tx(lang, "أسطولي", "My fleet")}</h1>
      {error ? <div className="err">{error}</div> : null}
      <form
        className="card"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api("/vehicles", {
            json: {
              plateNumber: form.get("plateNumber"),
              truckType: form.get("truckType"),
              supportedContainerTypes: [form.get("container")],
            },
          });
          await load();
        }}
      >
        <h2>{tx(lang, "إضافة مركبة", "Add vehicle")}</h2>
        <label>
          {tx(lang, "اللوحة", "Plate")}
          <input name="plateNumber" required />
        </label>
        <label>
          {tx(lang, "النوع", "Type")}
          <select name="truckType">
            <option>container_chassis</option>
            <option>flatbed</option>
            <option>lowbed</option>
            <option>side_loader</option>
            <option>reefer</option>
          </select>
        </label>
        <label>
          {tx(lang, "حاوية مدعومة", "Supported container")}
          <select name="container">
            <option>40ft</option>
            <option>20ft</option>
            <option>40ft_hc</option>
            <option>45ft</option>
            <option>reefer_20</option>
            <option>reefer_40</option>
          </select>
        </label>
        <button className="primary" type="submit">
          {tx(lang, "حفظ", "Save")}
        </button>
      </form>
      <form
        className="card"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await api("/drivers", {
              json: {
                email: form.get("email"),
                password: form.get("password"),
                fullName: form.get("fullName"),
                phone: form.get("phone"),
                licenseNumber: form.get("licenseNumber"),
                licenseExpiry: form.get("licenseExpiry"),
              },
            });
            await load();
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Error");
          }
        }}
      >
        <h2>{tx(lang, "إضافة سائق لشركة النقل", "Add a company driver")}</h2>
        <p className="muted">
          {tx(
            lang,
            "الناقل الفرد لا يضيف سائقين منفصلين.",
            "An independent carrier cannot add separate drivers.",
          )}
        </p>
        <label>
          {tx(lang, "الاسم", "Name")}
          <input name="fullName" required />
        </label>
        <label>
          {tx(lang, "البريد", "Email")}
          <input name="email" type="email" required />
        </label>
        <label>
          {tx(lang, "الجوال", "Mobile")}
          <input name="phone" required />
        </label>
        <label>
          {tx(lang, "كلمة المرور", "Password")}
          <input name="password" type="password" required />
        </label>
        <label>
          {tx(lang, "رخصة القيادة", "License")}
          <input name="licenseNumber" required />
        </label>
        <label>
          {tx(lang, "انتهاء الرخصة", "License expiry")}
          <input name="licenseExpiry" type="date" required />
        </label>
        <button className="primary" type="submit">
          {tx(lang, "إضافة", "Add")}
        </button>
      </form>
      <h2>{tx(lang, "المركبات", "Vehicles")}</h2>
      {vehicles.map((vehicle) => (
        <div className="card" key={text(vehicle.id)}>
          <strong>{text(vehicle.plateNumber)}</strong>{" "}
          <span className="badge">{text(vehicle.status)}</span>{" "}
          <button
            className="ghost"
            type="button"
            onClick={() =>
              api(`/vehicles/${text(vehicle.id)}/availability`, {
                method: "PATCH",
                json: { availability: "available" },
              }).then(load)
            }
          >
            {tx(lang, "متاحة", "Available")}
          </button>
        </div>
      ))}
      <h2>{tx(lang, "السائقون", "Drivers")}</h2>
      {drivers.map((driver) => (
        <div className="card" key={text(driver.id)}>
          {text(driver.fullName)} <span className="badge">{text(driver.status)}</span>
        </div>
      ))}
      <form
        className="card"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api("/assignments", {
            json: { vehicleId: form.get("vehicleId"), driverId: form.get("driverId") },
          });
          setError("");
        }}
      >
        <h2>{tx(lang, "ربط سائق بمركبة", "Assign driver to vehicle")}</h2>
        <select name="vehicleId">
          {vehicles.map((item) => (
            <option key={text(item.id)} value={text(item.id)}>
              {text(item.plateNumber)}
            </option>
          ))}
        </select>
        <select name="driverId">
          {drivers.map((item) => (
            <option key={text(item.id)} value={text(item.id)}>
              {text(item.fullName)}
            </option>
          ))}
        </select>
        <button className="cyan" type="submit">
          {tx(lang, "ربط", "Assign")}
        </button>
      </form>
    </>
  );
}

function Trips({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = gate(account);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (account)
      api<Row[]>("/trips")
        .then(setRows)
        .catch(() => setRows([]));
  }, [account]);
  if (blocked) return blocked;
  return (
    <>
      <h1>{tx(lang, "الرحلات", "Trips")}</h1>
      {!rows.length ? (
        <p className="muted">{tx(lang, "لا توجد رحلات.", "No trips.")}</p>
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <Link className="record" key={text(row.id)} to={`/trips/${text(row.id)}`}>
              <div>
                <strong>{text(row.reference)}</strong>
                <p className="muted">{text(row.agreedPrice)} SAR</p>
              </div>
              <span className="badge">{statusName(lang, text(row.status))}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

const NEXT: Record<string, string> = {
  en_route_to_port: "arrived_at_port",
  arrived_at_port: "loaded",
  loaded: "trip_started",
  trip_started: "in_transit",
  in_transit: "arrived_at_destination",
  arrived_at_destination: "delivered",
  delivered: "closed",
};

function TripDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const tiles = useMapTiles();
  const { id = "" } = useParams();
  const blocked = gate(account);
  const [row, setRow] = useState<Row | null>(null);
  const [tracking, setTracking] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setRow(await api<Row>(`/trips/${id}`));
    setTracking(await api<Row>(`/trips/${id}/tracking`).catch(() => null));
  };
  useEffect(() => {
    if (account) void load().catch((caught: ApiError) => setError(caught.message));
  }, [account, id]);
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => {
      api<Row>(`/trips/${id}/tracking`)
        .then(setTracking)
        .catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [account, id]);
  if (blocked) return blocked;
  if (!row)
    return error ? (
      <div className="err">{error}</div>
    ) : (
      <p>{tx(lang, "جار التحميل…", "Loading…")}</p>
    );
  const next = NEXT[text(row.status)];
  const current = (tracking?.current as Row | undefined) ?? null;
  const points = (tracking?.points as Row[] | undefined) ?? [];
  const line = [...points]
    .reverse()
    .map((point) => [Number(point.latitude), Number(point.longitude)] as [number, number])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const fee = (row.fee as Row | null) ?? null;
  const history = (row.history as Row[] | undefined) ?? [];
  return (
    <>
      <Link className="back" to="/trips">
        {tx(lang, "العودة إلى الرحلات", "Back to trips")}
      </Link>
      <section className="hero-card">
        <span className="badge">{statusName(lang, text(row.status))}</span>
        <h1>{text(row.reference)}</h1>
        <p>
          {text(row.requestReference) || text(row.reference)} · {text(row.agreedPrice)} SAR
        </p>
      </section>
      {error ? <div className="err">{error}</div> : null}
      <section className="dossier">
        <div>
          {line.length ? (
            <div className="map">
              <MapContainer
                center={line[line.length - 1] ?? [24.2, 45]}
                zoom={7}
                style={{ height: "100%" }}
              >
                <TileLayer attribution={tiles.attribution} url={tiles.url} />
                <Polyline positions={line} pathOptions={{ color: "#32D5E7", weight: 5 }} />
                {current ? (
                  <CircleMarker
                    center={[Number(current.latitude), Number(current.longitude)]}
                    radius={8}
                    pathOptions={{ color: "#2E1748", fillColor: "#32D5E7", fillOpacity: 1 }}
                  >
                    <Popup>
                      {text(current.recordedAt)}
                      {tracking?.stale ? ` · ${tx(lang, "غير محدث", "stale")}` : ""}
                    </Popup>
                  </CircleMarker>
                ) : null}
              </MapContainer>
            </div>
          ) : (
            <p className="muted">{tx(lang, "لا يوجد مسار بعد.", "No route has been recorded yet.")}</p>
          )}
          <h2>{tx(lang, "سجل الحالة", "Status log")}</h2>
          <ol className="timeline">
            {history.map((event) => (
              <li key={text(event.id)}>
                <strong>{statusName(lang, text(event.newStatus))}</strong>
                <span>{when(event.createdAt, lang)}</span>
              </li>
            ))}
          </ol>
        </div>
        <aside className="stack">
          <div className="card invoice">
            <h2>{tx(lang, "فاتورة المنصة", "Platform invoice")}</h2>
            <p>
              {tx(lang, "سعر الرحلة", "Trip price")}: {text(row.agreedPrice)} SAR
            </p>
            {fee ? (
              <p>
                {tx(lang, "رسم المنصة", "Platform fee")}: {text(fee.amount)} {text(fee.currency)} ·{" "}
                {text(fee.status)}
              </p>
            ) : (
              <p className="muted">
                {tx(lang, "يُسجل الرسم عند إغلاق الرحلة.", "The fee is recorded when the trip is closed.")}
              </p>
            )}
            {row.delivery ? (
              <p>
                {tx(lang, "المستلم", "Recipient")}: {text((row.delivery as Row).recipientName)} ·{" "}
                {when((row.delivery as Row).deliveredAt, lang)}
              </p>
            ) : null}
            <p>
              {tx(lang, "آخر موقع", "Last location")}:{" "}
              {current
                ? `${text(current.latitude)}, ${text(current.longitude)} · ${when(current.recordedAt, lang)}`
                : tx(lang, "لا يوجد", "None yet")}
              {tracking?.stale ? ` · ${tx(lang, "غير محدث", "stale")}` : ""}
            </p>
            <p className="muted">
              {tx(lang, "نقاط التتبع", "Tracking points")}: {points.length}
            </p>
            {text(row.requestId) ? (
              <Link to={`/requests/${text(row.requestId)}`}>{tx(lang, "فتح الطلب", "Open the request")}</Link>
            ) : null}
          </div>
        </aside>
      </section>
      {text(account?.driverId) &&
      text(account?.driverId) === text(row.driverId) &&
      next &&
      next !== "closed" ? (
        <form
          className="card"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              if (next === "loaded") {
                const upload = new FormData();
                const file = form.get("file");
                if (!(file instanceof File))
                  throw new ApiError(
                    422,
                    tx(lang, "صورة التحميل مطلوبة", "Loading photo is required"),
                  );
                upload.set("file", file);
                upload.set("docType", "loading_photo");
                upload.set("tripId", id);
                await api("/documents", { form: upload });
              }
              if (next === "delivered") {
                const upload = new FormData();
                const file = form.get("note");
                if (!(file instanceof File))
                  throw new ApiError(
                    422,
                    tx(lang, "إذن التسليم مطلوب", "Delivery Note is required"),
                  );
                upload.set("file", file);
                upload.set("docType", "delivery_note");
                upload.set("tripId", id);
                await api("/documents", { form: upload });
              }
              await api(`/trips/${id}/transition`, {
                json: {
                  toStatus: next,
                  recipientName: form.get("recipientName") || undefined,
                  deliveredAt: form.get("deliveredAt")
                    ? new Date(String(form.get("deliveredAt"))).toISOString()
                    : undefined,
                },
              });
              await load();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Error");
            }
          }}
        >
          <h2>
            {tx(lang, "الخطوة التالية", "Next step")}: {next}
          </h2>
          {next === "loaded" ? (
            <label>
              {tx(lang, "صورة مؤخرة المقطورة واللوحة", "Rear trailer and plate photo")}
              <input name="file" type="file" accept="image/*" required />
            </label>
          ) : null}
          {next === "delivered" ? (
            <>
              <label>
                {tx(lang, "اسم المستلم", "Recipient name")}
                <input name="recipientName" required />
              </label>
              <label>
                {tx(lang, "وقت التسليم", "Delivery time")}
                <input name="deliveredAt" type="datetime-local" required />
              </label>
              <label>
                {tx(lang, "إذن التسليم", "Delivery Note")}
                <input name="note" type="file" accept="image/*,.pdf" required />
              </label>
            </>
          ) : null}
          <button className="primary" type="submit">
            {tx(lang, "تحديث الحالة", "Update status")}
          </button>
        </form>
      ) : null}
      {["delivered", "closed"].includes(text(row.status)) ? (
        <form
          className="card"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api(`/trips/${id}/ratings`, {
                json: {
                  tripId: id,
                  targetRole: form.get("targetRole"),
                  score: Number(form.get("score")),
                  comment: form.get("comment") || undefined,
                },
              });
              await load();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Error");
            }
          }}
        >
          <h2>{tx(lang, "تقييم", "Rating")}</h2>
          <select name="targetRole">
            <option value="carrier">carrier</option>
            <option value="merchant">merchant</option>
          </select>
          <input name="score" type="number" min="1" max="5" required />
          <input name="comment" />
          <button className="ghost" type="submit">
            {tx(lang, "إرسال التقييم", "Submit rating")}
          </button>
        </form>
      ) : null}
      <form
        className="card"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await api(`/trips/${id}/incidents`, {
              json: {
                tripId: id,
                incidentType: form.get("incidentType"),
                description: form.get("description"),
              },
            });
            setError("");
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Error");
          }
        }}
      >
        <h2>{tx(lang, "بلاغ", "Incident")}</h2>
        <p className="muted">
          {tx(
            lang,
            "البلاغ لا يلغي الرحلة ولا يفرض غرامة.",
            "An incident does not cancel the trip or impose a fine.",
          )}
        </p>
        <select name="incidentType">
          <option>delay</option>
          <option>damage</option>
          <option>documentation</option>
          <option>safety</option>
          <option>no_show</option>
          <option>other</option>
        </select>
        <textarea name="description" required />
        <button className="danger" type="submit">
          {tx(lang, "تسجيل البلاغ", "Report incident")}
        </button>
      </form>
    </>
  );
}

const DOC_TYPES: Record<string, string[]> = {
  merchant: [
    "commercial_registration",
    "tax_identification",
    "national_address",
    "iban_certificate",
    "business_mobile_evidence",
  ],
  customs_broker: [
    "customs_clearance_license",
    "office_commercial_registration",
    "fasah_account_evidence",
    "broker_national_address",
  ],
  carrier: [
    "commercial_registration",
    "vehicle_registration",
    "vehicle_operating_card",
    "operating_license",
    "insurance",
    "periodic_inspection",
  ],
  driver: ["driver_license", "residence_permit", "passport"],
};
const VEHICLE_DOCS = new Set([
  "vehicle_registration",
  "vehicle_operating_card",
  "operating_license",
  "insurance",
  "periodic_inspection",
]);

function Documents({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = gate(account);
  const [rows, setRows] = useState<Row[]>([]);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<Row[]>([]);
  const [docType, setDocType] = useState(DOC_TYPES[text(account?.role)]?.[0] ?? "commercial_registration");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const load = () => api<Row[]>("/documents").then(setRows);
  useEffect(() => {
    if (account) void load().catch((caught: ApiError) => setError(caught.message));
    if (text(account?.role) === "carrier") {
      api<Row[]>("/vehicles").then(setVehicles).catch(() => setVehicles([]));
      api<Row[]>("/drivers").then(setDrivers).catch(() => setDrivers([]));
    }
  }, [account]);
  if (blocked) return blocked;
  const types = DOC_TYPES[text(account?.role)] ?? DOC_TYPES.merchant;
  return (
    <>
      <h1>{tx(lang, "مستندات التحقق", "Verification documents")}</h1>
      <p className="muted">
        {tx(
          lang,
          "ارفع PDF أو صورة واضحة. مستند المركبة أو السائق يجب أن يُربط بصاحبه حتى يُحتسب في التفعيل.",
          "Upload a PDF or a clear photo. A vehicle or driver document must be linked to that record before it counts toward activation.",
        )}
      </p>
      {error ? <div className="err">{error}</div> : null}
      {saved ? <div className="badge ok">{saved}</div> : null}
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const file = form.get("file");
          if (!(file instanceof File) || !file.size) return;
          const upload = new FormData();
          upload.set("file", file);
          upload.set("docType", docType);
          if (VEHICLE_DOCS.has(docType) && form.get("vehicleId"))
            upload.set("vehicleId", String(form.get("vehicleId")));
          if (form.get("driverId")) upload.set("driverId", String(form.get("driverId")));
          if (form.get("expiresOn")) upload.set("expiresOn", String(form.get("expiresOn")));
          try {
            await api("/documents", { form: upload });
            setSaved(tx(lang, "تم الرفع وهو بانتظار المراجعة.", "Uploaded and waiting for review."));
            setError("");
            await load();
          } catch (caught) {
            setSaved("");
            setError(caught instanceof ApiError ? caught.message : "Error");
          }
        }}
      >
        <label>
          {tx(lang, "نوع المستند", "Document type")}
          <select value={docType} onChange={(event) => setDocType(event.target.value)}>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tx(lang, "الملف", "File")}
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        </label>
        {VEHICLE_DOCS.has(docType) ? (
          <label>
            {tx(lang, "المركبة", "Vehicle")}
            <select name="vehicleId" required>
              <option value="">{tx(lang, "اختر المركبة", "Choose a vehicle")}</option>
              {vehicles.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.plateNumber)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {text(account?.role) === "carrier" && !text(account?.driverId) ? (
          <label>
            {tx(lang, "السائق، إن كان المستند له", "Driver, if this document is theirs")}
            <select name="driverId" defaultValue="">
              <option value="">{tx(lang, "بدون", "None")}</option>
              {drivers.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.fullName)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {tx(lang, "تاريخ الانتهاء", "Expiry")}
          <input name="expiresOn" type="date" />
        </label>
        <button className="primary" type="submit">
          {tx(lang, "رفع المستند", "Upload document")}
        </button>
      </form>
      <div className="record-list">
        {rows.map((row) => (
          <div className="record" key={text(row.id)}>
            <div>
              <strong>{text(row.docType)}</strong>
              <p className="muted">{text(row.originalFilename)}</p>
            </div>
            <span>
              <span className="badge">{statusName(lang, text(row.status))}</span>{" "}
              <a href={`/api/v1/documents/${text(row.id)}/download`}>{tx(lang, "تنزيل", "Download")}</a>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Notifications({ lang, account }: { lang: Lang; account: Row | null }) {
  const blocked = gate(account);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (account)
      api<Row[]>("/notifications")
        .then(setRows)
        .catch(() => setRows([]));
  }, [account]);
  if (blocked) return blocked;
  return (
    <>
      <div className="top">
        <h1>{tx(lang, "التنبيهات", "Notifications")}</h1>
        <button
          className="ghost"
          type="button"
          onClick={async () => {
            await api("/notifications/read-all", { method: "POST", json: {} });
            setRows(await api<Row[]>("/notifications"));
          }}
        >
          {tx(lang, "تعليم الكل كمقروء", "Mark all read")}
        </button>
      </div>
      {!rows.length ? (
        <p className="muted">{tx(lang, "لا توجد تنبيهات.", "No notifications.")}</p>
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <Link className={row.readAt ? "record read" : "record unread"} key={text(row.id)} to={`/notifications/${text(row.id)}`}>
              <div>
                <strong>{lang === "ar" ? text(row.titleAr) : text(row.titleEn)}</strong>
                <p className="muted">{when(row.createdAt, lang)}</p>
              </div>
              <span className="badge">{row.readAt ? tx(lang, "مقروء", "Read") : tx(lang, "جديد", "New")}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function NotificationDetail({ lang, account }: { lang: Lang; account: Row | null }) {
  const { id = "" } = useParams();
  const blocked = gate(account);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!account) return;
    api<Row[]>("/notifications")
      .then(async (rows) => {
        const found = rows.find((item) => text(item.id) === id) ?? null;
        if (!found) {
          setError(tx(lang, "التنبيه غير موجود.", "This notification was not found."));
          return;
        }
        if (!found.readAt) await api(`/notifications/${id}/read`, { method: "POST", json: {} });
        setRow({ ...found, readAt: found.readAt ?? new Date().toISOString() });
      })
      .catch((caught: ApiError) => setError(caught.message));
  }, [account, id, lang]);
  if (blocked) return blocked;
  if (!row)
    return error ? <div className="err">{error}</div> : <p>{tx(lang, "جار التحميل…", "Loading…")}</p>;
  const data = (row.data as Row | undefined) ?? {};
  return (
    <>
      <Link className="back" to="/notifications">
        {tx(lang, "العودة إلى التنبيهات", "Back to notifications")}
      </Link>
      <section className="hero-card">
        <span className="badge">{statusName(lang, text(row.type)) || tx(lang, "تنبيه", "Notice")}</span>
        <h1>{lang === "ar" ? text(row.titleAr) : text(row.titleEn)}</h1>
        <p>{when(row.createdAt, lang)}</p>
      </section>
      <section className="card stack">
        <p>{lang === "ar" ? text(row.bodyAr) : text(row.bodyEn)}</p>
        <div className="kv">
          <span>{tx(lang, "النوع", "Type")}</span>
          <b>{statusName(lang, text(row.type))}</b>
          <span>{tx(lang, "الوقت", "When")}</span>
          <b>{when(row.createdAt, lang)}</b>
          <span>{tx(lang, "الحالة", "Status")}</span>
          <b>{row.readAt ? tx(lang, "مقروء", "Read") : tx(lang, "غير مقروء", "Unread")}</b>
          <span>{tx(lang, "الإرسال", "Delivery")}</span>
          <b>{statusName(lang, text(row.pushStatus)) || "—"}</b>
          {text(data.status) ? (
            <>
              <span>{tx(lang, "حالة السجل", "Record status")}</span>
              <b>{statusName(lang, text(data.status))}</b>
            </>
          ) : null}
          {text(data.decision) ? (
            <>
              <span>{tx(lang, "القرار", "Decision")}</span>
              <b>{text(data.decision)}</b>
            </>
          ) : null}
        </div>
        <div className="row">
          {text(data.requestId) ? (
            <Link to={`/requests/${text(data.requestId)}`}>{tx(lang, "فتح الطلب", "Open the request")}</Link>
          ) : null}
          {text(data.tripId) ? (
            <Link to={`/trips/${text(data.tripId)}`}>{tx(lang, "فتح الرحلة", "Open the trip")}</Link>
          ) : null}
          {text(data.documentId) ? (
            <a href={`/api/v1/documents/${text(data.documentId)}/download`}>{tx(lang, "فتح المستند", "Open the document")}</a>
          ) : null}
        </div>
      </section>
    </>
  );
}

function Profile({
  lang,
  account,
  setAccount,
}: {
  lang: Lang;
  account: Row | null;
  setAccount: (account: Row | null) => void;
}) {
  const blocked = gate(account);
  const [me, setMe] = useState<Row | null>(account);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (account)
      api<Row>("/auth/me")
        .then(setMe)
        .catch(() => setMe(account));
  }, [account]);
  if (blocked || !me) return blocked;
  const organization = (me.organization as Row | undefined) ?? {};
  const initial = text(me.fullName).slice(0, 1) || "J";
  return (
    <>
      <section className="profile-head">
        <div className="avatar-wrap">
          {me.hasAvatar ? (
            <img className="avatar" src={`/api/v1/me/avatar?v=${text(me.fullName)}`} alt="" />
          ) : (
            <span className="avatar">{initial}</span>
          )}
          <label className="ghost avatar-btn">
            {tx(lang, "صورة الحساب", "Profile picture")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const upload = new FormData();
                upload.set("file", file);
                try {
                  const next = await api<Row>("/me/avatar", { form: upload });
                  setMe(next);
                  setAccount(next);
                  setSaved(tx(lang, "تم تحديث الصورة.", "Picture updated."));
                  setError("");
                } catch (caught) {
                  setError(caught instanceof ApiError ? caught.message : "Error");
                }
              }}
            />
          </label>
        </div>
        <div>
          <h1>{text(me.fullName)}</h1>
          <p>
            <span className="badge">{text(me.role)}</span> <span className="badge">{text(me.status)}</span>
          </p>
          <p className="muted">
            {text(me.email)} · {text(me.phone)}
          </p>
          {organization.legalName ? <p>{text(organization.legalName)}</p> : null}
          {organization.joinCode ? (
            <p>
              {tx(lang, "رمز انضمام السائقين", "Driver join code")}: {text(organization.joinCode)}
            </p>
          ) : null}
        </div>
      </section>
      {error ? <div className="err">{error}</div> : null}
      {saved ? <div className="badge ok">{saved}</div> : null}
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const payload: Row = {};
          for (const key of ["fullName", "fullNameAr", "phone", "legalName", "legalNameAr", "nationalAddress"]) {
            const value = String(form.get(key) || "").trim();
            if (value) payload[key] = value;
          }
          try {
            const next = await api<Row>("/me", { method: "PATCH", json: payload });
            setMe(next);
            setAccount(next);
            setSaved(tx(lang, "تم حفظ البيانات.", "Account details saved."));
            setError("");
          } catch (caught) {
            setSaved("");
            setError(caught instanceof ApiError ? caught.message : "Error");
          }
        }}
      >
        <h2>{tx(lang, "بيانات الحساب", "Account details")}</h2>
        <label>
          {tx(lang, "الاسم", "Name")}
          <input name="fullName" defaultValue={text(me.fullName)} required minLength={2} />
        </label>
        <label>
          {tx(lang, "الاسم بالعربية", "Arabic name")}
          <input name="fullNameAr" defaultValue={text(me.fullNameAr)} />
        </label>
        <label>
          {tx(lang, "الجوال", "Phone")}
          <input name="phone" defaultValue={text(me.phone)} required minLength={8} />
        </label>
        {organization.legalName ? (
          <>
            <label>
              {tx(lang, "الاسم النظامي", "Legal name")}
              <input name="legalName" defaultValue={text(organization.legalName)} />
            </label>
            <label>
              {tx(lang, "العنوان الوطني", "National address")}
              <input name="nationalAddress" defaultValue={text(organization.nationalAddress)} />
            </label>
          </>
        ) : null}
        <button className="primary" type="submit">
          {tx(lang, "حفظ", "Save")}
        </button>
      </form>
    </>
  );
}
