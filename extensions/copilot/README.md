# GitHub Copilot agent runtime (MangabaClaw plugin)

External MangabaClaw plugin that registers a `copilot` agent harness backed by `@github/copilot-sdk` and the GitHub Copilot CLI.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/copilot
```

Restart the Gateway after installing or updating the plugin.

The harness claims the canonical subscription `github-copilot` provider plus
custom BYOK provider entries that the Copilot SDK can represent. Manifest-owned
native provider ids stay with their owning runtimes. The harness is opt-in only:
selection requires explicit `agentRuntime.id: "copilot"` on a model or provider
entry; `auto` never picks it. MangabaClaw remains the default embedded runtime.

See [GitHub Copilot agent runtime](../../docs/plugins/copilot.md) for
configuration, the doctor contract, transcript mirroring, compaction, side
questions, replay, and the supported-surface contract.

## Package

- Plugin id: `copilot`
- Package: `@mangabaclaw/copilot`
- Minimum MangabaClaw host: `2026.5.28`
