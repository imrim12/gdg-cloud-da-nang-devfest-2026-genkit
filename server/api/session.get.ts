/** Who is chatting, and whether Google sign-in is available. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  return {
    auth: !!useRuntimeConfig().public.auth,
    features: { files: features().files, memory: features().memory, connectors: connectorsAvailable() },
    user: user.signedIn ? { name: user.name, email: user.email, image: user.image } : null,
    // Bring your own key: each user adds a Gemini API key (with sign-in on)
    byot: byot(),
    hasGeminiKey: byot() ? (user.signedIn && !!await useStore().getGeminiKey(user.id)) : true
  }
})
