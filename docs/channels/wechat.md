---
summary: "WeChat channel setup through the external mangabaclaw-weixin plugin"
read_when:
  - You want to connect MangabaClaw to WeChat or Weixin
  - You are installing or troubleshooting the mangabaclaw-weixin channel plugin
  - You need to understand how external channel plugins run beside the Gateway
title: "WeChat"
---

MangabaClaw connects to WeChat through Tencent's external
`@tencent-weixin/mangabaclaw-weixin` channel plugin.

Status: external plugin, maintained by the Tencent Weixin team. Direct chats and
media are supported. Group chats are not advertised by the plugin capability
metadata (it declares direct chats only).

## Naming

- **WeChat** is the user-facing name in these docs.
- **Weixin** is the name used by Tencent's package and by the plugin id.
- `mangabaclaw-weixin` is the MangabaClaw channel id (`weixin` and `wechat` work as aliases).
- `@tencent-weixin/mangabaclaw-weixin` is the npm package.

Use `mangabaclaw-weixin` in CLI commands and config paths.

## How it works

The WeChat code does not live in the MangabaClaw core repo. MangabaClaw provides the
generic channel plugin contract, and the external plugin provides the
WeChat-specific runtime:

1. `mangabaclaw plugins install` installs `@tencent-weixin/mangabaclaw-weixin`.
2. The Gateway discovers the plugin manifest and loads the plugin entrypoint.
3. The plugin registers channel id `mangabaclaw-weixin`.
4. `mangabaclaw channels login --channel mangabaclaw-weixin` starts QR login.
5. The plugin stores account credentials under the MangabaClaw state directory
   (`~/.mangabaclaw` by default).
6. When the Gateway starts, the plugin starts its Weixin monitor for each
   configured account.
7. Inbound WeChat messages are normalized through the channel contract, routed to
   the selected MangabaClaw agent, and sent back through the plugin outbound path.

That separation matters: MangabaClaw core stays channel-agnostic. WeChat login,
Tencent iLink API calls, media upload/download, context tokens, and account
monitoring are owned by the external plugin.

## Install

Quick install:

```bash
npx -y @tencent-weixin/mangabaclaw-weixin-cli install
```

Manual install:

```bash
mangabaclaw plugins install "@tencent-weixin/mangabaclaw-weixin"
mangabaclaw config set plugins.entries.mangabaclaw-weixin.enabled true
```

Restart the Gateway after install:

```bash
mangabaclaw gateway restart
```

## Login

Run QR login on the same machine that runs the Gateway:

```bash
mangabaclaw channels login --channel mangabaclaw-weixin
```

Scan the QR code with WeChat on your phone and confirm the login. The plugin saves
the account token locally after a successful scan.

To add another WeChat account, run the same login command again. For multiple
accounts, isolate direct-message sessions by account, channel, and sender:

```bash
mangabaclaw config set session.dmScope per-account-channel-peer
```

## Access control

Direct messages use the normal MangabaClaw pairing and allowlist model for channel
plugins.

Approve new senders:

```bash
mangabaclaw pairing list mangabaclaw-weixin
mangabaclaw pairing approve mangabaclaw-weixin <CODE>
```

For the full access-control model, see [Pairing](/channels/pairing).

## Compatibility

The plugin checks the host MangabaClaw version at startup.

| Plugin line | MangabaClaw version                                                | npm tag  |
| ----------- | --------------------------------------------------------------- | -------- |
| `2.x`       | `>=2026.5.12` (current 2.4.6; early 2.x accepted `>=2026.3.22`) | `latest` |
| `1.x`       | `>=2026.1.0 <2026.3.22`                                         | `legacy` |

If the plugin reports that your MangabaClaw version is too old, either update
MangabaClaw or install the legacy plugin line:

```bash
mangabaclaw plugins install @tencent-weixin/mangabaclaw-weixin@legacy
```

## Sidecar process

The WeChat plugin can run helper work beside the Gateway while it monitors the
Tencent iLink API. In issue #68451, that helper path exposed a bug in MangabaClaw's
generic stale-Gateway cleanup: a child process could try to clean up the parent
Gateway process, causing restart loops under process managers such as systemd.

Current MangabaClaw startup cleanup excludes the current process and its ancestors,
so a channel helper cannot kill the Gateway that launched it. This fix is
generic; it is not a WeChat-specific path in core.

## Troubleshooting

Check install and status:

```bash
mangabaclaw plugins list
mangabaclaw channels status --probe
mangabaclaw --version
```

If the channel shows as installed but does not connect, confirm that the plugin is
enabled and restart:

```bash
mangabaclaw config set plugins.entries.mangabaclaw-weixin.enabled true
mangabaclaw gateway restart
```

If the Gateway restarts repeatedly after enabling WeChat, update both MangabaClaw and
the plugin:

```bash
npm view @tencent-weixin/mangabaclaw-weixin version
mangabaclaw plugins install "@tencent-weixin/mangabaclaw-weixin" --force
mangabaclaw gateway restart
```

If startup reports that the installed plugin package `requires compiled runtime
output for TypeScript entry`, the npm package was published without the compiled
JavaScript runtime files MangabaClaw needs. Update/reinstall after the plugin
publisher ships a fixed package, or temporarily disable/uninstall the plugin.

Temporary disable:

```bash
mangabaclaw config set plugins.entries.mangabaclaw-weixin.enabled false
mangabaclaw gateway restart
```

## Related docs

- Channel overview: [Chat Channels](/channels)
- Pairing: [Pairing](/channels/pairing)
- Channel routing: [Channel Routing](/channels/channel-routing)
- Plugin architecture: [Plugin Architecture](/plugins/architecture)
- Channel plugin SDK: [Channel Plugin SDK](/plugins/sdk-channel-plugins)
- External package: [@tencent-weixin/mangabaclaw-weixin](https://www.npmjs.com/package/@tencent-weixin/mangabaclaw-weixin)
