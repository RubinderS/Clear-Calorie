// Shared "C" mark used by app/icon.tsx, app/apple-icon.tsx, and the manifest icon routes.
// Keep in sync across sizes so iOS/Android home-screen icons aren't upscaled from a tiny favicon.
export function iconMarkStyle(opts: {
  fontSize: number;
  borderRadius?: number;
}): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#16a34a',
    borderRadius: opts.borderRadius ?? 0,
    color: '#ffffff',
    fontSize: opts.fontSize,
    fontWeight: 700,
    fontFamily: 'sans-serif',
  };
}
