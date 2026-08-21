---
summary: "Manage sandbox runtimes and inspect effective sandbox policy"
title: Sandbox CLI
read_when: "You are managing sandbox runtimes or debugging sandbox/tool-policy behavior."
status: active
---

Manage sandbox runtimes for isolated agent execution: Docker/Podman containers, SSH targets, or OpenShell backends.

[`mangabaclaw agent exec`](/cli/agent#agent-exec) does not use these configured runtimes. Its isolated implicit policy config turns the agent sandbox off, allows full Gateway-host execution, and restricts filesystem tools to `--cwd`.

## Commands

### `mangabaclaw sandbox list`

List sandbox runtimes with status, backend, config match, age, idle time, and associated session/agent.

```bash
mangabaclaw sandbox list
mangabaclaw sandbox list --browser  # browser containers only
mangabaclaw sandbox list --json
```

### `mangabaclaw sandbox recreate`

Remove sandbox runtimes to force recreation with current config. Runtimes are recreated automatically the next time the agent is used.

```bash
mangabaclaw sandbox recreate --all
mangabaclaw sandbox recreate --agent mybot        # includes agent:mybot:* sub-sessions
mangabaclaw sandbox recreate --session "agent:main:main"
mangabaclaw sandbox recreate --browser --all      # only browser containers
mangabaclaw sandbox recreate --all --force        # skip confirmation
```

Options:

- `--all`: recreate all sandbox containers
- `--session <key>`: recreate the runtime with this exact scope key (as shown by `sandbox list`); no short-name expansion
- `--agent <id>`: recreate runtimes for one agent (matches `agent:<id>` and `agent:<id>:*`)
- `--browser`: only affect browser containers
- `--force`: skip the confirmation prompt

Pass exactly one of `--all`, `--session`, or `--agent`.

For `ssh` and OpenShell `remote`, recreate matters more than with Docker: the remote workspace is canonical after the initial seed, `recreate` deletes that canonical remote workspace for the selected scope, and the next run reseeds it from the current local workspace.

### `mangabaclaw sandbox explain`

Inspect the effective sandbox mode/scope/workspace access, sandbox tool policy, and elevated-tool gates (with fix-it config key paths).

The report keeps `workspaceRoot` as the configured sandbox root and separately shows the effective host workspace, backend runtime workdir, and Docker mount table. For `workspaceAccess: "rw"`, the effective host workspace is the agent workspace rather than a directory below `workspaceRoot`.

```bash
mangabaclaw sandbox explain
mangabaclaw sandbox explain --session agent:main:main
mangabaclaw sandbox explain --agent work
mangabaclaw sandbox explain --json
```

Unlike `recreate --session`, this accepts short session names (for example `main`) and expands them against the resolved agent.
An explicit `--agent` is sufficient for multi-agent fleets with no implicit owner; sandbox explanation does not require or guess a default first.

## Why recreate is needed

Updating sandbox config does not affect running containers: existing runtimes keep their old settings, and idle runtimes are only pruned after `prune.idleHours` (default 24h). Regularly used agents can keep stale runtimes alive indefinitely. `mangabaclaw sandbox recreate` removes the old runtime so the next use rebuilds it from current config.

<Tip>
Prefer `mangabaclaw sandbox recreate` over manual backend-specific cleanup. It uses the Gateway's runtime registry and avoids mismatches when scope or session keys change.
</Tip>

## Common triggers

| Change                                                                                                                                                         | Command                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Container sandbox image update (`agents.defaults.sandbox.docker.image`)                                                                                        | `mangabaclaw sandbox recreate --all`                                   |
| Sandbox config (`agents.defaults.sandbox.*`)                                                                                                                   | `mangabaclaw sandbox recreate --all`                                   |
| SSH target/auth (`agents.defaults.sandbox.ssh.{target,workspaceRoot,identityFile,certificateFile,knownHostsFile,identityData,certificateData,knownHostsData}`) | `mangabaclaw sandbox recreate --all`                                   |
| OpenShell source/policy/mode (`plugins.entries.openshell.config.{from,mode,policy}`)                                                                           | `mangabaclaw sandbox recreate --all`                                   |
| `setupCommand`                                                                                                                                                 | `mangabaclaw sandbox recreate --all` (or `--agent <id>` for one agent) |

<Note>
Runtimes are automatically recreated when the agent is next used.
</Note>

## Registry migration

Sandbox runtime metadata lives in the shared SQLite state database. Older installs may have legacy registry files that regular reads no longer rewrite:

- `~/.mangabaclaw/sandbox/containers.json`
- `~/.mangabaclaw/sandbox/browsers.json`
- one JSON shard per container/browser under `~/.mangabaclaw/sandbox/containers/` or `~/.mangabaclaw/sandbox/browsers/`

Run `mangabaclaw doctor --fix` to migrate valid legacy entries into SQLite. Invalid legacy files are quarantined so a corrupt old registry cannot hide current runtime entries.

## Configuration

Sandbox settings live in `~/.mangabaclaw/mangabaclaw.json` under `agents.defaults.sandbox` (per-agent overrides go in `agents.entries.*.sandbox`):

```jsonc
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all", // off, non-main, all
        "backend": "docker", // docker, ssh, openshell (plugin-provided)
        "scope": "agent", // session, agent, shared
        "docker": {
          "image": "mangabaclaw-sandbox:bookworm-slim",
          "containerPrefix": "mangabaclaw-sbx-",
          // ... more Docker options
        },
        "prune": {
          "idleHours": 24, // auto-prune after 24h idle
          "maxAgeDays": 7, // auto-prune after 7 days
        },
      },
    },
  },
}
```

## Related

- [CLI reference](/cli)
- [Sandboxing](/gateway/sandboxing)
- [Agent workspace](/concepts/agent-workspace)
- [Doctor](/gateway/doctor): checks sandbox setup.
