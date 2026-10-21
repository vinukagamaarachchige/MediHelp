export default function Icon({ name, size = 20, ...props }) {
  const emojis = { pill: "💊", today: "📅", week: "🗓️", box: "📦", check: "✅", lock: "🔒", sun: "☀️", moon: "🌙" };
  if (emojis[name]) return <span className="recognition-emoji" aria-hidden="true" {...props} style={{ fontSize: size, ...props.style }}>{emojis[name]}</span>;
  const paths = {
    pill: <><path d="m10 14 4-4"/><rect x="7" y="2" width="10" height="20" rx="5" transform="rotate(45 12 12)"/></>,
    today: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-14 5 3 3 6-6"/></>,
    week: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h1m6 0h1m-8 3h1"/></>,
    box: <><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M9 10v11m6-11v11M8 7h8"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
    moon: <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.pill}</svg>;
}
