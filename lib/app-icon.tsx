// Shared brand mark: a flame (calories) inside an activity-style progress ring.
// Used by app/icon.tsx, app/apple-icon.tsx, the manifest icon routes, and the in-app header logo.
// Keep in sync across sizes so iOS/Android home-screen icons aren't upscaled from a tiny favicon.

export const BRAND_GRADIENT = 'linear-gradient(135deg, #22c55e 0%, #059669 100%)';

// Ring arc (~75% complete, starting at 12 o'clock) and flame, drawn on a 64x64 grid.
const RING_PATH = 'M32 10 A22 22 0 1 1 10 32';
const FLAME_PATH =
  'M32 15.5 C32 15.5 42.5 23.5 42.5 34 A10.5 10.5 0 0 1 21.5 34 C21.5 28.5 24.5 25 26.5 21.5 C27.5 25.5 29.5 27.5 31.5 28 C30.5 23.5 31 19.5 32 15.5 Z';

export function LogoGlyph({
  size,
  color = '#ffffff',
  className,
}: {
  size: number | string;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d={RING_PATH} stroke={color} strokeWidth={6} strokeLinecap="round" />
      <path d={FLAME_PATH} fill={color} />
    </svg>
  );
}

export function iconMarkStyle(opts: {borderRadius?: number}): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: BRAND_GRADIENT,
    borderRadius: opts.borderRadius ?? 0,
  };
}
