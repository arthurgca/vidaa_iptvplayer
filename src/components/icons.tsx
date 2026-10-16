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

export function DpadIcon() {
  return <svg className="dpad-icon" viewBox="0 0 40 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="m20 1 4 5h-8zm0 22-4-5h8zM1 12l5-4v8zm38 0-5 4V8z" />
  </svg>;
}

/** Selector arrow drawn independently of the TV's installed fonts. */
export function ChevronDownIcon() {
  return <svg {...svgProps} className="selector-chevron"><path d="m8 12 8 8 8-8" /></svg>;
}
