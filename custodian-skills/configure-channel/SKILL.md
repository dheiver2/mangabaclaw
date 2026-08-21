---
name: configure-channel
description: Configure and prove a chat channel with non-interactive one-liners; secrets only as SecretRefs.
---

# Configure a channel

Never print or persist secret values; channel tokens enter config only as SecretRefs, or through the in-session `connect_channel` flow where the operator types the secret into a masked prompt. Never hand-edit config files on disk. Every run ends with the observable Prove result or an exact explanation of why it could not be proven.

## Gather

```
mangabaclaw channels list --all
mangabaclaw channels status
mangabaclaw config get channels --json        # "Config path not found" is normal before first setup
```

Confirm the exact config path before writing — key names differ per channel (`channels.telegram.botToken`, `channels.discord.token`, ...):

```
mangabaclaw config schema --json | jq '.properties.channels.properties.telegram'
```

## Mutate

Preferred shell path — token staged as an env var on the gateway process or in a `0600` file, wired as a SecretRef (Telegram example):

```
mangabaclaw config set channels.telegram.botToken --ref-provider default --ref-source env --ref-id TELEGRAM_BOT_TOKEN
mangabaclaw config set channels.telegram.allowFrom '["+15555550123"]' --strict-json
```

Multi-field changes in one validated write:

```
mangabaclaw config patch --stdin <<'JSON'
{ channels: { telegram: { enabled: true, groupPolicy: "allowlist" } } }
JSON
```

In-session alternative: call the `connect_channel` tool action with the channel id — the operator enters the token in a masked prompt, never in chat. Avoid `mangabaclaw channels add --token <value>`: it puts the secret in argv and process listings.

## Repair

```
mangabaclaw doctor --non-interactive
mangabaclaw channels status --deep
```

Apply `mangabaclaw doctor --fix --non-interactive` only after approval, then re-check status.

## Prove

Send one real, clearly labeled test message and confirm delivery from the command result (use `--dry-run` first to inspect the payload):

```
mangabaclaw message send --channel telegram --target <chatId> --message "MangabaClaw channel test — please ignore" --dry-run
mangabaclaw message send --channel telegram --target <chatId> --message "MangabaClaw channel test — please ignore"
```

If sending fails, report the exact account, permission, destination, or network blocker without exposing credentials.

## Report

State the channel and account changed, the exact config paths written (never values), the test destination, and the observed delivery result. List any remaining operator action.

Further reference: https://docs.mangabaclaw.ai/channels/telegram (and the matching page for other channels)
