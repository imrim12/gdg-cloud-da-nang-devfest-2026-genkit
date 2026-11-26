#!/usr/bin/env bash
# One-time Google Cloud setup for deploying with .github/workflows/deploy.yml.
# Safe to re-run: existing resources are kept.
#
#   bash scripts/cloud-run-setup.sh <project> <github-owner/repo> [region] [--agent-platform] [--auth]
#
# Run it in Cloud Shell (or anywhere `gcloud` is logged in as a project Owner).
# --agent-platform also creates the Agent Platform engine (Memory Bank, code/shell/browser
# sandboxes) with scripts/setup.ts. Only pass it once: each run creates a new engine.
# The engine goes in AGENT_REGION (default: region), e.g. AGENT_REGION=us-central1.
# --auth sets up "Sign in with Google": it walks you through creating the OAuth client (a Console
# step, Google has no CLI or API for it) and stores its ID and secret in Secret Manager.
set -euo pipefail

AGENT_PLATFORM=
AUTH=
ARGS=()
for arg in "$@"; do
  case $arg in
    --agent-platform) AGENT_PLATFORM=1 ;;
    --auth) AUTH=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done
PROJECT=${ARGS[0]:-}
REPO=${ARGS[1]:-}
REGION=${ARGS[2]:-us-central1}
AGENT_REGION=${AGENT_REGION:-$REGION}
if [[ -z $PROJECT || $REPO != */* ]]; then
  echo "Usage: bash scripts/cloud-run-setup.sh <project> <github-owner/repo> [region] [--agent-platform] [--auth]" >&2
  exit 1
fi

# Names the workflow derives from GCP_PROJECT; keep them in sync with deploy.yml.
SERVICE=agent
RUNTIME_SA=agent-runtime@$PROJECT.iam.gserviceaccount.com
DEPLOYER_SA=agent-deployer@$PROJECT.iam.gserviceaccount.com
BUCKET=$PROJECT-agent-files
POOL=github

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }
# New service accounts and identity pools take a few seconds to become usable in IAM bindings.
# Errors are only shown if the last attempt fails too.
retry() { for i in 1 2 3 4 5 6; do "$@" >/dev/null 2>&1 && return; sleep $((i * 5)); done; "$@" >/dev/null; }
# Creates a secret, or adds a new version, readable by the runtime service account
put_secret() {
  if exists gcloud secrets describe "$1"; then
    printf %s "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null
  else
    printf %s "$2" | gcloud secrets create "$1" --replication-policy automatic --data-file=- >/dev/null
  fi
  retry gcloud secrets add-iam-policy-binding "$1" --member "serviceAccount:$RUNTIME_SA" --role roles/secretmanager.secretAccessor
}

gcloud config set project "$PROJECT" >/dev/null
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

step "Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com secretmanager.googleapis.com \
  aiplatform.googleapis.com storage.googleapis.com cloudresourcemanager.googleapis.com \
  firestore.googleapis.com

step "Artifact Registry repository: $SERVICE ($REGION)"
exists gcloud artifacts repositories describe "$SERVICE" --location "$REGION" ||
  gcloud artifacts repositories create "$SERVICE" --location "$REGION" --repository-format docker

step "Service accounts"
exists gcloud iam service-accounts describe "$RUNTIME_SA" ||
  gcloud iam service-accounts create agent-runtime --display-name "Agent (Cloud Run runtime)"
exists gcloud iam service-accounts describe "$DEPLOYER_SA" ||
  gcloud iam service-accounts create agent-deployer --display-name "Agent (GitHub Actions deployer)"

step "Runtime permissions: Agent Platform, own token signing (browse tool)"
retry gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/aiplatform.user --condition None
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/iam.serviceAccountTokenCreator

step "Files bucket: gs://$BUCKET"
exists gcloud storage buckets describe "gs://$BUCKET" ||
  gcloud storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access
retry gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/storage.objectUser

step "Firestore (chat history): (default) database in $REGION"
exists gcloud firestore databases describe --database "(default)" ||
  gcloud firestore databases create --database "(default)" --location "$REGION" --type firestore-native
retry gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/datastore.user --condition None

step "Secret: gemini-api-key"
if ! exists gcloud secrets describe gemini-api-key; then
  read -rsp "Gemini API key (from https://aistudio.google.com/apikey): " KEY && echo
  printf %s "$KEY" | gcloud secrets create gemini-api-key --replication-policy automatic --data-file=-
fi
retry gcloud secrets add-iam-policy-binding gemini-api-key --member "serviceAccount:$RUNTIME_SA" \
  --role roles/secretmanager.secretAccessor

step "Deployer permissions: Cloud Run, push images, act as the runtime account"
retry gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$DEPLOYER_SA" \
  --role roles/run.admin --condition None
retry gcloud artifacts repositories add-iam-policy-binding "$SERVICE" --location "$REGION" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/artifactregistry.writer
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$DEPLOYER_SA" \
  --role roles/iam.serviceAccountUser

step "Workload Identity Federation: only GitHub repo $REPO can deploy (no keys)"
exists gcloud iam workload-identity-pools describe "$POOL" --location global ||
  gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
exists gcloud iam workload-identity-pools providers describe github --location global --workload-identity-pool "$POOL" ||
  gcloud iam workload-identity-pools providers create-oidc github --location global --workload-identity-pool "$POOL" \
    --display-name "GitHub" --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition "assertion.repository == '$REPO'"
retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"

VARS=(GCP_PROJECT="$PROJECT" GCP_PROJECT_NUMBER="$NUMBER" GCP_REGION="$REGION")
if [[ -n $AGENT_PLATFORM ]]; then
  step "Agent Platform engine in $AGENT_REGION (Memory Bank + sandbox templates)"
  npm ci --ignore-scripts --no-audit --no-fund >/dev/null
  OUTPUT=$(npx -y tsx scripts/setup.ts "$PROJECT" "$AGENT_REGION")
  for name in NUXT_GCP_LOCATION NUXT_GCP_ENGINE NUXT_GCP_SHELL_TEMPLATE NUXT_GCP_BROWSER_TEMPLATE; do
    VARS+=("$(grep "^$name=" <<<"$OUTPUT")")
  done
fi

if [[ -n $AUTH ]]; then
  # The service URL that does not change between deploys
  URL=https://$SERVICE-$NUMBER.$REGION.run.app
  step "Sign in with Google for $URL"
  cat <<EOM
Google has no command line or API to create OAuth clients for web apps, so do these two steps in
the Console (2 minutes), then paste the client ID and secret here:

  1. Branding (once per project), set App name and support email, Audience: External
     https://console.cloud.google.com/auth/branding?project=$PROJECT
  2. Clients > Create client > Application type: Web application
     https://console.cloud.google.com/auth/clients/create?project=$PROJECT
       Authorized JavaScript origins:  $URL
       Authorized redirect URIs:       $URL/api/auth/callback/google
                                       $URL/api/connectors/callback
     (for local development also add http://localhost:3000, http://localhost:3000/api/auth/callback/google
      and http://localhost:3000/api/connectors/callback)
  3. For connectors (Gmail, Drive, Docs, Sheets), while the app is unverified: Audience > Test users >
     add the Google accounts that will connect them.
     https://console.cloud.google.com/auth/audience?project=$PROJECT

EOM
  read -rp "Client ID: " CLIENT_ID
  read -rsp "Client secret: " CLIENT_SECRET && echo
  put_secret auth-google-client-id "$CLIENT_ID"
  put_secret auth-google-client-secret "$CLIENT_SECRET"
  # Encrypts the session cookies; kept across re-runs so people stay signed in
  if exists gcloud secrets describe auth-secret; then
    retry gcloud secrets add-iam-policy-binding auth-secret --member "serviceAccount:$RUNTIME_SA" --role roles/secretmanager.secretAccessor
  else
    put_secret auth-secret "$(openssl rand -base64 32)"
  fi
  VARS+=("AUTH_URL=$URL")

  step "Connectors: Google Workspace APIs and their MCP servers"
  # Each product needs its API and its MCP service. The MCP servers are in Developer Preview: if
  # enabling them fails, join the Google Workspace Developer Preview Program, then run this again.
  gcloud services enable gmail.googleapis.com drive.googleapis.com docs.googleapis.com sheets.googleapis.com
  gcloud services enable gmailmcp.googleapis.com drivemcp.googleapis.com docsmcp.googleapis.com sheetsmcp.googleapis.com ||
    echo "Could not enable the Workspace MCP services (Developer Preview). Connectors stay off until they are enabled." >&2
fi

step "Done. Set these GitHub repository variables (Settings > Secrets and variables > Actions > Variables)"
for var in "${VARS[@]}"; do echo "  $var"; done
echo
echo "Or with the GitHub CLI:"
for var in "${VARS[@]}"; do echo "  gh variable set ${var%%=*} --repo $REPO --body '${var#*=}'"; done
echo
echo "Then merge a pull request into main (or run Actions > Deploy by hand) to deploy."
