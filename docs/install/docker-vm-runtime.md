---
summary: "Shared Docker VM runtime steps for long-lived MangabaClaw Gateway hosts"
doc-schema-version: 1
read_when:
  - You are deploying MangabaClaw on a cloud VM with Docker
  - You need the shared setup, binary bake, persistence, and update flow
title: "Docker VM runtime"
---

Use this runtime flow after provisioning a VM and installing Docker. Provider
guides such as [GCP](/install/gcp) and [Hetzner](/install/hetzner) own VM
creation, firewall rules, SSH access, and the tunnel back to your laptop. This
page owns the Docker setup shared by those hosts.

## Before you begin

You need:

- A Debian or Ubuntu VM with Docker Engine and Docker Compose v2
- At least 2 GB RAM for a source image build; 4 GB is more reliable
- The MangabaClaw source checkout on the VM
- Provider and model credentials for onboarding
- An SSH-only or otherwise restricted provider firewall; do not expose the
  Gateway port directly to the public Internet

From the VM:

```bash
git clone https://github.com/mangabaclaw/mangabaclaw.git
cd mangabaclaw
docker --version
docker compose version
```

## Prepare persistent host state

The maintained setup script defaults state to the current VM user's home:

```bash
export MANGABACLAW_CONFIG_DIR="$HOME/.mangabaclaw"
export MANGABACLAW_WORKSPACE_DIR="$HOME/.mangabaclaw/workspace"
export MANGABACLAW_AUTH_PROFILE_SECRET_DIR="$HOME/.mangabaclaw-auth-profile-secrets"
```

Override those paths before setup if your VM uses a dedicated data disk. Keep
all three directories in backups. The auth-profile secret directory contains
the local encryption key for OAuth-backed auth profile token material, so it
must persist but remain separate from `MANGABACLAW_CONFIG_DIR`.

## Run the maintained Docker setup

```bash
./scripts/docker/setup.sh
```

The script creates the host directories, builds `mangabaclaw:local`, runs
onboarding, generates a Gateway token, synchronizes `.env`, and starts the
Gateway through the repository's `docker-compose.yml`. The Compose file pins
container-side state to `/home/node/.mangabaclaw` while using the host paths above
as bind-mount sources.

To use an official prebuilt image instead of building from source:

```bash
export MANGABACLAW_IMAGE="ghcr.io/mangabaclaw/mangabaclaw:latest"
./scripts/docker/setup.sh
```

For unattended setup, provider SecretRefs, extra mounts, sandbox setup, and all
supported environment variables, use the full [Docker guide](/install/docker).

<Warning>
`MANGABACLAW_GATEWAY_BIND=lan` is the normal container setting: `loopback` would
limit the Gateway to the container's own network namespace. Keep the published
host port private with the cloud firewall, then reach it through the SSH tunnel
from the provider guide.
</Warning>

## Bake required binaries into the image

Installing binaries inside a running container is a trap: anything installed
at runtime is lost on restart. Bake every external binary a skill needs into
the image at build time.

The examples below cover three binaries only, alphabetically:

- `gog` (from `gogcli`) for Gmail access
- `goplaces` for Google Places
- `wacli` for WhatsApp

These are examples, not a complete list. Docker Compose builds the repo-root
`Dockerfile`, so extend that file rather than creating a standalone example or
replacing its contents. The repository Dockerfile has required
`workspace-deps`, build, runtime-assets, and final runtime stages. Its manifest
extraction covers the `packages/*` and selected plugin workspaces before
`pnpm install --frozen-lockfile`.

For Debian packages, prefer the existing build argument:

```bash
export MANGABACLAW_IMAGE_APT_PACKAGES="socat"
```

For downloaded release binaries such as `gog`, `goplaces`, or `wacli`, add the
download and install commands to the repo-root `Dockerfile` final runtime stage,
after its package-install blocks and before `USER node`. Preserve the existing
non-root uid 1000 setup, `tini` entrypoint, health check, and `mangabaclaw` symlink.

<Note>
The repository Dockerfile digest-pins its Node and Bun base images. Keep those
reviewed pins instead of changing them to floating `FROM node:24-bookworm`
references. For ARM-based VMs, choose `arm64` release assets for extra binaries;
for reproducible builds, use versioned asset URLs and verify their checksums.
</Note>

Rebuild the customized image without repeating onboarding:

```bash
MANGABACLAW_SKIP_ONBOARDING=1 ./scripts/docker/setup.sh
```

If the build fails with `Killed` or exit code 137 during dependency installation
or bundling, the VM is out of memory. Resize it before retrying.

Verify baked binaries:

```bash
docker compose exec mangabaclaw-gateway which gog
docker compose exec mangabaclaw-gateway which goplaces
docker compose exec mangabaclaw-gateway which wacli
```

## Verify and administer the Gateway

```bash
docker compose ps
docker compose logs --tail=100 mangabaclaw-gateway
curl -fsS http://127.0.0.1:18789/healthz
docker compose run --rm mangabaclaw-cli dashboard --no-open
```

`/healthz` returning a 200 response confirms that the Gateway process is
listening. The image `HEALTHCHECK` polls the same endpoint. If the Control UI
requires device approval:

```bash
docker compose run --rm mangabaclaw-cli devices list
docker compose run --rm mangabaclaw-cli devices approve <requestId>
```

## What persists where

MangabaClaw runs in Docker, but the container filesystem is not the source of
truth. Long-lived state must survive restarts, rebuilds, and reboots.

| Component            | Container location                  | Persistence mechanism       | Notes                                                                      |
| -------------------- | ----------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Gateway state/config | `/home/node/.mangabaclaw/`             | `MANGABACLAW_CONFIG_DIR` mount | Includes `mangabaclaw.json`, shared state, and installed plugin package roots |
| Agent workspace      | `/home/node/.mangabaclaw/workspace/`   | Workspace mount             | Code and agent artifacts                                                   |
| Channel credentials  | `/home/node/.mangabaclaw/credentials/` | Config mount                | Channel credential material                                                |
| Model auth profiles  | `/home/node/.mangabaclaw/agents/`      | Config mount                | `agents/<agentId>/agent/auth-profiles.json`                                |
| Auth-profile key     | `/home/node/.config/mangabaclaw/`      | Secret-directory mount      | Encryption key material; keep separate from the config mount               |
| Skill state          | `/home/node/.mangabaclaw/skills/`      | Config mount                | Skill-level state                                                          |
| External binaries    | `/usr/local/bin/`                   | Docker image                | Must be baked at build time                                                |
| Node and OS packages | Container filesystem                | Docker image                | Rebuilt with the image; do not install at runtime                          |
| Docker container     | Ephemeral                           | Restartable                 | Safe to replace after mounted state is verified                            |

## Update MangabaClaw

For a source-built image:

```bash
git pull --ff-only
MANGABACLAW_SKIP_ONBOARDING=1 ./scripts/docker/setup.sh
docker compose run --rm mangabaclaw-cli doctor --json
```

For a pinned or prebuilt image, update `MANGABACLAW_IMAGE` to the intended tag or
digest before rerunning the setup script. Routine image upgrades run startup-safe
migrations against the mounted state; see [Upgrading container images](/install/docker#upgrading-container-images)
for recovery when a migration cannot complete automatically.

## Related

- [Docker](/install/docker)
- [Podman](/install/podman)
- [ClawDock](/install/clawdock)
