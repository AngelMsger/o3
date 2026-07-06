/* BrandMark — o3's "log-lines" app mark (design/Icon.dc.html), rendered inline
   for in-app chrome (title bar, etc.). Two theme variants matching the app icon:
   "void" (dark squircle, glowing teal signal) and "signal" (teal squircle,
   dark-ink signal). Geometry is the icon's 220-space mark, verbatim. */
import type { ReactElement } from 'react';

export function BrandMark({
  variant,
  size = 18,
}: {
  variant: 'void' | 'signal';
  size?: number;
}): ReactElement {
  const dark = variant === 'void';
  const body = dark
    ? 'radial-gradient(120% 120% at 30% 8%, #123039, #06121a)'
    : 'linear-gradient(165deg, #39e6d0, #18b7a4)';
  const shadow = dark
    ? '0 0 0 1px rgba(45,212,191,.25) inset'
    : '0 0 12px -3px #2dd4bf';
  const noiseDot = dark ? 'rgba(122,206,196,.42)' : 'rgba(6,24,26,.55)';
  const noiseBar = dark ? 'rgba(122,206,196,.24)' : 'rgba(6,24,26,.34)';
  const signal = dark ? '#5df0dd' : '#06181a';

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: body,
        boxShadow: shadow,
        position: 'relative',
        overflow: 'hidden',
        display: 'inline-block',
        flex: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 220 220" style={{ position: 'absolute', inset: 0 }}>
        {/* noise rows */}
        <circle cx="42" cy="59" r="8" fill={noiseDot} />
        <rect x="58" y="51" width="74" height="16" rx="8" fill={noiseBar} />
        <circle cx="42" cy="93" r="8" fill={noiseDot} />
        <rect x="58" y="85" width="100" height="16" rx="8" fill={noiseBar} />
        <circle cx="42" cy="161" r="8" fill={noiseDot} />
        <rect x="58" y="153" width="62" height="16" rx="8" fill={noiseBar} />
        {/* signal row */}
        <circle cx="42" cy="127" r="8" fill={signal} />
        <rect x="58" y="119" width="104" height="16" rx="8" fill={signal} />
        <circle cx="178" cy="127" r="8" fill={signal} />
      </svg>
    </span>
  );
}
