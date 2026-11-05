import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  css: ['~/assets/css/main.css'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'My Team',
      meta: [
        { name: 'theme-color', content: '#0b0f17' },
        { name: 'application-name', content: 'My Team' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/pwa-192x192.png' },
      ],
    },
  },
  runtimeConfig: {
    public: {
      e2eeDefaultPhrase: process.env.NUXT_PUBLIC_E2EE_PHRASE || '',
    },
  },
  modules: [
    '@nuxtjs/supabase',
    '@vercel/analytics/nuxt',
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    // Stream proxy may wait 2x 8s Piped resolves; Vercel Hobby allows up to 60s
    vercel: { functions: { maxDuration: 60 } },
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [],
      saveRedirectToCookie: true,
    },
  },
})
