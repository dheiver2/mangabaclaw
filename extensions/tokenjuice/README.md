# @mangabaclaw/tokenjuice

Official Tokenjuice output compaction plugin for MangabaClaw.

Tokenjuice compacts noisy `exec` and `bash` tool results after commands run, before the result is fed back into the active agent session. It does not rewrite commands, rerun commands, or change exit codes.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/tokenjuice
```

Restart the Gateway after installing or updating the plugin.

## Enable

```bash
mangabaclaw config set plugins.entries.tokenjuice.enabled true
```

Equivalent:

```bash
mangabaclaw plugins enable tokenjuice
```

## Docs

- https://docs.openclaw.ai/tools/tokenjuice

## Package

- Plugin id: `tokenjuice`
- Package: `@mangabaclaw/tokenjuice`
- Minimum MangabaClaw host: `2026.5.28`
