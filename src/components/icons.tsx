type HomeIconName = 'live' | 'movies' | 'series' | 'favorites' | 'recent' | 'settings';

const svgProps = {
  viewBox: '0 0 32 32',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false'
} as const;

/**
 * Inline SVG keeps the UI independent from the small glyph sets bundled with
 * TV firmware. In particular, many VIDAA fonts do not contain media symbols.
 */
export function HomeIcon({ name }: { name: HomeIconName }) {
  switch (name) {
    case 'live':
      return <svg {...svgProps}><rect x="4" y="7" width="24" height="18" rx="2.5" /><path d="m13.5 12 7 4-7 4z" fill="currentColor" stroke="none" /><path d="M11 28h10" /></svg>;
    case 'movies':
      return <svg {...svgProps}><rect x="5" y="9" width="22" height="17" rx="2.5" /><path d="M5 14h22M10 9l3-5m4 5 3-5m-15 5 3-5m15 5 3-5" /></svg>;
    case 'series':
      return <svg {...svgProps}><rect x="7" y="6" width="18" height="20" rx="2.5" /><path d="M11 3h10M11 29h10m1-13-9 5v-10z" /></svg>;
    case 'favorites':
      return <svg {...svgProps}><path d="m16 4 3.6 7.2 8 1.2-5.8 5.6 1.4 8-7.2-3.8L8.8 26l1.4-8-5.8-5.6 8-1.2z" /></svg>;
    case 'recent':
      return <svg {...svgProps}><path d="M7.4 9.1V4.5H3M7 5a12 12 0 1 1-2.5 13" /><path d="M16 9v7l4.5 3" /></svg>;
    case 'settings':
      return <svg {...svgProps}><circle cx="16" cy="16" r="4" /><path d="M13.2 4h5.6l.8 3.3 2.1 1.2L25 7.4l2.8 4.8-2.5 2.2v3.2l2.5 2.2-2.8 4.8-3.3-1.1-2.1 1.2-.8 3.3h-5.6l-.8-3.3-2.1-1.2L7 24.6l-2.8-4.8 2.5-2.2v-3.2l-2.5-2.2L7 7.4l3.3 1.1 2.1-1.2z" /></svg>;
  }
}

export function DpadIcon() {
  return <svg className="dpad-icon" viewBox="0 0 40 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="m20 1 4 5h-8zm0 22-4-5h8zM1 12l5-4v8zm38 0-5 4V8z" />
  </svg>;
}
