import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'RUSH by OCN',
    short_name: 'RUSH',
    description: 'Your people. Your conversations. One place.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#D92D20',
    icons: [
      { src: '/icons/rush-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/rush-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/rush-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
