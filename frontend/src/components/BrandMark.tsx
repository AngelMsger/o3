/* BrandMark — o3's app icon: the "o3" monogram on a macOS-style squircle,
   matching the Dock icon (build/icon/gen_icon_html.py) so the brand reads the
   same in the Dock, title bar, setup wizard and settings. Two theme variants:
   "void" (dark squircle, glowing teal wordmark) for dark mode and "signal"
   (teal squircle, dark-ink wordmark) for light. Rendered inline in JetBrains
   Mono ExtraBold so it stays crisp at any size. */
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
    ? 'radial-gradient(120% 120% at 30% 8%, #123039, #0a1a20 42%, #06121a)'
    : 'linear-gradient(165deg, #39e6d0, #2dd4bf 46%, #18b7a4)';
  const boxShadow = dark
    ? '0 0 0 1px rgba(45,212,191,.22) inset'
    : 'inset 0 1px 0 rgba(255,255,255,.35)';
  const ink = dark ? '#5df0dd' : '#06181a';
  const glow = dark
    ? `drop-shadow(0 0 ${Math.round(size * 0.28)}px rgba(45,212,191,.6))`
    : 'none';

  return (
    <span
      aria-label="o3"
      role="img"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: body,
        boxShadow,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 800,
          fontSize: Math.round(size * 0.52),
          letterSpacing: `${(-0.06 * size).toFixed(2)}px`,
          lineHeight: 1,
          color: ink,
          filter: glow,
        }}
      >
        o3
      </span>
    </span>
  );
}
