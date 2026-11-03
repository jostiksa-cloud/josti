import { useId, useMemo, useState } from "react";
import { ProtoIcon } from "./ProtoIcon";

type Lang = "ar" | "en";
type TruckStatus = "available" | "waiting" | "trip" | "offline";

export type SchematicTruck = {
  id: string;
  status: TruckStatus;
  x: number;
  y: number;
  label?: string;
  meta?: string;
};

const STATUS_COLOR: Record<TruckStatus, string> = {
  available: "#168663",
  waiting: "#dba545",
  trip: "#388bb0",
  offline: "#979aa8",
};

const STATUS_LABEL: Record<TruckStatus, [string, string]> = {
  available: ["متاحة", "Available"],
  waiting: ["تنتظر", "Waiting"],
  trip: ["في رحلة", "On trip"],
  offline: ["غير متاحة", "Unavailable"],
};

/** Prototype offline demo markers (same positions as mapWidget). */
export const DEMO_TRUCKS: SchematicTruck[] = [
  { id: "T1", status: "available", x: 365, y: 165, label: "Rawafid Transport", meta: "40" },
  { id: "T2", status: "waiting", x: 480, y: 290, label: "Almasar Carrier", meta: "40" },
  { id: "T3", status: "trip", x: 665, y: 235, label: "Port Solutions", meta: "20" },
  { id: "T4", status: "available", x: 735, y: 360, label: "Najd Transport", meta: "40" },
  { id: "T5", status: "offline", x: 875, y: 180, label: "Red Sea Fleet", meta: "20" },
  { id: "T6", status: "available", x: 600, y: 410, label: "Gulf Haulage", meta: "40" },
  { id: "T7", status: "trip", x: 995, y: 310, label: "Haramain Logistics", meta: "40" },
  { id: "T8", status: "waiting", x: 810, y: 460, label: "Eastern Line", meta: "20" },
];

const tx = (lang: Lang, ar: string, en: string) => (lang === "ar" ? ar : en);

/** Exact visitor/public map from the offline UI/UX prototype (SVG schematic, not Leaflet). */
export function SchematicMap({
  lang,
  portName,
  filter = "all",
  trucks,
  guest = true,
  small = false,
  onSelectTruck,
}: {
  lang: Lang;
  portName: string;
  filter?: "all" | TruckStatus;
  trucks?: SchematicTruck[];
  guest?: boolean;
  small?: boolean;
  onSelectTruck?: (truck: SchematicTruck) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const gridId = useId().replace(/:/g, "");
  const source = trucks?.length ? trucks : DEMO_TRUCKS;
  const visible = useMemo(
    () => source.filter((v) => filter === "all" || filter === v.status),
    [source, filter],
  );

  return (
    <>
      <div className="map-wrap" style={small ? { height: 335 } : undefined}>
        <svg
          className="map"
          viewBox="0 0 1160 580"
          role="img"
          aria-label={tx(
            lang,
            "خريطة تخطيطية تجريبية للميناء والشاحنات",
            "Schematic demo map of the port and trucks",
          )}
        >
          <defs>
            <pattern id={gridId} width="45" height="45" patternUnits="userSpaceOnUse">
              <path d="M45 0H0V45" fill="none" stroke="#dbe3ea" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1160" height="580" fill="#edf1f5" />
          <g transform={`translate(${580 * (1 - zoom)} ${290 * (1 - zoom)}) scale(${zoom})`}>
            <rect width="1160" height="580" fill={`url(#${gridId})`} />
            <path
              d="M0 0h270l-25 65 54 65-26 57 51 32-17 70 33 56-70 87 39 41-36 107H0Z"
              fill="#c8e9ed"
            />
            <path
              d="M85 45h172M100 117h145M88 185h168M65 285h225"
              stroke="#b4dce1"
              strokeWidth="8"
            />
            <g stroke="#fff" strokeWidth="19" fill="none">
              <path d="M260 130 425 163 572 155 748 90 1080 120M290 280 455 295 580 245 775 280 1110 230M270 450 560 420 750 460 1090 420M390 0 420 160 455 290 410 580M710 0 735 220 700 400 740 580M970 0 950 210 1020 360 980 580" />
            </g>
            <g stroke="#d7dfe8" strokeWidth="2" fill="none">
              <path d="M260 130 425 163 572 155 748 90 1080 120M290 280 455 295 580 245 775 280 1110 230M270 450 560 420 750 460 1090 420M390 0 420 160 455 290 410 580M710 0 735 220 700 400 740 580M970 0 950 210 1020 360 980 580" />
            </g>
            <g fill="#e0e5ed">
              <rect x="520" y="65" width="110" height="60" rx="8" />
              <rect x="830" y="330" width="98" height="70" rx="8" />
              <rect x="480" y="335" width="85" height="55" rx="8" />
              <rect x="1040" y="65" width="80" height="85" rx="8" />
              <rect x="800" y="495" width="115" height="50" rx="8" />
            </g>
            <g fill="#d2e5d9">
              <rect x="840" y="60" width="80" height="58" rx="19" />
              <rect x="1030" y="485" width="88" height="65" rx="18" />
            </g>
            <g fill="#d1dae3">
              <rect x="210" y="205" width="75" height="24" rx="3" />
              <rect x="210" y="236" width="75" height="24" rx="3" />
              <rect x="214" y="274" width="69" height="24" rx="3" />
            </g>
            <g style={{ fontFamily: "Tajawal, Plus Jakarta Sans, Arial" }} fontSize="13" fill="#9da6b6">
              <text x="160" y="400" textAnchor="middle">
                {tx(lang, "البحر", "Sea")}
              </text>
              <text x="615" y="112" textAnchor="middle">
                {tx(lang, "المنطقة الصناعية", "Industrial area")}
              </text>
              <text x="881" y="370" textAnchor="middle">
                {tx(lang, "مستودعات", "Warehouses")}
              </text>
            </g>
            <circle cx="304" cy="256" r="23" fill="#2e1748" />
            <g transform="translate(292 244)" stroke="white" strokeWidth="1.8" fill="none">
              <path d="M0 0h24v20H0ZM4 4h16M5 8v8M11 8v8M17 8v8" />
            </g>
            {visible.map((v) => {
              const x = guest ? Math.round(v.x / 70) * 70 : v.x;
              const y = guest ? Math.round(v.y / 70) * 70 : v.y;
              const color = STATUS_COLOR[v.status];
              const active = selected === v.id;
              return (
                <g
                  key={v.id}
                  className="truck-marker"
                  tabIndex={0}
                  role="button"
                  aria-label={`${tx(lang, "تفاصيل الشاحنة", "Truck details")} ${v.id}`}
                  transform={`translate(${x} ${y})`}
                  onClick={() => {
                    setSelected(v.id);
                    onSelectTruck?.(v);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(v.id);
                      onSelectTruck?.(v);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    className="marker-box"
                    x="-23"
                    y="-21"
                    width="46"
                    height="42"
                    rx="11"
                    fill="white"
                    stroke={active ? "#32d5e7" : "#dde4eb"}
                    strokeWidth={active ? 2 : 1}
                  />
                  <path d="M-13-9H4V6H-13ZM4-5h6l6 7v4H4" stroke={color} strokeWidth="2" fill="none" />
                  <circle cx="-7" cy="8" r="3" fill={color} />
                  <circle cx="10" cy="8" r="3" fill={color} />
                  <circle cx="18" cy="-16" r="5" fill={color} stroke="white" strokeWidth="2" />
                </g>
              );
            })}
          </g>
        </svg>
        <div className="map-port-label">
          <b>{portName}</b>
          <div className="tiny muted">
            {guest
              ? tx(lang, "مواقع تقريبية للزوار", "Approximate positions for guests")
              : tx(lang, "مواقع العرض التخطيطي", "Schematic display positions")}
          </div>
        </div>
        <div className="map-tools">
          <button
            className="round"
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
          >
            <ProtoIcon name="plus" />
          </button>
          <button
            className="round"
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))}
          >
            −
          </button>
          <button className="round" type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}>
            <ProtoIcon name="pin" />
          </button>
        </div>
        <div className="map-caption">
          {tx(lang, "خريطة تخطيطية دون اتصال · ليست للملاحة", "Offline schematic map · Not for navigation")}
        </div>
      </div>
      <div className="legend">
        {(Object.keys(STATUS_LABEL) as TruckStatus[]).map((key) => (
          <span key={key} style={{ color: STATUS_COLOR[key] }}>
            <i className="dot" />
            {tx(lang, STATUS_LABEL[key][0], STATUS_LABEL[key][1])}
          </span>
        ))}
      </div>
      {selected ? (
        <div className="notice">
          <strong>{visible.find((t) => t.id === selected)?.label || selected}</strong>
          {" · "}
          {visible.find((t) => t.id === selected)?.meta ||
            tx(lang, "تفاصيل الشاحنة في العرض التخطيطي", "Schematic truck details")}
        </div>
      ) : null}
    </>
  );
}

/** Map API availability values onto prototype schematic statuses. */
export function toSchematicStatus(value: string): TruckStatus {
  if (value === "available") return "available";
  if (value === "waiting") return "waiting";
  if (value === "on_trip" || value === "trip" || value === "in_transit") return "trip";
  return "offline";
}

export function apiTrucksToSchematic(
  rows: Array<Record<string, unknown>>,
): SchematicTruck[] {
  return rows.map((row, index) => {
    const demo = DEMO_TRUCKS[index % DEMO_TRUCKS.length]!;
    return {
      id: String(row.vehicleId ?? row.id ?? demo.id),
      status: toSchematicStatus(String(row.availability ?? "offline")),
      x: demo.x,
      y: demo.y,
      label: String(row.carrierName ?? row.plateNumber ?? demo.id),
      meta: [String(row.truckType ?? ""), String(row.distanceKm ? `${row.distanceKm} km` : "")]
        .filter(Boolean)
        .join(" · "),
    };
  });
}
