/** Prototype stroke icons — paths copied from offline UIUX `icons` map. */
const PATHS: Record<string, string> = {
  plus: '<path d="M12 4v16M4 12h16"/>',
  pin: '<path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
  refresh: '<path d="M20 7A9 9 0 0 0 4 6M4 2v5h5M4 17a9 9 0 0 0 16 1m0 4v-5h-5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  truck:
    '<path d="M2 5h12v12H2ZM14 9h4l4 5v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  bell: '<path d="M5 17h14l-2-3V8a5 5 0 0 0-10 0v6ZM10 21h4"/>',
  users:
    '<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 3a4 4 0 0 1 0 8M19 14a5 5 0 0 1 3 7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5M12 18h.01"/>',
  logout: '<path d="M10 3H3v18h7M9 12h12m-5-5 5 5-5 5"/>',
};

export function ProtoIcon({ name, className = "icon" }: { name: string; className?: string }) {
  const inner = PATHS[name] ?? PATHS.map!;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
