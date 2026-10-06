import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Fairway Studio', short_name: 'Fairway',
    description: 'A shared creative studio for ideas, projects, and considered decisions.',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f4f3ed', theme_color: '#f4f3ed',
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
