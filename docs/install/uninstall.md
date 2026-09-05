---
summary: "Uninstall MangabaClaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove MangabaClaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

Two paths:

- **Easy path** if `mangabaclaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

The command attempts independent requested cleanup scopes and returns a nonzero status if any scope fails or is blocked. Service teardown remains the safety gate for state and workspace deletion; if that gate fails, those data scopes are preserved while app cleanup is still attempted. Partial cleanup is reported explicitly and is never followed by an unconditional completion result.

Recommended: use the built-in uninstaller:

```bash
mangabaclaw uninstall
```

State removal preserves configured workspace directories unless you also select `--workspace`.

Preview what will be removed (safe):

```bash
mangabaclaw uninstall --dry-run --all
```

Non-interactive (automation / npx). Use with caution and only after confirming scopes:

```bash
mangabaclaw uninstall --all --yes --non-interactive
npx -y mangabaclaw uninstall --all --yes --non-interactive
```

Flags: `--service`, `--state`, `--workspace`, `--app` select individual scopes; `--all` selects all four.

Manual steps provide a complete removal path, but a raw state-directory deletion
does not have the built-in uninstaller's workspace-preservation behavior. If
you want the equivalent of `mangabaclaw uninstall --state`, preserve every
configured workspace before deleting state.

1. Stop the gateway service:

```bash
mangabaclaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
mangabaclaw gateway uninstall
```

3. Decide whether to preserve the workspace.

`mangabaclaw uninstall --state` deliberately preserves configured workspace
directories, including the default `~/.mangabaclaw/workspace`. Before using the
manual `rm -rf` below, move any workspace you want to keep outside the state
directory. If you want to remove it too, no separate deletion is needed when it
lives inside the state directory.

4. Delete state + config:

```bash
rm -rf "${MANGABACLAW_STATE_DIR:-$HOME/.mangabaclaw}"
```

If you set `MANGABACLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.
Restore any preserved workspace to its configured path after recreating the
parent directory, or update the workspace path in your next installation.

5. Delete a workspace stored outside the state directory only if you want to
   remove its agent files too:

```bash
rm -rf /path/to/external/workspace
```

6. Remove the CLI install (pick the one you used):

```bash
npm rm -g mangabaclaw
pnpm remove -g mangabaclaw
bun remove -g mangabaclaw
```

7. If you installed the macOS app:

```bash
rm -rf /Applications/MangabaClaw.app
```

Notes:

- If you used profiles (`--profile` / `MANGABACLAW_PROFILE`), repeat steps 3-4 for each state dir (defaults are `~/.mangabaclaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `mangabaclaw` is missing.

### macOS (launchd)

Default label is `ai.mangabaclaw.gateway` (or `ai.mangabaclaw.<profile>` with a profile):

```bash
launchctl bootout gui/$UID/ai.mangabaclaw.gateway
rm -f ~/Library/LaunchAgents/ai.mangabaclaw.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.mangabaclaw.<profile>`.

### Linux (systemd user unit)

Default unit name is `mangabaclaw-gateway.service` (or `mangabaclaw-gateway-<profile>.service`). A pre-rename `clawdbot-gateway.service` unit may still exist on machines upgraded from very old installs; `mangabaclaw uninstall` / `mangabaclaw gateway uninstall` detects and removes it automatically.

```bash
systemctl --user disable --now mangabaclaw-gateway.service
rm -f ~/.config/systemd/user/mangabaclaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `MangabaClaw Gateway` (or `MangabaClaw Gateway (<profile>)`).
The task launches a windowless `gateway.vbs` script under your state dir, which in turn
runs `gateway.cmd`; remove both.

```powershell
schtasks /Delete /F /TN "MangabaClaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.mangabaclaw\gateway.cmd" -ErrorAction SilentlyContinue
Remove-Item -Force "$env:USERPROFILE\.mangabaclaw\gateway.vbs" -ErrorAction SilentlyContinue
```

If you used a profile, delete the matching task name and the `gateway.cmd` /
`gateway.vbs` files under `~\.mangabaclaw-<profile>`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://mangaba.ia.br/install.sh` or `install.ps1`, the CLI was installed with `npm install -g mangabaclaw@latest`.
Remove it with `npm rm -g mangabaclaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `mangabaclaw ...` / `bun run mangabaclaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.

## Related

- [Install overview](/install)
- [Migration guide](/install/migrating)
