---
summary: "Where MangabaClaw loads environment variables and the precedence order"
read_when:
  - You need to know which env vars are loaded, and in what order
  - You are debugging missing API keys in the Gateway
  - You are documenting provider auth or deployment environments
title: "Environment variables"
---

MangabaClaw pulls environment variables from multiple sources. The normal rule is **never override existing values**. For an MangabaClaw-installed systemd service, the global `.env` may replace only service values that MangabaClaw recorded as managed; operator-owned service values still take precedence.
Workspace `.env` files are a lower-trust source: MangabaClaw ignores provider credentials and protected runtime controls from workspace `.env` before applying precedence.

## Precedence (highest to lowest)

1. **Process environment** (what the Gateway process already has from the parent shell/daemon).
2. **`.env` in the current working directory** (dotenv default; does not override; provider credentials and protected runtime controls are ignored).
3. **Global `.env`** at `~/.mangabaclaw/.env` (aka `$MANGABACLAW_STATE_DIR/.env`; recommended for provider API keys; does not override except for recorded MangabaClaw-managed systemd service values).
4. **Config `env` block** in `~/.mangabaclaw/mangabaclaw.json` (applied only if missing).
5. **Optional login-shell import** (`env.shellEnv.enabled` or `MANGABACLAW_LOAD_SHELL_ENV=1`), applied only for missing expected keys.

On fresh Ubuntu installs that use the default state dir, MangabaClaw also treats `~/.config/mangabaclaw/gateway.env` as a compatibility fallback after the global `.env`. If both files exist and disagree, MangabaClaw keeps `~/.mangabaclaw/.env` and prints a warning.

If the config file is missing entirely, step 4 is skipped; shell import still runs if enabled.

## Supported operator-facing variables

The variables below are the supported environment contract for operators. Undocumented `MANGABACLAW_*` variables are internal implementation details and may disappear without notice.

### Paths and instances

| Variable                 | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `MANGABACLAW_HOME`          | Override the home directory used for MangabaClaw path defaults.      |
| `MANGABACLAW_STATE_DIR`     | Override the mutable state directory.                             |
| `MANGABACLAW_CONFIG_PATH`   | Override the active config file path.                             |
| `MANGABACLAW_WORKSPACE_DIR` | Override the default agent workspace.                             |
| `MANGABACLAW_PROFILE`       | Select a named profile and its isolated defaults.                 |
| `MANGABACLAW_GIT_DIR`       | Override the source checkout used by development-channel updates. |
| `MANGABACLAW_INCLUDE_ROOTS` | Allow `$include` to resolve from additional roots.                |

### Gateway and authentication

| Variable                    | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `MANGABACLAW_GATEWAY_URL`      | Override the remote Gateway URL used by clients.                |
| `MANGABACLAW_GATEWAY_PORT`     | Override the local Gateway port.                                |
| `MANGABACLAW_GATEWAY_TOKEN`    | Supply token authentication for Gateway servers and clients.    |
| `MANGABACLAW_GATEWAY_PASSWORD` | Supply password authentication for Gateway servers and clients. |

### Provider credentials

Core and bundled provider plugins recognize the following credential and provider-selection variables. Prefer each provider's config or SecretRef fields when you need scoped credentials rather than one process-wide value.

`AI_GATEWAY_API_KEY`, `ANTHROPIC_ADMIN_API_KEY`, `ANTHROPIC_ADMIN_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN`, `ARCEEAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_SPEECH_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `BASETEN_API_KEY`, `BRAVE_API_KEY`, `BYTEPLUS_API_KEY`, `BYTEPLUS_SEED_SPEECH_API_KEY`, `CEREBRAS_API_KEY`, `CHUTES_API_KEY`, `CHUTES_OAUTH_TOKEN`, `CLAWROUTER_API_KEY`, `CLOUDFLARE_AI_GATEWAY_API_KEY`, `CODEX_API_KEY`, `COHERE_API_KEY`, `COMFY_API_KEY`, `COMFY_CLOUD_API_KEY`, `COPILOT_GITHUB_TOKEN`, `DASHSCOPE_API_KEY`, `DEEPGRAM_API_KEY`, `DEEPINFRA_API_KEY`, `DEEPSEEK_API_KEY`, `ELEVENLABS_API_KEY`, `EXA_API_KEY`, `FAL_API_KEY`, `FAL_KEY`, `FEATHERLESS_API_KEY`, `FIRECRAWL_API_KEY`, `FIREWORKS_API_KEY`, `GCLOUD_PROJECT`, `GEMINI_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`, `GMI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_API_KEY`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLOUD_PROJECT`, `GRADIUM_API_KEY`, `GROQ_API_KEY`, `HF_TOKEN`, `HUGGINGFACE_HUB_TOKEN`, `INWORLD_API_KEY`, `KILOCODE_API_KEY`, `KIMICODE_API_KEY`, `KIMI_API_KEY`, `LITELLM_API_KEY`, `LM_API_TOKEN`, `LONGCAT_API_KEY`, `MINIMAX_API_KEY`, `MINIMAX_CODE_PLAN_KEY`, `MINIMAX_CODING_API_KEY`, `MINIMAX_OAUTH_TOKEN`, `MISTRAL_API_KEY`, `MODELSTUDIO_API_KEY`, `MODEL_API_KEY`, `MOONSHOT_API_KEY`, `NOVITA_API_KEY`, `NVIDIA_API_KEY`, `OLLAMA_API_KEY`, `OPENAI_ADMIN_KEY`, `OPENAI_API_KEY`, `OPENCODE_API_KEY`, `OPENCODE_ZEN_API_KEY`, `OPENROUTER_API_KEY`, `PARALLEL_API_KEY`, `PERPLEXITY_API_KEY`, `PIXVERSE_API_KEY`, `QIANFAN_API_KEY`, `QWEN_API_KEY`, `QWEN_TOKEN_PLAN_API_KEY`, `RUNWAYML_API_SECRET`, `RUNWAY_API_KEY`, `SENSEAUDIO_API_KEY`, `SGLANG_API_KEY`, `SPEECH_KEY`, `SPEECH_REGION`, `STEPFUN_API_KEY`, `SYNTHETIC_API_KEY`, `TAVILY_API_KEY`, `TOGETHER_API_KEY`, `TOKENHUB_API_KEY`, `TOKENPLAN_API_KEY`, `VENICE_API_KEY`, `VLLM_API_KEY`, `VOLCANO_ENGINE_API_KEY`, `VOLCENGINE_TTS_API_KEY`, `VOLCENGINE_TTS_APPID`, `VOLCENGINE_TTS_TOKEN`, `VOYAGE_API_KEY`, `VYDRA_API_KEY`, `XAI_API_KEY`, `XIAOMI_API_KEY`, `XIAOMI_TOKEN_PLAN_API_KEY`, `XI_API_KEY`, `ZAI_API_KEY`, and `Z_AI_API_KEY`.

Installed third-party plugins may declare additional credential variables in their plugin manifests; those variables are contracts of the plugin that declares them, not core MangabaClaw variables.

### Logging and diagnostics

| Variable                             | Purpose                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `MANGABACLAW_LOG_LEVEL`                 | Override file and console log levels.                         |
| `MANGABACLAW_DEBUG_MODEL_TRANSPORT`     | Enable model transport timing diagnostics.                    |
| `MANGABACLAW_DEBUG_MODEL_PAYLOAD`       | Select redacted model payload diagnostics.                    |
| `MANGABACLAW_DEBUG_SSE`                 | Select SSE timing or event-peek diagnostics.                  |
| `MANGABACLAW_DEBUG_CODE_MODE`           | Enable code-mode surface diagnostics.                         |
| `MANGABACLAW_DIAGNOSTICS`               | Enable named diagnostic flags, or disable all flags with `0`. |
| `MANGABACLAW_DIAGNOSTICS_TIMELINE_PATH` | Select the JSONL path for timeline diagnostics.               |
| `MANGABACLAW_DIAGNOSTICS_EVENT_LOOP`    | Add event-loop samples to timeline diagnostics.               |

### Feature and runtime toggles

| Variable                             | Purpose                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `MANGABACLAW_LOAD_SHELL_ENV`            | Import missing expected variables from the login shell.                      |
| `MANGABACLAW_SHELL_ENV_TIMEOUT_MS`      | Set the login-shell import timeout.                                          |
| `MANGABACLAW_EXEC_SHELL_SNAPSHOT`       | Disable exec shell snapshots with `0`.                                       |
| `MANGABACLAW_OFFLINE`                   | Prevent downloads of pinned agent helper binaries.                           |
| `MANGABACLAW_BROWSER_HEADLESS`          | Force managed browser launches headed (`0`) or headless (`1`).               |
| `MANGABACLAW_DISABLE_BONJOUR`           | Force Bonjour advertising on (`0`) or off (`1`).                             |
| `MANGABACLAW_NO_AUTO_UPDATE`            | Disable automatic update applies.                                            |
| `MANGABACLAW_ALLOW_INSECURE_PRIVATE_WS` | Allow trusted private-DNS `ws://` connections as a break-glass override.     |
| `MANGABACLAW_ALLOW_MULTI_GATEWAY`       | Allow multiple Gateway processes while preserving per-state ownership locks. |
| `MANGABACLAW_SKIP_CHANNELS`             | Start the Gateway without channel transports for troubleshooting.            |
| `MANGABACLAW_THEME`                     | Force the TUI palette to `light` or `dark`.                                  |

## Provider credentials and workspace `.env`

Do not keep provider API keys only in a workspace `.env`. MangabaClaw blocks a large set of provider credential and endpoint-redirect keys from workspace `.env` files, including every known provider auth env var (for example `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`), plus any key ending in `_API_HOST`, `_BASE_URL`, `_ENDPOINT`, or `_HOMESERVER`, and the entire `MANGABACLAW_*`, `CLAWHUB_*`, `ANTHROPIC_API_KEY_*`, and `OPENAI_API_KEY_*` namespaces.

Use one of these trusted sources for provider credentials instead:

- The Gateway process environment, such as a shell, launchd/systemd unit, container secret, or CI secret.
- The global runtime dotenv file at `~/.mangabaclaw/.env` or `$MANGABACLAW_STATE_DIR/.env`.
- The config `env` block in `~/.mangabaclaw/mangabaclaw.json`.
- Optional login-shell import when `env.shellEnv.enabled` or `MANGABACLAW_LOAD_SHELL_ENV=1` is enabled.

If you previously stored provider keys or endpoint routing values only in a workspace `.env`, move them to one of the trusted sources above. Workspace `.env` can still provide ordinary project variables that are not credentials, endpoint redirects, host overrides, or `MANGABACLAW_*` runtime controls.

See [Workspace `.env` files](/gateway/security#workspace-env-files) for the security rationale.

## Config `env` block

Set inline env vars under `env.vars` (values are non-overriding):

```json5
{
  env: {
    vars: {
      OPENROUTER_API_KEY: "sk-or-...",
      GROQ_API_KEY: "gsk-...",
    },
  },
}
```

The config `env.vars` block accepts literal string values only. It does not expand
`file:...` values; for example, `XAI_API_KEY: "file:secrets/xai-api-key.txt"`
is passed to providers as that exact string.

For file-backed provider keys, use a SecretRef on the credential field that
supports it:

```json5
{
  secrets: {
    providers: {
      xai_key_file: {
        source: "file",
        path: "~/.mangabaclaw/secrets/xai-api-key.txt",
        mode: "singleValue",
      },
    },
  },
  models: {
    providers: {
      xai: {
        apiKey: { source: "file", provider: "xai_key_file", id: "value" },
      },
    },
  },
}
```

See [Secrets Management](/gateway/secrets) and the
[SecretRef credential surface](/reference/secretref-credential-surface) for
supported fields.

## Shell env import

`env.shellEnv` runs your login shell and imports only **missing** expected keys:

```json5
{
  env: {
    shellEnv: {
      enabled: true,
      timeoutMs: 15000,
    },
  },
}
```

Env var equivalents:

- `MANGABACLAW_LOAD_SHELL_ENV=1`
- `MANGABACLAW_SHELL_ENV_TIMEOUT_MS=15000` (default `15000`)

For Bash, the import uses an interactive login shell (`bash -lic`) so `PS1` is initialized
before login startup files run. Bash reads `/etc/profile` and the first available user login
profile (`~/.bash_profile`, `~/.bash_login`, or `~/.profile`); many login profiles also source
`~/.bashrc`. Keep those files quiet and bounded because their output, long-running work, or
failures can affect MangabaClaw startup. Other shells use noninteractive login startup (`-l -c`).
This interactive Bash mode is limited to explicit shell env imports; automatic executable PATH
discovery during ordinary Gateway commands remains noninteractive.

## Exec shell snapshots

On non-Windows Gateway hosts, bash and zsh `exec` commands use a startup snapshot by default.
Set `MANGABACLAW_EXEC_SHELL_SNAPSHOT=0` in the Gateway process environment to disable this path.
Values `false`, `no`, and `off` also disable it. Per-call `exec.env` values cannot toggle
snapshots or redirect the snapshot cache.

## Runtime-injected env vars

MangabaClaw also injects context markers into spawned child processes:

- `MANGABACLAW_SHELL=exec`: set for commands run through the `exec` tool.
- `MANGABACLAW_SHELL=acp-client`: set for `mangabaclaw acp client` when it spawns the ACP bridge process.
- `MANGABACLAW_SHELL=tui-local`: set for local TUI `!` shell commands.
- `MANGABACLAW_CLI=1`: set for child processes spawned by the CLI entry point.

These are runtime markers (not required user config). They can be used in shell/profile logic
to apply context-specific rules.

## UI env vars

- `MANGABACLAW_THEME=light`: force the light TUI palette when your terminal has a light background.
- `MANGABACLAW_THEME=dark`: force the dark TUI palette.
- `COLORFGBG`: if your terminal exports it, MangabaClaw uses the background color hint to auto-pick the TUI palette.

## Env var substitution in config

You can reference env vars directly in config string values using `${VAR_NAME}` syntax:

```json5
{
  models: {
    providers: {
      "vercel-gateway": {
        apiKey: "${VERCEL_GATEWAY_API_KEY}",
      },
    },
  },
}
```

A missing or empty variable remains visible as `${VAR_NAME}` and emits a warning. Consumers that require the value treat it as unavailable. Use `$${VAR_NAME}` when the literal `${VAR_NAME}` text is intended.

See [Configuration: Env var substitution](/gateway/configuration-reference#env-var-substitution) for full details.

## Secret refs vs `${ENV}` strings

MangabaClaw supports two env-driven patterns:

- `${VAR}` string substitution in config values.
- SecretRef objects (`{ source: "env", provider: "default", id: "VAR" }`) for fields that support secrets references.

Both resolve from process env at activation time. SecretRef details are documented in [Secrets Management](/gateway/secrets).
The config `env` block itself does not resolve SecretRefs or `file:...`
shorthand values.

## Path-related env vars

| Variable                 | Purpose                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MANGABACLAW_HOME`          | Override the home directory used for internal MangabaClaw path defaults (`~/.mangabaclaw/`, agent dirs, sessions, credentials, installer onboarding, and the default dev checkout). Useful when running MangabaClaw as a dedicated service user. |
| `MANGABACLAW_STATE_DIR`     | Override the state directory (default `~/.mangabaclaw`).                                                                                                                                                                                   |
| `MANGABACLAW_CONFIG_PATH`   | Override the config file path (default `~/.mangabaclaw/mangabaclaw.json`).                                                                                                                                                                    |
| `MANGABACLAW_INCLUDE_ROOTS` | Path-list of directories where `$include` directives may resolve files outside the config directory (default: none - `$include` is confined to the config dir). Tilde-expanded.                                                         |

## Agent helper tool downloads

Set `MANGABACLAW_OFFLINE=1` to prevent MangabaClaw from downloading its pinned `fd`
and `ripgrep` helper binaries. Existing helpers under the MangabaClaw tools
directory and working system binaries remain eligible; a missing helper stays
unavailable instead of triggering a network request.

## Logging

| Variable                         | Purpose                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MANGABACLAW_LOG_LEVEL`             | Override log level for both file and console (e.g. `debug`, `trace`). Takes precedence over `logging.level` and `logging.consoleLevel` in config. Invalid values are ignored with a warning. |
| `MANGABACLAW_DEBUG_MODEL_TRANSPORT` | Emit targeted model request/response timing diagnostics at `info` level without enabling global debug logs.                                                                                  |
| `MANGABACLAW_DEBUG_MODEL_PAYLOAD`   | Model payload diagnostics: `summary`, `tools`, or `full-redacted`. `full-redacted` is capped and redacted but may include prompt/message text.                                               |
| `MANGABACLAW_DEBUG_SSE`             | Streaming diagnostics: `events` for first/done timing, `peek` to include the first five redacted SSE events.                                                                                 |
| `MANGABACLAW_DEBUG_CODE_MODE`       | Code-mode model-surface diagnostics, including provider-tool hiding and compact control/direct enforcement.                                                                                  |

### `MANGABACLAW_HOME`

When set, `MANGABACLAW_HOME` replaces the system home directory (`$HOME` / `os.homedir()`) for internal MangabaClaw path defaults. This includes the default state directory, config path, agent directories, credentials, installer onboarding workspace, and the default dev checkout used by `mangabaclaw update --channel dev`.

`MANGABACLAW_HOME` does not grant ownership of the OS account's native Gateway service. Gateway service-management commands treat a relocated home as isolated state; use the OS account home and a named profile when a separate native service identity is required.

**Precedence:** `MANGABACLAW_HOME` > `$HOME` > `USERPROFILE` > Termux `PREFIX` home fallback on Android > `os.homedir()`

**Example** (macOS LaunchDaemon):

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>MANGABACLAW_HOME</key>
  <string>/Users/user</string>
</dict>
```

`MANGABACLAW_HOME` can also be set to a tilde path (e.g. `~/svc`), which gets expanded using the same OS home fallback chain before use.

Explicit path variables such as `MANGABACLAW_STATE_DIR`, `MANGABACLAW_CONFIG_PATH`, and `MANGABACLAW_GIT_DIR` still take precedence. OS-account tasks such as shell startup file detection, package-manager setup, and host `~` expansion may still use the real system home.

## nvm users: web_fetch TLS failures

If Node.js was installed via **nvm** (not the system package manager), the built-in `fetch()` uses
nvm's bundled CA store, which may be missing modern root CAs (ISRG Root X1/X2 for Let's Encrypt,
DigiCert Global Root G2, etc.). This causes `web_fetch` to fail with `"fetch failed"` on most HTTPS sites.

On Linux, MangabaClaw automatically detects nvm and applies the fix in the actual startup environment:

- `mangabaclaw gateway install` writes `NODE_EXTRA_CA_CERTS` into the systemd service environment
- the `mangabaclaw` CLI entrypoint re-execs itself with `NODE_EXTRA_CA_CERTS` set before Node startup

**Manual fix (for older versions or direct `node ...` launches):**

Export the variable before starting MangabaClaw:

```bash
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
mangabaclaw gateway run
```

Do not rely on writing only to `~/.mangabaclaw/.env` for this variable; Node reads
`NODE_EXTRA_CA_CERTS` at process startup.

## Legacy environment variables

MangabaClaw only reads `MANGABACLAW_*` environment variables. The legacy
`CLAWDBOT_*` and `MOLTBOT_*` prefixes from earlier releases are silently
ignored.

If any are still set on the Gateway process at startup, MangabaClaw emits a
single Node deprecation warning (`MANGABACLAW_LEGACY_ENV_VARS`) listing the
detected prefixes and the total count. Rename each value by replacing the
legacy prefix with `MANGABACLAW_` (for example `CLAWDBOT_GATEWAY_TOKEN` to
`MANGABACLAW_GATEWAY_TOKEN`); the old names take no effect.

## Related

- [Gateway configuration](/gateway/configuration)
- [FAQ: env vars and .env loading](/help/faq#env-vars-and-env-loading)
- [Models overview](/concepts/models)
