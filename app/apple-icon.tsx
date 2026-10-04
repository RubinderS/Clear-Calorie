import {ImageResponse} from 'next/og';
import {iconMarkStyle, LogoGlyph} from '@/lib/app-icon';

// 180x180 is Apple's recommended apple-touch-icon size; no border-radius since iOS applies its own mask.
export const size = {width: 180, height: 180};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={iconMarkStyle({})}>
      <LogoGlyph size={136} />
    </div>,
    {...size},
  );
}
