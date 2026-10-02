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
    icons: [
      {src: '/icon', sizes: '64x64', type: 'image/png'},
      {src: '/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
