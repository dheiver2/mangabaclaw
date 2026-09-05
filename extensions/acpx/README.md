# @mangabaclaw/acpx

Official ACP runtime backend for MangabaClaw.

ACPx lets MangabaClaw run external coding harnesses through the Agent Client Protocol while MangabaClaw still owns sessions, channels, delivery, permissions, and Gateway state.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/acpx
```

Restart the Gateway after installing or updating the plugin.

## What it provides

- ACP-backed agent runtime sessions.
- Plugin-owned session and transport management.
- MCP bridge helpers for MangabaClaw tools and plugin tools.
- Static runtime assets used by the ACP process bridge.

## Configure

Use the ACP docs for harness-specific setup, permission modes, and model/runtime selection:

- https://docs.openclaw.ai/tools/acp-agents-setup
- https://docs.openclaw.ai/tools/acp-agents

## Package

- Plugin id: `acpx`
- Package: `@mangabaclaw/acpx`
- Minimum MangabaClaw host: `2026.4.25`
