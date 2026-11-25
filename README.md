# Build an AI agent with Genkit, Gemini and Cloud Run

**GDG Cloud Đà Nẵng · DevFest 2026 codelab**

You will deploy a ChatGPT-style agent to **your own Google Cloud project**, entirely from **Cloud Shell**:
streaming chat with tools, web search, voice, file downloads, and optionally long-term memory, a Python
sandbox, a shell and a browser it can drive. Every step is copy/paste.

**Stack:** Nuxt 4 + Nuxt UI · Genkit (flows + tools) · Gemini API + Live API · Cloud Run (scales to zero) ·
Secret Manager · Cloud Storage · Agent Platform (Memory Bank, sandboxes) · GitHub Actions

```
Browser ──chat (NDJSON stream)──▶ Cloud Run: Nuxt + Genkit ──▶ Gemini API (+ Google Search grounding)
   │                                   │  tools ──▶ Cloud Storage (files)
   │                                   └──────────▶ Agent Platform (Memory Bank, Python / shell / browser sandboxes)
   └──voice (WebSocket, ephemeral token)──▶ Gemini Live API
```

| Part | What you get | Time |
| --- | --- | --- |
| [0. Before you start](#0-before-you-start) | Project, billing, Gemini API key | 5 min |
| [1. Set up Cloud Shell](#1-set-up-cloud-shell) | Code and variables | 3 min |
| [2. Run it in Cloud Shell](#2-run-it-in-cloud-shell-with-the-genkit-developer-ui) | Local app + **Genkit Developer UI** | 10 min |
| [3. Deploy to Cloud Run](#3-deploy-to-cloud-run) | **Your public URL** | 10 min |
| [4. Files on Cloud Storage](#4-optional-files-on-cloud-storage) (optional) | `save` tool | 3 min |
| [5. Memory, Python, shell, browser](#5-optional-memory-python-shell-and-browser-with-agent-platform) (optional) | Agent Platform tools | 10 min |
| [6. Add your own tool](#6-add-your-own-genkit-tool) | A `weather` tool | 5 min |
| [7. Deploy on every merged PR](#7-optional-deploy-on-every-merged-pr-with-github-actions) (optional) | GitHub Actions CI/CD | 10 min |
| [8. Clean up](#8-clean-up) | No surprise bills | 2 min |

---

## 0. Before you start

1. **A Google Cloud project with billing enabled.** Use event credits if you have them, or create a project
   at [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate) and link a
   billing account. Cloud Run scales to zero, so an idle demo costs close to nothing.
2. **A Gemini API key:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**
   → pick **the same project**. Web search (Google Search grounding) needs a project with billing; on a
   free-tier key it fails with `429 RESOURCE_EXHAUSTED` while normal chat still works.
3. You are an **Owner** (or Editor + Security Admin) of the project.

## 1. Set up Cloud Shell

Open **[Cloud Shell](https://shell.cloud.google.com/?show=terminal)** and paste, replacing the project ID:

```bash
export PROJECT_ID=your-project-id        # ← change me
export REGION=asia-southeast1            # Singapore, closest to Đà Nẵng
gcloud config set project $PROJECT_ID
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export RUNTIME_SA=agent-runtime@$PROJECT_ID.iam.gserviceaccount.com
echo "project=$PROJECT_ID number=$PROJECT_NUMBER region=$REGION"
```

Paste your Gemini API key when asked (it is not shown, and not saved to disk):

```bash
read -rsp "Gemini API key: " GEMINI_API_KEY && export GEMINI_API_KEY && echo " ok"
```

Get the code:

```bash
git clone https://github.com/imrim12/gdg-cloud-da-nang-devfest-2026-genkit
cd gdg-cloud-da-nang-devfest-2026-genkit
```

> Cloud Shell resets environment variables when it reconnects. If a command complains about an empty
> `$PROJECT_ID`, paste the two blocks above again (skip the `git clone`).

## 2. Run it in Cloud Shell, with the Genkit Developer UI

Check Node (Nuxt 4 needs 20.19 or newer; 22 recommended):

```bash
node -v || true
# only if it is older than v20.19:
nvm install 22 && nvm use 22
```

Install, build, and start the app under the Genkit CLI, which adds the **Developer UI** on port 4000:

```bash
npm ci
npm run build
PORT=8080 NUXT_GEMINI_API_KEY=$GEMINI_API_KEY npx -y genkit-cli start --non-interactive -- node .output/server/index.mjs
```

1. **The app:** Cloud Shell toolbar → **Web Preview** (the `<>` eye icon) → **Preview on port 8080**. Try:
   - `Write a haiku about Đà Nẵng, then a table of its 3 best beaches`
   - `What's happening at GDG DevFest this year?`. Watch the `search` tool call appear.
2. **The Genkit Developer UI:** **Web Preview → Change port → `4000`**.
   - Send one chat message in the app first. Genkit loads with the first request, then the `chat` flow and
     the tools show up.
   - **Flows → chat**: run the flow directly with this input:
     ```json
     { "chatId": "devui", "userId": "me", "messages": [{ "role": "user", "text": "Hello from the Dev UI!" }] }
     ```
   - **Traces**: open any run to see every model call, the tool requests and responses, tokens and latency.
   - **Models / Tools**: call Gemini or a single tool (try `search`) on its own.

Stop it with **Ctrl+C** before continuing.

**Where the Genkit code lives** (read these three, they are short):

| File | What it does |
| --- | --- |
| `server/genkit/index.ts` | `genkit({ plugins: [googleAI()] })` and the model name |
| `server/genkit/flows/chat.ts` | The `chat` flow: system prompt, `ai.generateStream({ tools, maxTurns })`, streams text and tool events |
| `server/genkit/tools/*.ts` | One `ai.defineTool()` per tool: a name, a description and a Zod input schema the model reads |
| `server/api/chat.post.ts` | Calls `chat.stream()` and sends each chunk to the browser as a line of JSON |

## 3. Deploy to Cloud Run

Enable the APIs (about 1 minute):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
```

Store the Gemini key in **Secret Manager**, so it never sits in an env var or in the image:

```bash
printf %s "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --replication-policy=automatic --data-file=-
```

Create a **service account** for the app (least privilege: it can only read that secret, for now):

```bash
gcloud iam service-accounts create agent-runtime --display-name="Agent (Cloud Run runtime)"
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
```

Let **Cloud Build** build your source (new projects build as the Compute Engine default service account):

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/run.builder --condition=None
```

**Deploy.** Cloud Build builds the `Dockerfile`, pushes the image to Artifact Registry and starts the
service (3–5 minutes):

```bash
gcloud run deploy agent --source . --region $REGION \
  --service-account $RUNTIME_SA \
  --set-secrets NUXT_GEMINI_API_KEY=gemini-api-key:latest \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --cpu-boost --timeout 900 --quiet
```

| Flag | Why |
| --- | --- |
| `--min-instances 0` | Scale to zero: no requests, no instances, no cost |
| `--max-instances 2` | Caps cost if someone finds your URL |
| `--cpu-boost` | Extra CPU while starting, for faster cold starts |
| `--timeout 900` | An agent turn can call up to 10 tools in a row |
| `--set-secrets` | Mounts the secret as `NUXT_GEMINI_API_KEY` at runtime |

Open your agent:

```bash
export URL=$(gcloud run services describe agent --region $REGION --format='value(status.url)')
echo $URL
```

Or test it from the terminal. The reply streams back as JSON lines:

```bash
curl -s -X POST $URL/api/chat -H 'content-type: application/json' \
  -d "{\"id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"messages\":[{\"role\":\"user\",\"text\":\"Xin chào! Reply in one sentence.\"}]}"
```

🎤 **Voice:** open `$URL` in Chrome, click the microphone and talk. The browser gets a one-time token from
`/api/voice` and talks to the Gemini Live API directly.

### Change the Gemini API key

The key lives in Secret Manager as `gemini-api-key`. To switch keys (for example to one from a billing
project, so web search works), add a new **version** of the secret, then roll out a new revision. Cloud Run
reads `:latest` only when an instance starts.

```bash
read -rsp "New Gemini API key: " KEY && echo
printf %s "$KEY" | gcloud secrets versions add gemini-api-key --data-file=-
unset KEY
gcloud run services update agent --region $REGION --update-secrets NUXT_GEMINI_API_KEY=gemini-api-key:latest
```

Optionally, disable the old key's version (check its number first):

```bash
gcloud secrets versions list gemini-api-key
gcloud secrets versions disable 1 --secret gemini-api-key
```

In the Console instead: **Secret Manager → `gemini-api-key` → New version**, then
**Cloud Run → `agent` → Edit & deploy new revision → Deploy**. Later deploys, including GitHub Actions,
use `gemini-api-key:latest`, so they pick up the new key automatically.

## 4. (Optional) Files on Cloud Storage

Gives the agent a `save` tool that writes downloadable files.

```bash
gcloud storage buckets create gs://$PROJECT_ID-agent-files --location=$REGION --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://$PROJECT_ID-agent-files \
  --member=serviceAccount:$RUNTIME_SA --role=roles/storage.objectUser
gcloud run services update agent --region $REGION \
  --update-env-vars NUXT_GCP_PROJECT=$PROJECT_ID,NUXT_GCP_BUCKET=$PROJECT_ID-agent-files
```

Try: `Make a 3-day Đà Nẵng itinerary and save it as itinerary.md`.

## 5. (Optional) Memory, Python, shell and browser with Agent Platform

Creates an Agent Platform engine with **Memory Bank** plus **code execution**, **shell** and **computer use**
sandbox templates. These features are newer, so we use `us-central1` for them; the app stays in Singapore.

```bash
export AGENT_REGION=us-central1
gcloud services enable aiplatform.googleapis.com
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA --role=roles/aiplatform.user --condition=None
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member=serviceAccount:$RUNTIME_SA --role=roles/iam.serviceAccountTokenCreator
```

Create the engine (2–5 minutes; needs `npm ci` from part 2). Run it **once**: every run creates a new engine.

```bash
npx -y tsx scripts/setup.ts $PROJECT_ID $AGENT_REGION | tee agent-platform.env
```

> If it fails with a credentials error, run `gcloud auth application-default login`, then run it again.

Give the app the engine and redeploy the configuration:

```bash
gcloud run services update agent --region $REGION \
  --update-env-vars "$(grep '^NUXT_' agent-platform.env | paste -sd, -),NUXT_GCP_SERVICE_ACCOUNT=$RUNTIME_SA"
```

Try, in new chats:

- `Remember that my favourite food is mì Quảng`, then in a **new chat**: `What should I eat for lunch?`
- `Use Python to plot y = sin(x) * x and give me the PNG`
- `Use the shell: what OS and CPU are you running on?`
- `Browse to developers.google.com/community/gdg and tell me what's on the page`

## 6. Add your own Genkit tool

Give the agent live weather, from the free [Open-Meteo](https://open-meteo.com) API (no key needed).

```bash
cat > server/genkit/tools/weather.ts <<'EOF'
import { z } from 'genkit'
import { ai } from '..'

/** Current weather for a city, from the free Open-Meteo API (no key needed). */
export const weather = ai.defineTool(
  {
    name: 'weather',
    description: 'Get the current weather for a city.',
    inputSchema: z.object({ city: z.string().describe('City name, e.g. "Da Nang"') }),
  },
  async ({ city }) => {
    const geo = await $fetch<{ results?: { name: string, country: string, latitude: number, longitude: number }[] }>(
      'https://geocoding-api.open-meteo.com/v1/search', { query: { name: city, count: 1 } })
    const place = geo.results?.[0]
    if (!place) return { error: `City not found: ${city}` }
    const { current } = await $fetch<{ current: Record<string, number> }>('https://api.open-meteo.com/v1/forecast', {
      query: { latitude: place.latitude, longitude: place.longitude, current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation' },
    })
    return { place: `${place.name}, ${place.country}`, ...current }
  },
)
EOF
```

Register it with the agent:

```bash
sed -i "s#^import { shell } from './shell'#import { shell } from './shell'\nimport { weather } from './weather'#; s#^    search,#    search,\n    weather,#" server/genkit/tools/index.ts
cat server/genkit/tools/index.ts
```

Test it locally (Web Preview → port 8080, Dev UI → port 4000), then **Ctrl+C**:

```bash
npm run build && PORT=8080 NUXT_GEMINI_API_KEY=$GEMINI_API_KEY npx -y genkit-cli start --non-interactive -- node .output/server/index.mjs
```

Ask: `Should I go to Mỹ Khê beach right now?`. The model decides to call `weather` with `{ "city": "Da Nang" }`.
In the Dev UI, **Tools → weather** lets you run the tool directly. Ship it:

```bash
gcloud run deploy agent --source . --region $REGION --quiet
```

(Settings such as the secret, service account and env vars are kept from the previous revision.)

## 7. (Optional) Deploy on every merged PR with GitHub Actions

`.github/workflows/deploy.yml` lints, typechecks, builds the image and deploys to Cloud Run **when a pull request
is merged into `main`** (or when you click **Run workflow**). GitHub signs in to Google Cloud with
**Workload Identity Federation**: no service account keys, and only your repository is trusted.

1. **Fork** this repository on GitHub, then in your fork open the **Actions** tab and click
   **I understand my workflows, go ahead and enable them**.
2. In Cloud Shell, run the one-time setup with **your fork's name**. It is safe to re-run, and it reuses what
   parts 3–4 created:
   ```bash
   bash scripts/cloud-run-setup.sh $PROJECT_ID YOUR_GITHUB_USER/gdg-cloud-da-nang-devfest-2026-genkit $REGION
   ```
   It creates an Artifact Registry repo, an `agent-deployer` service account and a Workload Identity pool,
   then prints the variables to set.
3. In your fork: **Settings → Secrets and variables → Actions → Variables** → add `GCP_PROJECT`,
   `GCP_PROJECT_NUMBER` and `GCP_REGION`. If you did part 5, also add `NUXT_GCP_LOCATION`,
   `NUXT_GCP_ENGINE`, `NUXT_GCP_SHELL_TEMPLATE` and `NUXT_GCP_BROWSER_TEMPLATE` from
   `cat agent-platform.env`. The workflow sets every env var on each deploy, so missing ones turn features off.
4. Make a change on a branch and open a PR. For example, on GitHub edit `server/genkit/flows/chat.ts` and
   change `You are a helpful assistant.` to `You are a friendly guide to Đà Nẵng.` → **Create a new branch** →
   **Propose changes**.
   - ⚠️ On the PR page, set **base repository** to **your fork** (GitHub suggests the original repo).
5. **Merge** the PR → **Actions** → **Deploy**. The URL is in the run summary.

## 8. Clean up

Easiest, if you created the project only for this codelab:

```bash
gcloud projects delete $PROJECT_ID
```

Or delete just what you created:

```bash
gcloud run services delete agent --region $REGION --quiet
gcloud artifacts repositories delete cloud-run-source-deploy --location $REGION --quiet
gcloud secrets delete gemini-api-key --quiet
gcloud storage rm -r gs://$PROJECT_ID-agent-files                    # part 4 / 7
gcloud artifacts repositories delete agent --location $REGION --quiet # part 7
# part 5: the Agent Platform engine, with its memories and sandboxes
source agent-platform.env && curl -X DELETE -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://$NUXT_GCP_LOCATION-aiplatform.googleapis.com/v1beta1/$NUXT_GCP_ENGINE?force=true"
```

Also delete your Gemini API key in [AI Studio](https://aistudio.google.com/apikey) if you no longer need it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `search` fails with `429 RESOURCE_EXHAUSTED` | Grounding needs a key from a project with billing. Create one in AI Studio on your billing project, then follow [Change the Gemini API key](#change-the-gemini-api-key) |
| `503 ... experiencing high demand` | Gemini is busy, try again in a minute. Or use another model: `gcloud run services update agent --region $REGION --update-env-vars NUXT_MODEL=gemini-3.5-flash` |
| Deploy: `PERMISSION_DENIED` from Cloud Build | Re-run the `roles/run.builder` command in part 3 and wait a minute |
| Deploy: `allUsers ... permitted customer` (organization policy) | Your organization blocks public services. Deploy without `--allow-unauthenticated`, then `gcloud run services proxy agent --region $REGION --port 8080` and use Web Preview on 8080 |
| Variables are empty after Cloud Shell reconnects | Paste the blocks from part 1 again |
| Dev UI shows no flows | Send one chat message in the app first; Genkit loads with the first request |
| Agent Platform tools don't appear | Check `gcloud run services describe agent --region $REGION --format='yaml(spec.template.spec.containers[0].env)'` lists `NUXT_GCP_ENGINE` |
| Logs | `gcloud run services logs read agent --region $REGION --limit 50` |

---

## Reference

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
`NUXT_GEMINI_API_KEY` you get chat, web search and voice.

### Layout

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
scripts/cloud-run-setup.sh   one-time GitHub Actions → Cloud Run setup (part 7)
.github/workflows/deploy.yml merged PR → Cloud Run
```

### Develop on your machine

```bash
cp .env.example .env   # set NUXT_GEMINI_API_KEY
npm install
npm run dev            # or: npx genkit-cli start -- npm run dev   (Dev UI on :4000)
```

`npm run lint`, `npm run typecheck`, `npm run build`.

### GitHub Actions variables

Required: `GCP_PROJECT`, `GCP_PROJECT_NUMBER`, `GCP_REGION`. Optional: `NUXT_GCP_LOCATION` (Agent Platform
region, defaults to `GCP_REGION`), `NUXT_GCP_ENGINE`, `NUXT_GCP_SHELL_TEMPLATE`, `NUXT_GCP_BROWSER_TEMPLATE`,
`NUXT_MODEL`, `NUXT_LIVE_MODEL`, `MAX_INSTANCES` (default 3), and `AUTH_URL` (the service URL) to turn on
Google sign-in. Sign-in also needs the `auth-secret`, `auth-google-client-id` and `auth-google-client-secret`
secrets (readable by `agent-runtime`) and `<AUTH_URL>/api/auth/callback/google` as an OAuth redirect URI.
`scripts/cloud-run-setup.sh ... --agent-platform` (with `AGENT_REGION=us-central1` to pick the engine region)
also creates the Agent Platform engine and prints its variables.

### Notes

- Chat history is in the browser (localStorage). A chat's sandboxes are named after it (`code:<chatId>`),
  cached in memory per instance and otherwise looked up through the API, so they survive scale to zero
  and are shared across instances.
- `/api/voice` and `/api/chat` are open to any visitor, even with sign-in on. Keep `--max-instances` low or add
  rate limiting before sharing the URL widely.
- Live API ephemeral tokens need the Gemini Developer API key, not Vertex AI.
