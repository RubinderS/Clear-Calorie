import {ImageResponse} from 'next/og';
import {iconMarkStyle} from '@/lib/app-icon';

// Rendered at 2x the display size (16x16 or 32x32 in a browser tab) so it stays crisp on HiDPI screens.
export const size = {width: 64, height: 64};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={iconMarkStyle({fontSize: 40, borderRadius: 14})}>C</div>,
    {...size},
  );
}
