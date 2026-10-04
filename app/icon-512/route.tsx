import {ImageResponse} from 'next/og';
import {iconMarkStyle, LogoGlyph} from '@/lib/app-icon';

// Referenced from app/manifest.ts for Android/PWA home screen installs.
const size = {width: 512, height: 512};

export function GET() {
  return new ImageResponse(
    <div style={iconMarkStyle({borderRadius: 112})}>
      <LogoGlyph size={384} />
    </div>,
    {...size},
  );
}
