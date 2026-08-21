---
summary: "CLI reference for `mangabaclaw nodes` (status, pairing, invoke, camera/screen/location/notify and the macOS widget panel)"
read_when:
  - You're managing paired nodes (cameras, screen, or the macOS widget panel)
  - You need to approve requests or invoke node commands
title: "Nodes"
---

# `mangabaclaw nodes`

Manage paired nodes (devices) and invoke node capabilities.

Related: [Nodes overview](/nodes) - [Active computer presence](/nodes/presence) - [Camera nodes](/nodes/camera) - [Image nodes](/nodes/images)

Common options on every subcommand: `--url <url>`, `--token <token>`, `--timeout <ms>` (default `10000`), `--json`.

## Status

```bash
mangabaclaw nodes status
mangabaclaw nodes status --connected
mangabaclaw nodes status --last-connected 24h
mangabaclaw nodes list
mangabaclaw nodes describe --node <idOrNameOrIp>
```

`status` and `list` both accept `--connected` (only connected nodes) and `--last-connected <duration>` (e.g. `24h`, `7d`; only nodes that connected within the duration). `list` shows pending and paired nodes in separate tables, with paired rows including the most recent connect age (Last Connect); `status` shows one merged table with per-node capability, version, and last-input detail. A connected macOS node reports last input only after the user enables **Active computer detection** and grants Accessibility; the freshest row is marked `active`. See [Active computer presence](/nodes/presence). `describe` prints one node's capabilities, permissions, activity, and effective/pending invoke commands.

## Pairing

```bash
mangabaclaw nodes pending
mangabaclaw nodes approve <requestId>
mangabaclaw nodes reject <requestId>
mangabaclaw nodes remove --node <id|name|ip>
mangabaclaw nodes rename --node <id|name|ip> --name <displayName>
```

These commands drive the gateway-owned `node.pair.*` store, separate from device pairing (`mangabaclaw devices approve`) that gates the node's WS `connect` handshake. See [Nodes](/nodes) for how the two relate.

- `remove` revokes the node's paired-role entry. For a device-backed node this revokes the `node` role in the device pairing store and disconnects its node-role sessions: a mixed-role device keeps its row and only loses the `node` role, a node-only device row is deleted. It also clears any matching legacy gateway-owned node pairing record.
- `pending` only needs `operator.pairing` scope.
- `gateway.nodes.pairing.autoApproveCidrs` can skip the pending step for explicitly trusted, first-time `role: node` device pairing. Off by default; does not approve role upgrades.
- `gateway.nodes.pairing.sshVerify` (on by default) auto-approves first-time `role: node` device pairing when the gateway can verify the device key over SSH to the node host; the first capability surface is approved in the same step. See [Node pairing](/gateway/pairing#ssh-verified-device-auto-approval-default).
- `approve` scope requirements follow the pending request's declared commands:
  - commandless request: `operator.pairing`
  - ordinary node commands: `operator.pairing` + `operator.write`
  - admin-sensitive commands (`system.run`, `system.run.prepare`, `system.which`, `browser.proxy`, `browser.proxy.upload.v1`, `fs.listDir`, and `system.execApprovals.get/set`): `operator.pairing` + `operator.admin`
- These requirements classify node commands relayed through `node.invoke`. The top-level Gateway `fs.listDir` RPC needs `operator.write` for workspace-contained host browsing and `operator.admin` when `nodeId` is present.
- `remove` scope: `operator.pairing` can remove non-operator node rows; a device-token caller revoking its own node role on a mixed-role device additionally needs `operator.admin`.

## Invoke

```bash
mangabaclaw nodes invoke --node <id> --command system.which --params '{"bins":["uname"]}'
```

Flags:

- `--command <command>` (required): e.g. `device.info`.
- `--params <json>`: JSON object string (default `{}`).
- `--invoke-timeout <ms>`: node invoke timeout (default `15000`).
- `--idempotency-key <key>`: optional idempotency key.

`system.run` and `system.run.prepare` are blocked here; use the `exec` tool with `host=node` for shell execution instead. `system.which` is allowed through `invoke`.

## Notify, push, location, screen

```bash
mangabaclaw nodes notify --node <id> --title "Build" --body "Done" --priority timeSensitive
mangabaclaw nodes push --node <id> --title "MangabaClaw" --environment sandbox
mangabaclaw nodes location get --node <id> --accuracy precise
mangabaclaw nodes screen record --node <id> --duration 10s --fps 10 --out ./clip.mp4
```

- `notify` sends a local notification on a node that declares `system.notify`, including macOS, iOS, Android, and direct watchOS nodes. Direct watchOS delivery requires MangabaClaw to be active. Requires `--title` or `--body`. Options: `--sound <name>`, `--priority <passive|active|timeSensitive>`, `--delivery <system|overlay|auto>` (default `system`), `--invoke-timeout <ms>` (default `15000`).
- `push` sends an APNs test push to an iOS node. Options: `--title <text>` (default `MangabaClaw`), `--body <text>`, `--environment <sandbox|production>` to override the detected APNs environment. Accepted delivery exits `0`; a typed APNs rejection preserves the complete text or JSON diagnostic and exits non-zero.
- `location get` fetches the node's current location. Options: `--max-age <ms>` (reuse a cached fix), `--accuracy <coarse|balanced|precise>`, `--location-timeout <ms>` (default `10000`), `--invoke-timeout <ms>` (default `20000`).
- `screen record` captures a short clip and prints the saved path (or writes JSON with `--json`). Options: `--screen <index>` (default `0`), `--duration <ms|10s>` (default `10000`), `--fps <fps>` (default `10`), `--no-audio`, `--out <path>`, `--invoke-timeout <ms>` (default `120000`).
- Explicit screen output paths are staged beside the destination and replace it only after a complete write; a failed write leaves an existing file unchanged.

Camera and macOS widget-panel commands have their own docs: [Camera nodes](/nodes/camera), [Widget panel](/platforms/mac/canvas). The bundled experimental Canvas plugin registers `mangabaclaw nodes canvas` with the surviving `present`, `hide`, and `navigate` subcommands.

## Related

- [CLI reference](/cli)
- [Nodes](/nodes)
