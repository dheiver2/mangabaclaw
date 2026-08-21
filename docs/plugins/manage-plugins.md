---
summary: "Manage MangabaClaw plugins from the Control UI or CLI"
read_when:
  - You want to browse, install, enable, or disable plugins in the Control UI
  - You want quick plugin list, install, update, inspect, or uninstall examples
  - You want to choose a plugin install source
  - You want the right reference for publishing plugin packages
title: "Manage plugins"
sidebarTitle: "Manage plugins"
doc-schema-version: 1
---

The Control UI covers the common discovery, install, enable, and disable
workflow. The CLI adds update, uninstall, advanced configuration, and explicit
install-source controls. For its full command contract, flags, source-selection
rules, and edge cases, see [`mangabaclaw plugins`](/cli/plugins).

Typical CLI workflow: find a package, install it from ClawHub, npm, git, or a
local path, let the managed Gateway auto-restart (or restart it manually), then
verify the plugin's runtime registrations.

## Use the Control UI

Open **Plugins** in the Control UI, or use `/settings/plugins` relative to the
configured Control UI base path. For example, a base path of `/mangabaclaw` uses
`/mangabaclaw/settings/plugins`. The page has two tabs:

- **Installed** shows the full local inventory grouped by category (channels,
  model providers, memory, tools). Each row opens a detail view; its overflow
  (`…`) menu enables or disables the plugin and, for externally installed
  plugins, offers **Remove**. The tab also lists the configured
  [MCP servers](/cli/mcp) with the same menu-driven enable, disable, and remove
  actions, editing `mcp.servers` in the Gateway configuration.
- **Discover** is the store: featured plugins included with MangabaClaw, official
  external plugins, and a curated connector shelf. Connector cards either add a
  hosted MCP server in one click (GitHub, Notion, Linear, Sentry,
  Home Assistant) or jump into a prefilled ClawHub search. Typing in the search
  box queries [ClawHub](https://clawhub.ai/plugins) inline and appends a **From
  ClawHub** section with download counts and source-verification badges.

Included plugins do not need a package install. Their menu action is **Enable**
or **Disable**. Workboard, for example, is included with MangabaClaw and disabled
by default, so choose **Enable** to turn it on. Bundled plugins cannot be
removed, only disabled.

Catalog and search access require `operator.read`. Install, enable, disable,
remove, and MCP server changes require `operator.admin`. A ClawHub install is
performed by the Gateway and preserves its trust, integrity, and plugin-install
policy checks. Enabling an installed plugin as an administrator also records
that explicit trust by adding the selected plugin to an existing restrictive
`plugins.allow` list. An explicit `plugins.deny` entry remains authoritative and
must be removed before enabling the plugin.

Installing or removing plugin code requires a Gateway restart. Enablement
changes can be applied without a restart when the installed plugin and current
Gateway runtime support it; otherwise the UI tells you a restart is required.
OAuth-backed MCP connectors still need a one-time `mangabaclaw mcp login <name>`
from the CLI after they are added.

The Control UI does not install from arbitrary npm, git, or local-path sources,
update plugins, or expose rich plugin configuration. Use the CLI workflows
below for those operations.

## List and search plugins

```bash
mangabaclaw plugins list
mangabaclaw plugins list --enabled
mangabaclaw plugins list --verbose
mangabaclaw plugins list --json
mangabaclaw plugins search "calendar"
```

`--json` for scripts:

```bash
mangabaclaw plugins list --json \
  | jq '.plugins[] | {id, enabled, format, source, dependencyStatus}'
```

`plugins list` is a cold inventory check: what MangabaClaw can discover from
config, manifests, and the persisted plugin registry. It does not prove an
already-running Gateway imported the plugin runtime. JSON output includes
registry diagnostics and each plugin's `dependencyStatus` (whether declared
`dependencies`/`optionalDependencies` resolve on disk).

`plugins search` queries ClawHub for installable plugin packages and prints
an install hint (`mangabaclaw plugins install clawhub:<package>`) per result.

## Enable and disable plugins

```bash
mangabaclaw plugins enable <plugin-id>
mangabaclaw plugins disable <plugin-id>
```

Toggles a plugin's config entry without touching installed files. Some
bundled plugins (bundled model/speech providers, the bundled browser plugin)
are enabled by default; others require `enable` after install.

## Install plugins

```bash
# Search ClawHub for plugin packages.
mangabaclaw plugins search "calendar"

# Install from ClawHub.
mangabaclaw plugins install clawhub:<package>
mangabaclaw plugins install clawhub:<package>@1.2.3
mangabaclaw plugins install clawhub:<package>@beta

# Install from npm.
mangabaclaw plugins install npm:<package>
mangabaclaw plugins install npm:@scope/mangabaclaw-plugin@1.2.3
mangabaclaw plugins install npm:@mangabaclaw/codex

# Install from a local npm-pack artifact.
mangabaclaw plugins install npm-pack:<path.tgz>

# Install from git or a local development checkout.
mangabaclaw plugins install git:github.com/acme/mangabaclaw-plugin@v1.0.0
mangabaclaw plugins install ./my-plugin
mangabaclaw plugins install --link ./my-plugin
```

Bare package specs install from npm during the launch cutover, unless the
name matches a bundled or official plugin id, in which case MangabaClaw uses
that local/official copy instead. Use `clawhub:`, `npm:`, `git:`, or
`npm-pack:` for deterministic source selection. MangabaClaw's bundled and official
catalog packages are trusted alongside ClawHub packages. New arbitrary npm,
git, local path/archive, `npm-pack:`, or marketplace sources require
`--force` in noninteractive installs after you review
and trust the source.

`--force` confirms a non-ClawHub source without prompting and overwrites an
existing install target when needed. For routine upgrades of a tracked npm,
ClawHub, or hook-pack install, use `mangabaclaw plugins update` instead. With
`--link`, `--force` only confirms the source; the linked directory is not
copied or overwritten.

If a newly installed plugin requires configuration that is not present yet,
MangabaClaw records the install but leaves the plugin disabled. Configure
`plugins.entries.<id>.config`, then run `mangabaclaw plugins enable <id>`. If an
existing config entry is present but invalid, install fails without rewriting it.

A plugin package can expose multiple child entries. Installation tracks that
package once, enables each ready child entry, and preserves any child that you
explicitly disabled. Runtime policy remains child-addressable through
`plugins.entries.<child-id>`, allow/deny lists, channel config, exact child load
paths, and the `memory` and `contextEngine` slots.

## Restart and inspect

A running managed Gateway with config reload enabled restarts automatically
after installing, updating, or uninstalling plugin code. If the Gateway is
unmanaged or reload is disabled, restart it yourself before checking live
runtime surfaces:

```bash
mangabaclaw gateway restart
mangabaclaw plugins inspect <plugin-id> --runtime --json
```

`inspect --runtime` loads the plugin module and proves it registered runtime
surfaces (tools, hooks, services, Gateway methods, HTTP routes, plugin-owned
CLI commands). Plain `inspect` and `list` are cold manifest/config/registry
checks only.

## Update plugins

```bash
mangabaclaw plugins update <plugin-id>
mangabaclaw plugins update <npm-package-or-spec>
mangabaclaw plugins update --all
mangabaclaw plugins update <plugin-id> --dry-run
```

Passing a plugin id reuses its tracked install spec: stored dist-tags
(`@beta`) and exact pinned versions carry over to later `update <plugin-id>`
runs. For a multi-entry package, any child id resolves to the one tracked
package install, so all siblings update together. Removed or renamed children
have their stale entries, allow/deny policy, exact load paths, channel config,
and memory/context slot selections reconciled before the new package/index
state commits; retained/new children and unrelated plugins are preserved.

If MangabaClaw cannot prove exactly one package owner and a complete child list,
update and uninstall fail closed without changing package files, config, or the
installed index. Run `mangabaclaw plugins registry --refresh`, inspect
`mangabaclaw plugins doctor`, and use `mangabaclaw doctor --fix` for repairable legacy
index state. If the ambiguity remains, reinstall the package before retrying.

`mangabaclaw plugins update --all` is the bulk maintenance path. It still
respects ordinary tracked install specs, but trusted official MangabaClaw
plugin records sync to the current official catalog target instead of
staying pinned to a stale exact official package. The canonical channel
resolver uses both `update.channel` and the installed core version, so an
installed beta core with no configured channel keeps official plugins on the
beta release line. Use a targeted `update <plugin-id>` to keep an exact or
tagged official spec untouched.

For npm installs, pass an explicit package spec to switch the tracked
record:

```bash
mangabaclaw plugins update @scope/mangabaclaw-plugin@beta
mangabaclaw plugins update @scope/mangabaclaw-plugin
```

The second command moves a plugin back to the registry's default release
line when it was previously pinned to an exact version or tag.

See [`mangabaclaw plugins`](/cli/plugins#update) for the exact fallback and
pinning rules.

## Uninstall plugins

```bash
mangabaclaw plugins uninstall <plugin-id> --dry-run
mangabaclaw plugins uninstall <plugin-id>
mangabaclaw plugins uninstall <plugin-id> --keep-files
```

Uninstall removes the package's persisted install record and every owned child
entry from plugin config, allow/deny lists, memory/context slots, exact linked
`plugins.load.paths`, and channel config entries when applicable. You may address a multi-entry
package by any child id; the preview names the package owner and all siblings
that will be removed. The managed install directory is removed once unless you
pass `--keep-files`. A running managed Gateway restarts automatically when the
uninstall changes plugin source.

If an installed Claw references the plugin, preview and uninstall print the
affected Claw package names. Ordinary plugin uninstall can still proceed and
may break those Claws; use `mangabaclaw claws status` to review ownership first.
Removing a Claw releases its plugin reference but retains the process-wide
plugin by default.

In Nix mode (`MANGABACLAW_NIX_MODE=1`), plugin install, update, uninstall,
enable, and disable are all disabled; manage those choices in the Nix source
for the install instead.

## Choose a source

| Source      | Use when                                                                    | Example                                                        |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ClawHub     | You want MangabaClaw-native discovery, scan summaries, versions, and hints     | `mangabaclaw plugins install clawhub:<package>`                   |
| git         | You want a branch, tag, or commit from a repository                         | `mangabaclaw plugins install git:github.com/<owner>/<repo>@<ref>` |
| local path  | You are developing or testing a plugin on the same machine                  | `mangabaclaw plugins install --link ./my-plugin`                  |
| marketplace | You are installing a Claude-compatible marketplace plugin                   | `mangabaclaw plugins install <plugin> --marketplace <source>`     |
| npm pack    | You are proving a local package artifact through npm install semantics      | `mangabaclaw plugins install npm-pack:<path.tgz>`                 |
| npmjs.com   | You already ship JavaScript packages or need npm dist-tags/private registry | `mangabaclaw plugins install npm:@acme/mangabaclaw-plugin`           |

Managed local path installs must be plugin directories or archives. Put
standalone plugin files in `plugins.load.paths` instead of installing them
with `plugins install`.

## Publish plugins

ClawHub is the primary public discovery surface for MangabaClaw plugins. Publish
there when you want users to find plugin metadata, version history, registry
scan results, and install hints before they install.

```bash
npm i -g clawhub
clawhub login
clawhub package publish your-org/your-plugin --dry-run
clawhub package publish your-org/your-plugin
clawhub package publish your-org/your-plugin@v1.0.0
```

Native npm plugins must ship a plugin manifest (`mangabaclaw.plugin.json`) plus
`package.json` metadata before publishing:

```json package.json
{
  "name": "@acme/mangabaclaw-plugin",
  "version": "1.0.0",
  "type": "module",
  "mangabaclaw": {
    "extensions": ["./dist/index.js"]
  }
}
```

```bash
npm publish --access public
mangabaclaw plugins install npm:@acme/mangabaclaw-plugin
mangabaclaw plugins install npm:@acme/mangabaclaw-plugin@beta
mangabaclaw plugins install npm:@acme/mangabaclaw-plugin@1.0.0
```

Use these pages for the full publishing contract instead of treating this
page as the publishing reference:

- [ClawHub publishing](/clawhub/publishing) explains owners, scopes,
  releases, review, package validation, and package transfer.
- [Building plugins](/plugins/building-plugins) shows the full plugin
  package shape (including `mangabaclaw.plugin.json`) and first publish
  workflow.
- [Plugin manifest](/plugins/manifest) defines native plugin manifest
  fields.

If the same package is available on both ClawHub and npm, use the explicit
`clawhub:` or `npm:` prefix to force one source.

## Related

- [Plugins](/tools/plugin) - install, configure, restart, and troubleshoot
- [`mangabaclaw plugins`](/cli/plugins) - full CLI reference
- [Community plugins](/plugins/community) - public discovery and ClawHub publishing
- [ClawHub](/clawhub/cli) - registry CLI operations
- [Building plugins](/plugins/building-plugins) - create a plugin package
- [Plugin manifest](/plugins/manifest) - manifest and package metadata
