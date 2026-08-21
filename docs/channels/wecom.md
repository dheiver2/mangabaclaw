---
summary: "Install the official WeCom plugin and find its versioned setup documentation"
read_when:
  - You want to connect MangabaClaw to WeCom
  - You need the supported WeCom plugin and its setup documentation
title: "WeCom"
---

MangabaClaw exposes WeCom through the external
`@wecom/wecom-mangabaclaw-plugin` package maintained by the Tencent WeCom team.
The plugin is listed in MangabaClaw's official channel catalog but is not bundled
with the core install.

## Install

```bash
mangabaclaw channels add --channel wecom
mangabaclaw gateway restart
mangabaclaw channels status --channel wecom
```

The MangabaClaw catalog installs an exact version of
`@wecom/wecom-mangabaclaw-plugin`.

## Configure

WeCom credentials, connection modes, callback routes, and access-control
behavior belong to the external plugin and can change independently of
MangabaClaw. Follow the
[package documentation](https://www.npmjs.com/package/@wecom/wecom-mangabaclaw-plugin)
for the installed release before configuring the channel.

When upgrading the plugin independently, keep using the documentation for the
installed version.
