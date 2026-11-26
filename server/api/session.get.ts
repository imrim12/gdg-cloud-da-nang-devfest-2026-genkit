/** Who is chatting, and whether Google sign-in is available. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  return {
    auth: !!useRuntimeConfig().public.auth,
    features: { files: features().files, memory: features().memory, connectors: connectorsAvailable() },
    user: user.signedIn ? { name: user.name, email: user.email, image: user.image } : null
  }
})
