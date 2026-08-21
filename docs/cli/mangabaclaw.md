---
summary: "CLI reference and security model for the inference-backed MangabaClaw setup and repair helper"
read_when:
  - You finished inference setup and want MangabaClaw to configure the rest
  - You need to inspect or repair MangabaClaw with the local setup agent
  - You are designing or enabling message-channel rescue mode
title: "MangabaClaw setup agent"
---

# `mangabaclaw setup`

MangabaClaw ships with a built-in system agent — it speaks as "MangabaClaw" — for
local setup, repair, and configuration (formerly called Crestodian). It starts only after the effective default model completes a real turn.
Fresh installs establish inference first; malformed config stays on the
classic doctor path.

## When it starts

Running `mangabaclaw` with no subcommand routes based on config state:

- Config missing, or exists with no authored settings (empty, or only `$schema`/`meta` keys): starts guided onboarding with live AI verification.
- Config exists but fails validation: starts classic onboarding, which reports the issues and directs you to `mangabaclaw doctor`.
- Config exists and is valid: opens the normal agent TUI. A reachable
  configured Gateway whose default agent has a model goes directly to that UI
  without onboarding or MangabaClaw. Use `/mangabaclaw` inside the TUI, or run
  `mangabaclaw setup` directly, to reach MangabaClaw later.

Running `mangabaclaw setup` first live-tests the configured default model. A passing turn starts MangabaClaw. An interactive failure opens guided inference setup and hands off to MangabaClaw after a candidate passes. One-shot, JSON, and other noninteractive requests fail with instructions to run `mangabaclaw onboard` when inference is unavailable. `mangabaclaw --help` and `mangabaclaw --version` keep their normal fast paths.

Noninteractive bare `mangabaclaw` (no TTY) exits with a short message instead of printing root help: it points to non-interactive onboarding on a fresh or invalid install, or to `mangabaclaw agent --local ...` when config is valid.

`mangabaclaw onboard --modern` remains a compatibility alias for MangabaClaw, but uses the same inference gate: working inference opens the chat, interactive failures start guided inference setup, and noninteractive failures exit with onboarding guidance. `mangabaclaw onboard --classic` opens the full step-by-step wizard.

## What MangabaClaw shows

Interactive MangabaClaw opens the same TUI shell as `mangabaclaw tui`, with an MangabaClaw chat backend. The startup greeting covers:

- config validity and the default agent
- the verified model MangabaClaw is using
- Gateway reachability from the first startup probe
- the next recommended debug action

It does not dump secrets or load plugin CLI commands just to start.

Use `status` for the detailed inventory: config path, docs/source paths, local CLI probes, key/token presence, agents, model, and Gateway details.

MangabaClaw uses the same reference discovery as regular agents: in a Git checkout it points at local `docs/` and the source tree; in an npm install it uses bundled docs and links to [https://github.com/mangabaclaw/mangabaclaw](https://github.com/mangabaclaw/mangabaclaw), with guidance to check source when docs are not enough.

## Examples

```bash
mangabaclaw
mangabaclaw setup
mangabaclaw setup --json
mangabaclaw setup --message "models"
mangabaclaw setup --message "validate config"
mangabaclaw setup --message "setup workspace ~/Projects/work" --yes
mangabaclaw setup --message "set default model openai/gpt-5.6" --yes
mangabaclaw onboard --modern
```

Inside the MangabaClaw TUI:

```text
status
health
doctor
validate config
setup
setup workspace ~/Projects/work
config set gateway.port 19001
config set-ref gateway.auth.token env MANGABACLAW_GATEWAY_TOKEN
gateway status
configure gateway
open gateway wizard
restart gateway
agents
create agent work workspace ~/Projects/work
models
configure model provider
set default model openai/gpt-5.6
channels
channel info slack
connect slack
open channel wizard for slack
configure skills
configure web search
open search wizard
import memory
plugins list
plugins search slack
plugin install clawhub:mangabaclaw-codex-app-server
talk to work agent
talk to agent for ~/Projects/work
audit
quit
```

## Operations and approval

MangabaClaw uses typed operations instead of editing config ad hoc.

Read-only operations run immediately: show overview, list agents, list installed plugins, search ClawHub plugins, show model/backend status, run status/health checks, check Gateway reachability, run doctor without interactive fixes, validate config, show the audit-log path.

Starting a guided setup flow also runs immediately: channel setup (`connect telegram`), workspace skills setup (`configure skills`), web-search provider setup (`configure web search`), and local Gateway setup (`configure gateway`). Each config-backed hosted wizard collects explicit answers and owns the resulting writes; completions append audit entries and re-validate config. A web-search provider that needs a plugin install writes config only after the install succeeds — a failed or timed-out install stops setup and reports it instead of claiming the provider is configured.

`configure gateway` guides you through the local Gateway's port, bind address, token or password auth, and Tailscale exposure. It saves config without applying it to the running Gateway, because changing the active address or credential could disconnect the setup chat. Say `restart gateway` after chat setup, or run `mangabaclaw gateway restart` after a terminal-wizard handoff. Remote mode is guidance-only: use `mangabaclaw onboard` for a fresh setup or `mangabaclaw configure` to change the mode.

`import memory` is copy-only rather than a config write. It detects supported local agent homes, lets you choose the available sources, and copies new memory files into the existing default agent workspace without importing config, credentials, or skills. It requires completed onboarding and reports confirmed imports, nothing-to-import results, provider failures, and failures where some files may already have been copied. No Gateway restart is needed. Use the Control UI's [Import Memory page](/web/control-ui#import-assistant-memory) when you need to target another agent or replace an existing import.

Persistent operations require conversational approval (or `--yes` for a direct command): write config, `config set`, `config set-ref`, setup/onboarding bootstrap, change the default model, start/stop/restart the Gateway, create agents, and install plugins.

Configured agents can ask MangabaClaw to create another agent through their
`mangabaclaw` tool. The request enters the same typed create-agent operation and
operator approval flow used by Ask MangabaClaw; the approval summary names the
requesting agent. MangabaClaw remains the executor, and approved creation records
that requesting agent as the new agent's creator.

Doctor repairs are unavailable inside MangabaClaw because they can rewrite the provider, authentication, or default-agent inference route powering the session. Exit MangabaClaw and run `mangabaclaw doctor --fix` in a terminal. Read-only `doctor` remains available inside MangabaClaw.

New agents inherit the live-verified default inference route. The agent ids `mangabaclaw` and `crestodian` are reserved for the system agent and cannot be created as normal agents. The retired id remains blocked so an old config cannot claim it.

`config set` and `config set-ref` can change any setting a user can change,
with a short human-only denylist: `$include`, `auth.*`, `env.*`, `models.*`,
and `secrets.*` stay refused because they carry credential material,
alternate-config inclusion, or the provider/catalog definitions that feed
inference routing. Inference routing itself is also protected: default model
routes (`agents.defaults` model/params/runtime fields) and the routing fields
of whichever agent backs the active default route are refused, as are agent
identity/topology fields (`id`, `agentDir`, `default`). Routing fields for
other agents remain writable behind approval. Gateway and channel auth remain
normal config surfaces. Use `set default model <provider/model>` for an
already configured route; it live-tests the route before saving it. To
configure or repair provider/auth access, exit MangabaClaw and run
`mangabaclaw onboard`.

`plugins.entries.<id>.*` writes (enable/disable/config of installed plugins)
are allowed unless that plugin backs the active inference route. Plugin
install sources and load policy keep their trust boundary in the typed
plugin-install workflow. Plugin uninstall of the route-backing plugin is
refused for the same reason; exit MangabaClaw and run
`mangabaclaw plugins uninstall <id>` from a terminal.

Approval is given in your own words: unambiguous replies ("yes", "sure", "go ahead", "not now") resolve from a closed deterministic list. When the configured route supports a separate completion call, other replies can be classified from only your message and the pending proposal — never by the conversation model itself, which cannot self-approve. Unclassified or ambiguous replies keep the proposal pending and the conversation asks again.

### Change history

The Ask MangabaClaw page can show recent applied system-agent operations, Doctor
migrations, Settings and CLI config writes, and manual edits to
`mangabaclaw.json`. The config journal detects external edits while the Gateway
is watching, during an MangabaClaw-owned write, or at the next startup after an
offline edit.

History is stored in the `diagnostic_events` table of the shared
`~/.mangabaclaw/state/mangabaclaw.sqlite` database, under the `system-agent-audit`
and `config-audit` scopes. Each scope retains its latest 50,000 records.
Discovery and read-only operations are not included. Secrets never appear in
change history; config journal records contain changed paths rather than config
values, and value comparison uses protected fingerprints.

Channel, web-search, and local Gateway setup can run as hosted conversations
until they reach a secret. The local MangabaClaw TUI does not accept sensitive wizard answers
because terminal chat input is visible. It offers `open channel wizard`
(carrying the selected channel), `open search wizard`, or `open gateway wizard`
immediately, handing off to the masked terminal wizard; you can also run
`mangabaclaw channels add --channel <channel>` or
`mangabaclaw configure --section web` or `mangabaclaw configure --section gateway`
later.

### Switching to a masked terminal wizard

The local chat can hand control to a masked terminal wizard:

```text
open channel wizard for slack
channel info slack
open search wizard
open gateway wizard
```

`open channel wizard for <channel>` opens masked channel setup after the chat
TUI closes. Use `channel info <channel>` first for the channel label, setup
state, prerequisites summary, and docs link. `open search wizard` works the
same way for web-search provider setup, opening the masked search wizard after
the chat TUI closes. `open gateway wizard` opens masked local Gateway setup;
when it finishes, run `mangabaclaw gateway restart` to apply the saved settings.

MangabaClaw never changes provider/auth access from inside its own session: the
session already depends on that inference route. For model-provider setup or
repair, `configure model provider` returns exit/onboarding guidance without
starting a wizard or writing config. Exit MangabaClaw and run `mangabaclaw
onboard`; onboarding stages the credentials and saves only a route that
completes a real live turn. Start MangabaClaw again after onboarding succeeds.

## Setup bootstrap

`setup` configures the remaining workspace and Gateway state after guided onboarding has already established inference. It writes only through typed config operations and asks for approval first.

```text
setup
setup workspace ~/Projects/work
```

`setup` preserves the verified effective model. It does not configure or
replace inference.

If inference is missing or its live check fails, leave MangabaClaw and run `mangabaclaw onboard`. Guided onboarding tries the configured model first, then authenticated subscription CLIs, API keys, and remaining supported CLIs; it asks each candidate for a real reply and persists only a passing route. MangabaClaw starts immediately after that boundary and can then configure the workspace, Gateway, channels, agents, plugins, and other optional features.

The macOS app skips this ladder entirely when it reaches a configured Gateway
whose default agent already has a configured model; it opens the normal agent
UI.
For a fresh or incomplete Gateway, the app drives the inference ladder through
the `mangabaclaw.setup.detect` and `mangabaclaw.setup.activate` Gateway methods:
detect lists every candidate backend it finds, activate live-tests one
candidate (a real "reply with OK" completion), and only persists the model,
credential, and provider/runtime state needed for that route after the test passes. Workspace and Gateway defaults remain for MangabaClaw. A failing candidate
never changes config; the app automatically walks down the ladder and finally
offers a manual key/token step populated from the Gateway's active
text-inference provider plugins. The selected provider owns its starter model
and config, and the credential is verified the same way before it is saved.

Codex supervision and other optional plugin features stay outside this
inference activation transaction. Configure them only after inference is
working and MangabaClaw has started; existing plugin policy and explicit
supervision opt-outs remain untouched during inference setup.

## AI conversation

Interactive MangabaClaw's free-form conversation runs through the same agent loop as regular MangabaClaw agents, restricted to one ring-zero MangabaClaw authority tool, `mangabaclaw`, that wraps the typed operations. Read actions run freely, mutations require your conversational approval for that exact operation (see Operations and approval), and every applied write is audited and re-validated. The agent session persists, so MangabaClaw has real multi-turn memory. If the verified inference route later stops working, return to `mangabaclaw onboard` and repair it before continuing.

The host does not parse natural-language requests into operations. Free-form
messages — including command-looking text and questions such as "why did my
gateway stop?" — go to the AI, which can map the request to a typed operation
through the `mangabaclaw` tool.

When a mutation is pending, only unambiguous approval or decline phrases from a
closed list are resolved without inference. Ambiguous consent goes to a
separate configured completion call and otherwise fails closed. Structured
wizard fields and exact host navigation are UI controls, not natural-language
operation parsing. One secret-hygiene exception is especially important: an
exact `config set` on a sensitive path (tokens, keys, passwords) never reaches
a model. The host creates a redacted proposal, and the value is masked in the
AI-visible history. Prefer `config set-ref <path> env <ENV_VAR>` for secrets.

Message-channel rescue mode never uses the model-assisted planner. Remote rescue stays deterministic so a broken or compromised normal agent path cannot be used as a config editor.

### CLI harness trust model

Embedded runtimes and the Codex app-server harness enforce the ring-zero
restriction directly: the run carries an MangabaClaw tool allow-list with only
the `mangabaclaw` tool. For Codex, MangabaClaw also disables environments, native
execution, multi-agent, goal, app/plugin, skill/MCP, web-search,
`request_user_input`, and its native planning utility for that run. CLI
harnesses do not consume MangabaClaw's allow-list,
so MangabaClaw admits only backends whose own tool-selection contract can prove
the same restriction:

- Selectable backends, including Claude Code, launch with an empty native-tool
  selection and one MCP tool, `mangabaclaw`. Claude's generated MCP config is
  applied with `--strict-mcp-config`, so no other MCP servers are loaded.
- Backends that declare no native tools receive the same dedicated MangabaClaw
  MCP server.
- Always-on or unknown native-tool backends fail closed before inference; they
  cannot host an MangabaClaw session.

Only MangabaClaw sessions get the mangabaclaw MCP server; normal agent runs
never see this tool. Selectable/no-native CLI backends and API-key models
therefore enforce the literal single-tool loop. Codex app-server models enforce
a single MangabaClaw authority tool plus the inert native planning utility. In all
three cases, setup writes remain confined to MangabaClaw's audited approval
contract.

Gemini CLI remains available as an explicitly configured runtime for normal
agents, but Gemini CLI and Antigravity are not inference-gate setup routes.
Use AI Studio API-key or Vertex AI for the inference gate. The optional Gemini
CLI runtime specifically requires an AI Studio API-key profile.

## Switching to an agent

Use a natural-language selector to leave MangabaClaw and open the normal TUI:

```text
talk to agent
talk to work agent
switch to main agent
```

`mangabaclaw tui`, `mangabaclaw chat`, and `mangabaclaw terminal` open the normal agent TUI directly; they do not start MangabaClaw. After switching into the normal TUI, `/mangabaclaw` returns to MangabaClaw, optionally with a follow-up request:

```text
/mangabaclaw
/mangabaclaw restart gateway
```

## Message rescue mode

Message rescue mode is the message-channel entrypoint for MangabaClaw: use it when your normal agent is dead but a trusted channel (for example WhatsApp) still receives commands.

This is a deterministic emergency command handler, not the conversational
MangabaClaw agent. It does not bootstrap a fresh setup or relax the inference
gate for MangabaClaw chat.

Supported command: `/mangabaclaw <request>`. Rescue accepts the exact typed command grammar only — natural language is rejected with a hint, never guessed into an operation, and no model is ever consulted.

```text
You, in a trusted owner DM: /mangabaclaw status
MangabaClaw: MangabaClaw rescue mode. Gateway reachable: no. Config valid: no.
You: /mangabaclaw restart gateway
MangabaClaw: Plan: restart the Gateway. Reply /mangabaclaw yes to apply.
You: /mangabaclaw yes
MangabaClaw: Applied. Audit entry written.
```

Agent creation can also be queued locally or via rescue:

```text
create agent work workspace ~/Projects/work model openai/gpt-5.6-sol
/mangabaclaw create agent work workspace ~/Projects/work
```

Agent creation may name only the current live-verified default model. Omit the
model to inherit that route.

Remote rescue is an admin surface and must be treated like remote config repair, not normal chat.

Security contract for remote rescue:

- Disabled when sandboxing is active for the agent/session; MangabaClaw refuses remote rescue and points to local CLI repair.
- Default effective state is `auto`: allow remote rescue only in trusted YOLO operation, where the runtime already has unsandboxed local authority (`tools.exec.security` resolves to `full` and `tools.exec.ask` resolves to `off`, with sandbox mode `off`).
- Requires an explicit owner identity; no wildcard sender rules, open group policy, unauthenticated webhooks, or anonymous channels.
- Rescue is limited to owner DMs.
- Plugin search and list are read-only. Plugin install is always local-only (blocked in rescue, even when otherwise enabled) because it downloads executable code. Plugin uninstall is refused in both local MangabaClaw and rescue; run `mangabaclaw plugins uninstall <id>` from a terminal.
- Remote rescue cannot open the local TUI or switch into an interactive agent session; use local `mangabaclaw` for agent handoff.
- Persistent writes still require approval, even in rescue mode.
- Pending approvals are one-use. Any newer rescue command for the same account, channel, and sender revokes the older plan; failed execution also consumes approval, so resend the command to retry.
- Every applied rescue operation is audited. Message-channel rescue records channel, account, sender, and source-address metadata; config-mutating operations also record config hashes before and after.
- Secrets are never echoed. SecretRef inspection reports availability, not values.
- If the Gateway is alive, rescue prefers Gateway typed operations; if it is dead, rescue uses only the minimal local repair surface that does not depend on the normal agent loop.

Rescue policy is built in: it is available only when the effective runtime is
YOLO, sandboxing is off, and the request is an owner DM. Pending write approvals
expire after 15 minutes. `mangabaclaw doctor --fix` removes the retired
`systemAgent` and `crestodian` config blocks.

Remote rescue is covered by the Docker lane:

```bash
pnpm test:docker:system-agent-rescue
```

An opt-in live channel command-surface smoke checks `/mangabaclaw status` plus a persistent approval roundtrip through the rescue handler:

```bash
pnpm test:live:system-agent-rescue-channel
```

Inference-gated packaged one-shot setup is covered by:

```bash
pnpm test:docker:system-agent-first-run
```

That packaged-CLI lane starts with an empty state dir and proves MangabaClaw
fails closed without inference. It then tests and activates fake Claude through
the packaged activation module. Only afterward does a fuzzy request reach the
planner and resolve to typed setup, followed by one-shot commands that create an
additional agent, configure Discord through a plugin enablement plus token
SecretRef, validate config, and check the audit log. This lane is supporting
gate/operation evidence; it does not exercise interactive onboarding or the
MangabaClaw agent/tool/approval conversation. The QA Lab scenario below redirects
to the same Docker lane:

```bash
pnpm mangabaclaw qa suite --scenario system-agent-ring-zero-setup
```

## Related

- [CLI reference](/cli)
- [Doctor](/cli/doctor)
- [TUI](/cli/tui)
- [Sandbox](/cli/sandbox)
- [Security](/cli/security)
