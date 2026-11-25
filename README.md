# Agent

A ChatGPT-style agent platform: **Nuxt 4 + Nuxt UI + Genkit + Gemini**, deployed to **Cloud Run**.

| Feature | How |
| --- | --- |
| Chat | Genkit flow `server/genkit/flows/chat.ts`, streamed as NDJSON from `POST /api/chat` |
| Web search | `search` tool → Gemini Google Search grounding |
| Code execution | `python` tool → Agent Platform code execution sandbox (one per chat) |
| Shell | `shell` tool → Agent Platform shell sandbox (`/exec`) |
| Computer use | `browse` tool → Playwright over CDP to the Agent Platform computer use sandbox |
| Memory | Agent Platform Memory Bank: recalled into the system prompt, generated after each reply |
| Files | `save` tool + Python output files → Cloud Storage, downloaded via `/api/files/...` |
| Voice | Browser → Gemini Live API over WebSocket, using an ephemeral token from `POST /api/voice` |
| Auth | Better Auth, Google sign-in, stateless (no database). Off by default (`NUXT_PUBLIC_AUTH`) |

Each Google Cloud feature turns on when its env vars are set (`server/utils/features.ts`). With only
`NUXT_GEMINI_API_KEY` you get chat and web search.

## Layout

```
app/
  layouts/default.vue        sidebar (UDashboardGroup/Sidebar) + history
  pages/index.vue            new chat
  pages/chat/[id].vue        conversation
  components/chat/prompt.vue <ChatPrompt>   input + voice + submit
  components/chat/content.vue <ChatContent> markdown + tool calls
  components/app/user.vue    <AppUser>      Google sign-in
  composables/chat.ts        useChat(id)    streaming client
  composables/chats.ts       useChats()     history (localStorage)
  composables/voice.ts       useVoice()     Live API audio
  utils/auth.ts              auth           Better Auth client
server/
  api/chat.post.ts  api/voice.post.ts  api/files/[...path].get.ts  api/auth/[...all].ts
  genkit/index.ts            ai, model()
  genkit/flows/chat.ts       chat flow
  genkit/tools/*.ts          search, python, shell, browse, save
  utils/*.ts                 auth, user, gcp, sandbox, memory, bucket, features
scripts/setup.ts             one-time Agent Platform setup
scripts/cloud-run-setup.sh   one-time Cloud Run + GitHub deploy setup
.github/workflows/deploy.yml push to main → Cloud Run
```

## Develop

```bash
cp .env.example .env   # set NUXT_GEMINI_API_KEY
npm install
npm run dev
```

`npm run lint`, `npm run typecheck`, `npm run build`.

## Deploy (push to `main` → Cloud Run)

`.github/workflows/deploy.yml` runs lint and typecheck, builds the image, pushes it to Artifact Registry
and deploys the `agent` service to Cloud Run, scaling to zero (`--min-instances 0`). GitHub signs in to
Google Cloud with Workload Identity Federation, so there are no service account keys.

**One time**, in [Cloud Shell](https://shell.cloud.google.com) as a project Owner:

```bash
git clone https://github.com/<owner>/<repo> && cd <repo>
bash scripts/cloud-run-setup.sh <project> <owner>/<repo> us-central1                  # chat, search, voice, files
bash scripts/cloud-run-setup.sh <project> <owner>/<repo> us-central1 --agent-platform  # + Memory Bank, Python, shell, browse
```

It asks for the Gemini API key (stored in Secret Manager), creates everything below, and prints the
GitHub repository variables to set (Settings → Secrets and variables → Actions → **Variables**):
`GCP_PROJECT`, `GCP_PROJECT_NUMBER`, `GCP_REGION`, and with `--agent-platform` also `NUXT_GCP_ENGINE`,
`NUXT_GCP_SHELL_TEMPLATE`, `NUXT_GCP_BROWSER_TEMPLATE`. Then push to `main`, or run the workflow by hand.

| Created | For |
| --- | --- |
| Artifact Registry repo `agent` | container images |
| `agent-runtime` service account | the Cloud Run service: `aiplatform.user`, token creator on itself (`browse`), bucket and secret access |
| `agent-deployer` service account | GitHub Actions: `run.admin`, push images, act as `agent-runtime` |
| Workload Identity pool `github` | only `<owner>/<repo>` can use `agent-deployer` |
| Bucket `<project>-agent-files` | `save` tool and Python output files |
| Secret `gemini-api-key` | `NUXT_GEMINI_API_KEY` |

Optional repository variables: `MAX_INSTANCES` (default 3, caps cost), `NUXT_MODEL`, `NUXT_LIVE_MODEL`, and
`AUTH_URL` (the service URL) to turn on Google sign-in, after creating the `auth-secret`,
`auth-google-client-id` and `auth-google-client-secret` secrets (grant `agent-runtime` access to them) and
adding `<AUTH_URL>/api/auth/callback/google` to the OAuth client's redirect URIs.

`--agent-platform` runs `scripts/setup.ts` (Node 22.18+), which creates a new engine each time: pass it once.

## Notes

- Chat history is in the browser (localStorage). A chat's sandboxes are named after it (`code:<chatId>`),
  cached in memory per instance and otherwise looked up through the API, so they survive scale to zero
  and are shared across instances.
- `/api/voice` mints Live API tokens for any visitor. Turn on auth or add rate limiting before going public.
- Live API ephemeral tokens need the Gemini Developer API key, not Vertex AI.
