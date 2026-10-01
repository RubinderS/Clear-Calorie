import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClearCalorie',
    short_name: 'ClearCalorie',
    description: 'Track calories, exercise, weight, and health goals.',
    start_url: '/dashboard',
    // Without an explicit scope, iOS limits the web app to the page it was added from.
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    icons: [{src: '/icon', sizes: '32x32', type: 'image/png'}],
  };
}
