import { betterAuth } from 'better-auth'

function create() {
  const { auth } = useRuntimeConfig()
  // Stateless: no database. The session lives in an encrypted cookie.
  return betterAuth({
    secret: auth.secret,
    socialProviders: {
      google: { clientId: auth.googleClientId, clientSecret: auth.googleClientSecret }
    },
    session: {
      cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7, strategy: 'jwe', refreshCache: true }
    },
    account: { storeStateStrategy: 'cookie', storeAccountCookie: true }
  })
}

let instance: ReturnType<typeof create> | undefined

export const useAuth = () => (instance ??= create())
