# @mangabaclaw/memory-wiki

Persistent wiki compiler and Obsidian-friendly knowledge vault for **MangabaClaw**.

This plugin is separate from the active memory plugin. The active memory plugin still handles recall, promotion, and dreaming. `memory-wiki` compiles durable knowledge into a navigable markdown vault with deterministic indexes, provenance, structured claim/evidence metadata, and optional Obsidian CLI workflows.

When the active memory plugin exposes shared recall, agents can use `memory_search` with `corpus=all` to search durable memory and the compiled wiki in one pass, then fall back to `wiki_search` / `wiki_get` when wiki-specific ranking or provenance matters.

## Modes

- `isolated`: own vault, own sources, no dependency on `memory-core`
- `bridge`: reads public memory artifacts and memory events through public seams
- `unsafe-local`: explicit same-machine escape hatch for private local paths

Default mode is `isolated`.

`vaultMode` controls the wiki's inputs. `vault.scope` separately controls
whether agents share one vault (`global`, the default) or resolve separate
vaults (`agent`).

## Config

Put config under `plugins.entries.memory-wiki.config`:

```json5
{
  vaultMode: "isolated",

  vault: {
    scope: "global", // or "agent"
    path: "~/.mangabaclaw/wiki/main",
    renderMode: "obsidian", // or "native"
  },

  obsidian: {
    enabled: true,
    useOfficialCli: true,
    vaultName: "MangabaClaw Wiki",
    openAfterWrites: false,
  },

  bridge: {
    enabled: false,
    readMemoryArtifacts: true,
    indexDreamReports: true,
    indexDailyNotes: true,
    indexMemoryRoot: true,
    followMemoryEvents: true,
  },

  unsafeLocal: {
    allowPrivateMemoryCoreAccess: false,
    paths: [],
  },

  ingest: {
    autoCompile: true,
    maxConcurrentJobs: 1,
    allowUrlIngest: true,
  },

  search: {
    backend: "shared", // or "local"
    corpus: "wiki", // or "memory" | "all"
  },

  context: {
    includeCompiledDigestPrompt: false, // opt in to append a compact compiled digest snapshot to memory prompt sections
  },

  render: {
    preserveHumanBlocks: true,
    createBacklinks: true, // writes managed ## Related blocks with sources, backlinks, and related pages
    createDashboards: true,
  },
}
```

### Per-agent vaults

In agent scope, `vault.path` is a parent directory. MangabaClaw appends the
normalized agent id:

```json5
{
  vaultMode: "bridge",
  vault: {
    scope: "agent",
    path: "~/.mangabaclaw/wiki",
  },
  bridge: {
    enabled: true,
    readMemoryArtifacts: true,
  },
  obsidian: {
    useOfficialCli: false,
  },
}
```

This resolves agents such as `support` and `marketing` to
`~/.mangabaclaw/wiki/support` and `~/.mangabaclaw/wiki/marketing`. With no explicit
path, the parent defaults to `~/.mangabaclaw/wiki`; the default `main` agent
therefore keeps the existing `~/.mangabaclaw/wiki/main` path. In global scope,
`vault.path` remains the exact shared vault path.

Wiki tools and compiled prompt/corpus supplements resolve the active runtime
agent on each call. In bridge mode, an agent vault imports only public memory
artifacts whose `agentIds` includes that agent; unowned and other-agent
artifacts are skipped. CLI operations use the configured default agent unless
the command passes `--agent <agentId>`; Gateway operations in multi-agent
setups require `agentId` on the `wiki.*` RPC request.

Configuration validation rejects agent scope with either
`vaultMode: "unsafe-local"` or `obsidian.useOfficialCli: true`. Obsidian-friendly
Markdown rendering still works with agent vaults when official CLI actions are
disabled.

Changing scope does not copy or split existing pages. Back up the vault and
move or import content deliberately. Per-agent paths are a same-process
knowledge boundary, not an operating-system security boundary; unsandboxed
plugins and tools can still access another agent's host files.

## Vault shape

The plugin initializes a vault like this:

```text
<vault>/
  AGENTS.md
  WIKI.md
  index.md
  inbox.md
  entities/
  concepts/
  syntheses/
  sources/
  reports/
  _attachments/
  _views/
  .mangabaclaw-wiki/
```

Generated content stays inside managed blocks. Human note blocks are preserved.

Key beliefs can live in structured `claims` frontmatter with per-claim evidence, confidence, and status. Compile also persists a machine-readable snapshot in MangabaClaw plugin state so agent/runtime consumers do not have to scrape markdown pages.

When `render.createBacklinks` is enabled, compile adds deterministic `## Related` blocks to pages. Those blocks list source pages, pages that reference the current page, and nearby pages that share the same source ids.

When `render.createDashboards` is enabled, compile also maintains report dashboards under `reports/` for open questions, contradictions, low-confidence pages, and stale pages.

Unmanaged raw Markdown can live under `sources/` without MangabaClaw page frontmatter. Add `<!-- mangabaclaw:wiki:raw-source -->` near the top of the page body to opt it out of wiki page metadata and freshness lint; generated or source-sync tracked imports still require their structured metadata.

## CLI

```bash
mangabaclaw wiki status
mangabaclaw wiki doctor
mangabaclaw wiki init
mangabaclaw wiki ingest ./notes/alpha.md
mangabaclaw wiki compile
mangabaclaw wiki lint
mangabaclaw wiki search "alpha"
mangabaclaw wiki get entity.alpha --from 1 --lines 80

mangabaclaw wiki apply synthesis "Alpha Summary" \
  --body "Short synthesis body" \
  --source-id source.alpha

mangabaclaw wiki apply metadata entity.alpha \
  --source-id source.alpha \
  --status review \
  --question "Still active?"

mangabaclaw wiki bridge import
mangabaclaw wiki unsafe-local import

mangabaclaw wiki obsidian status
mangabaclaw wiki obsidian search "alpha"
mangabaclaw wiki obsidian open syntheses/alpha-summary.md
mangabaclaw wiki obsidian command workspace:quick-switcher
mangabaclaw wiki obsidian daily

# Agent-scoped vault
mangabaclaw wiki status --agent support
mangabaclaw wiki search "refund policy" --agent support
```

## Agent tools

- `wiki_status`
- `wiki_lint`
- `wiki_apply`
- `wiki_search`
- `wiki_get`

The plugin also registers a non-exclusive memory corpus supplement, so shared `memory_search` / `memory_get` flows can reach the wiki when the active memory plugin supports corpus selection.

`wiki_apply` accepts structured `claims` payloads for synthesis and metadata updates, so the wiki can store claim-level evidence instead of only page-level prose.

When `context.includeCompiledDigestPrompt` is enabled, the memory prompt supplement also appends a compact snapshot from the lifecycle-owned in-memory cache. Legacy prompt assembly sees that automatically, and non-legacy context engines can pick it up when they explicitly consume memory prompt supplements via `buildActiveMemoryPromptSection(...)`.

## Gateway RPC

Read methods:

- `wiki.status`
- `wiki.doctor`
- `wiki.search`
- `wiki.get`
- `wiki.obsidian.status`
- `wiki.obsidian.search`

Write methods:

- `wiki.init`
- `wiki.compile`
- `wiki.ingest`
- `wiki.lint`
- `wiki.bridge.import`
- `wiki.unsafeLocal.import`
- `wiki.apply`
- `wiki.obsidian.open`
- `wiki.obsidian.command`
- `wiki.obsidian.daily`

For agent-scoped vaults, pass `agentId` to vault-backed RPC methods. Missing or
unknown ids fail in multi-agent setups.

## Notes

- `unsafe-local` is intentionally experimental and non-portable.
- Bridge mode reads the active memory plugin through public seams only.
- Agent scope is incompatible with `unsafe-local` and official Obsidian CLI actions.
- Wiki pages are compiled artifacts, not the ultimate source of truth. Keep provenance attached to raw sources, memory artifacts, and daily notes.
- The compiled snapshot in shared SQLite plugin state is the stable machine-facing view of the wiki.
- After editing or restoring vault files, compile again before expecting tools or prompts to use that source state. Lifecycle refresh rejects SQLite snapshots newer than a restored vault, and causal publication chaining rejects compilers started before the restore, without polling or watching files.
- Rollback quarantine clears immediately for an in-process compile. After a separate compiler process publishes, refresh the plugin lifecycle so the daemon can validate that durable publication.
- Pre-publication-epoch cache rows are rebuildable misses, not migrated state; the next compile replaces them.
- Obsidian CLI support requires the official `obsidian` CLI to be installed and available on `PATH`.
