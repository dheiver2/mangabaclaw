# @mangabaclaw/buzz

Official Buzz channel plugin for MangabaClaw. It connects an MangabaClaw agent to approved Buzz rooms for text conversations and threaded replies.

## Requirements

You need:

- A Buzz relay URL
- A Buzz owner or admin
- A room where the bot can receive the **Bot** role

Use `wss://` outside local development.

## Set up

```bash
mangabaclaw channels add --channel buzz
```

MangabaClaw installs the plugin if needed, asks for the relay URL, and generates a dedicated bot identity.

Give the displayed **public key only** to a Buzz owner or admin:

```bash
buzz channels add-member \
  --channel <ROOM_UUID> \
  --pubkey <BOT_PUBLIC_KEY> \
  --role bot
```

Closed relays may also require the bot to be added as a relay member. Setup waits for approval, discovers accessible rooms, and saves the selected rooms and default target.

Restart the Gateway if it was already running.

## Verify

```bash
mangabaclaw channels status --probe
```

Inspect the current bot, approved rooms, and room members:

```bash
mangabaclaw directory self --channel buzz
mangabaclaw directory peers list --channel buzz
mangabaclaw directory groups list --channel buzz
mangabaclaw directory groups members --channel buzz --group-id buzz:<ROOM_UUID>
```

Buzz profile and room names are used as display labels, while public keys and
room UUIDs remain the stable identities. Archived rooms are omitted; an
archive or restore event rebuilds only the Buzz connection's room
subscriptions and does not stop the Gateway.

Send a test message:

```bash
mangabaclaw message send \
  --channel buzz \
  --target <ROOM_UUID> \
  --message "Hello from MangabaClaw"
```

## Security and scope

- Never give MangabaClaw a human owner's private key.
- The generated bot private key is stored in MangabaClaw configuration; only its public key is displayed.
- Treat Buzz messages as untrusted agent input.
- Currently supported: text conversations, threads, typing, and directory
  lookup in group rooms.
- Not yet supported: DMs, media, reactions, or creating rooms from MangabaClaw.

Full documentation: https://docs.mangabaclaw.ai/channels/buzz

Package: `@mangabaclaw/buzz` · Plugin ID: `buzz`
