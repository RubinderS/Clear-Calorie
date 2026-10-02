import {ImageResponse} from 'next/og';
import {iconMarkStyle} from '@/lib/app-icon';

// Referenced from app/manifest.ts for Android/PWA home screen installs.
const size = {width: 512, height: 512};

export function GET() {
  return new ImageResponse(
    <div style={iconMarkStyle({fontSize: 320, borderRadius: 112})}>C</div>,
    {...size},
  );
}
