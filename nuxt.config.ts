export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@comark/vue'],

  ssr: false,

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  // Fonts load from Google Fonts in the browser (app.vue), so builds don't download them
  ui: {
    fonts: false
  },

  runtimeConfig: {
    // Server-only. Override with NUXT_* env vars (e.g. NUXT_GEMINI_API_KEY).
    geminiApiKey: '',
    // Default chat model; the picker lists every Gemini chat model the key can use (/api/models)
    model: 'gemini-3.5-flash',
    // Small, fast model for chat titles
    titleModel: 'gemini-3.5-flash-lite',
    liveModel: 'gemini-3.8-live',
    auth: {
      secret: '',
      googleClientId: '',
      googleClientSecret: ''
    },
    gcp: {
      project: '',
      location: 'us-central1',
      // Firestore database id, e.g. (default). Empty: chats are kept in memory (local development)
      firestore: '',
      // projects/{p}/locations/{l}/reasoningEngines/{id} — enables Memory Bank + sandboxes
      engine: '',
      shellTemplate: '',
      browserTemplate: '',
      // Service account used to sign sandbox data-plane tokens (computer use)
      serviceAccount: '',
      bucket: ''
    },
    public: {
      // Shows "Sign in with Google" (needs the auth.* values)
      auth: false
    }
  },

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2026-11-01',

  nitro: {
    preset: 'node-server'
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    clientBundle: {
      scan: true
    }
  }
})
