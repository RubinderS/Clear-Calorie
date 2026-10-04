import {ImageResponse} from 'next/og';
import {iconMarkStyle, LogoGlyph} from '@/lib/app-icon';

// Referenced from app/manifest.ts for Android/PWA home screen installs.
const size = {width: 192, height: 192};

export function GET() {
  return new ImageResponse(
    <div style={iconMarkStyle({borderRadius: 42})}>
      <LogoGlyph size={144} />
    </div>,
    {...size},
  );
}
