import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'What Frank Thinks',
    short_name: 'Frank',
    description: "AI reports on your group chats — drop in a WhatsApp or iMessage chat and get a real take on what's going on.",
    start_url: '/',
    display: 'standalone',
    background_color: '#FFF8F2',
    theme_color: '#FFF8F2',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
