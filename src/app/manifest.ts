import type { MetadataRoute } from 'next'

/** Makes the site installable: its own window and icon on a desktop, a home-screen app on a phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Life Dash',
    short_name: 'Life Dash',
    description: 'Paychecks, the planner, the back-home budget and the to-do list.',
    start_url: '/#paychecks',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0e12',
    theme_color: '#0c0e12',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Paychecks', url: '/#paychecks' },
      { name: 'Planner', url: '/#planner' },
      { name: 'To-do', url: '/todo' },
    ],
  }
}
