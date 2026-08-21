---
summary: "CLI reference for `mangabaclaw backup` (archives, SQLite snapshots, and Git history)"
read_when:
  - You want a first-class backup archive for local MangabaClaw state
  - You need a compact, verified snapshot of one MangabaClaw SQLite database
  - You want scheduled, versioned database backups in an operator-owned Git repository
  - You want to preview which paths would be included before reset or uninstall
  - You want to restore from a `.tar.gz` archive previously created by `mangabaclaw backup`
title: "Backup"
---

# `mangabaclaw backup`

Create a local backup archive for MangabaClaw state, config, auth profiles, channel/provider credentials, sessions, and optionally workspaces.

```bash
mangabaclaw backup create
mangabaclaw backup create --output ~/Backups
mangabaclaw backup create --dry-run --json
mangabaclaw backup create --verify
mangabaclaw backup create --no-include-workspace
mangabaclaw backup create --only-config
mangabaclaw backup verify ./2026-03-09T08-00-00.000+08-00-mangabaclaw-backup.tar.gz
mangabaclaw backup restore ./2026-03-09T08-00-00.000+08-00-mangabaclaw-backup.tar.gz --target ./restored-mangabaclaw
mangabaclaw backup sqlite create --global --repository ~/Backups/mangabaclaw-sqlite
mangabaclaw backup sqlite create --agent main --repository ~/Backups/mangabaclaw-sqlite
mangabaclaw backup sqlite list --repository ~/Backups/mangabaclaw-sqlite
mangabaclaw backup sqlite verify ~/Backups/mangabaclaw-sqlite/<snapshot-id>
mangabaclaw backup sqlite verify ~/Backups/mangabaclaw-sqlite/<snapshot-id> --scratch ~/Private/mangabaclaw-scratch
mangabaclaw backup sqlite restore ~/Backups/mangabaclaw-sqlite/<snapshot-id> --target ./restored/mangabaclaw.sqlite
mangabaclaw backup git init --repository ~/Backups/mangabaclaw-git --remote <private-git-url>
mangabaclaw backup git create --repository ~/Backups/mangabaclaw-git --all --push
mangabaclaw backup git log --repository ~/Backups/mangabaclaw-git
mangabaclaw backup git verify --repository ~/Backups/mangabaclaw-git --global
mangabaclaw backup git restore --repository ~/Backups/mangabaclaw-git --agent main --target ./restored/agent.sqlite
mangabaclaw backup enable --repository ~/Backups/mangabaclaw-git --every 24h --push
mangabaclaw backup disable
```

Archive `create`, `verify`, and `restore`, plus SQLite `create`, `list`, `verify`, and
`restore`, accept `--json` for one machine-readable result on stdout.

## Notes

- The archive embeds a `manifest.json` with the resolved source paths and archive layout.
- Default output is a timestamped `.tar.gz` archive in the current working directory. Timestamped filenames use your machine's local timezone and include the UTC offset. If the current working directory is inside a backed-up source tree, MangabaClaw falls back to your home directory for the default archive location.
- Existing archive files are never overwritten. Output paths inside the source state/workspace trees are rejected to avoid self-inclusion.
- `mangabaclaw backup verify <archive>` checks that the archive contains exactly one root manifest, rejects traversal-style archive paths, absolute or archive-escaping symbolic links, and SQLite sidecars, confirms every manifest-declared payload exists, validates every SQLite snapshot's file shape, and runs full integrity and role checks on canonical MangabaClaw databases. Dedicated plugin schemas remain opaque because they may require owner-defined SQLite capabilities. `mangabaclaw backup create --verify` runs that validation immediately after writing the archive.
- `mangabaclaw backup create --only-config` backs up just the active JSON config file.

## Restore a full archive

Restore a complete archive into a fresh staging directory without touching the
live state directory:

```bash
mangabaclaw backup restore <archive.tar.gz> --target <fresh-directory>
```

The target must not exist or must be an empty directory. Restore verifies the
archive and its SQLite databases before creating or writing the target, refuses
a non-empty target, and removes an incomplete extraction if anything fails. It
never restores in place and has no `--force` mode. The extracted layout retains
the archive root, manifest, and `payload/` paths exactly as recorded in the
archive.

<Warning>
  Restoring an archive is time travel. Messaging-channel credentials with
  ratchet state, especially WhatsApp, may desynchronize after rollback and need
  relinking. Approvals and delivery/dedupe state also roll back, so review
  pending approvals before resuming the Gateway. Plugin `node_modules` trees
  are not archived; after activation, run `mangabaclaw plugins update <id>` or
  reinstall with `mangabaclaw plugins install <spec> --force`. The generated
  `plugin-skills/` symlink index is also omitted; run `mangabaclaw skills list` or
  start an agent session after activation to rebuild it from plugin metadata.
</Warning>

Activation is a separate offline operator step. Stop the Gateway, move the
restored state asset into place or point `MANGABACLAW_STATE_DIR` at that asset,
then run `mangabaclaw doctor` before restarting. Use `manifest.json` as the source
of truth for the state, config, credentials, and workspace asset paths. See
[Restore a full archive](/install/backups#restore-a-full-archive) for the full
disaster-recovery sequence.

## SQLite snapshots

Use `mangabaclaw backup sqlite` when you need a portable artifact for one MangabaClaw-owned SQLite database instead of a broad state archive.

Snapshot creation accepts exactly one named source:

| Command                                                         | Database               |
| --------------------------------------------------------------- | ---------------------- |
| `mangabaclaw backup sqlite create --global --repository <dir>`     | Shared MangabaClaw state  |
| `mangabaclaw backup sqlite create --agent <id> --repository <dir>` | One per-agent database |

The repository contains one directory per committed snapshot. Each snapshot directory contains exactly:

- `manifest.json`
- `database.sqlite`

Snapshot creation verifies the live database before reading it, uses SQLite's online backup API to capture committed WAL state without holding one long read transaction, closes the live database, compacts the private copy with `VACUUM`, verifies the generated database again, and publishes the completed directory without overwriting existing paths. Global snapshots remove every delivery queue row before compaction, including pending work, failed ownership fences, and completion or idempotency receipts, so neither payload detail nor ownership tombstones are published or retained in free pages. Restoring this sanitized, portable snapshot is therefore not an exactly-once delivery continuation boundary. This is an intentional privacy and no-replay portability tradeoff.

Do not copy live `.sqlite`, `-wal`, `-shm`, or `-journal` files as a portability artifact. Copy only completed snapshot directories.

SQLite snapshots can contain auth profiles, session state, plugin state, and other sensitive records. Protect repositories with the same permissions, encryption, retention policy, and destination restrictions as the live MangabaClaw state directory.

### Verify and restore

```bash
mangabaclaw backup sqlite verify <snapshot-directory>
mangabaclaw backup sqlite restore <snapshot-directory> --target <new-database-path>
```

Verification checks the strict manifest shape, artifact size and SHA-256, SQLite integrity, foreign keys, schema version, database role and owner, and MangabaClaw-owned index definitions.

Verification validates a private content-pinned copy so pathname races cannot swap the bytes SQLite inspects. By default, that temporary copy is created beside the snapshot repository and removed before the command returns. The staging root and its ancestor chain must prevent other users from replacing it. POSIX roots must be current-user-owned and not group/world writable; sticky ancestors such as `/tmp` are accepted for user-owned children. macOS ACL grants that expose or make staging replaceable are rejected. Windows roots and ancestors must be owned by the current user or a trusted OS principal, with ACLs that deny untrusted staging access. For a read-only mount or network share, pass `--scratch <existing-private-directory>` on storage with equivalent encryption and destination controls.

Snapshot creation applies the same owner, ACL, ancestor, and path-identity checks to the repository before staging or publishing database bytes. Newly created directory edges and final publication metadata are synchronized through the shared `fs-safe` durability boundary before success is reported on supported filesystems.

Restore repeats verification and writes only to a fresh target. It refuses an existing target, `-wal`, `-shm`, or `-journal` sidecar and never performs an in-place replacement of a live MangabaClaw database. The target parent has the same path-security requirements as verification scratch. Activating a restored database remains an explicit offline operator step.

Snapshot repositories are local directories. Scheduling, upload, retention, incremental WAL bundles, failover, and restore-on-boot behavior are intentionally outside this command.

## Versioned Git backups

`mangabaclaw backup git` stores deterministic, per-table JSONL dumps in a plain Git repository owned by the operator. One repository can hold the shared database and every per-agent database:

```text
global/manifest.json
global/schema.sql
global/tables/<table>.jsonl
agents/<agentId>/manifest.json
agents/<agentId>/schema.sql
agents/<agentId>/tables/<table>.jsonl
```

Initialize the repository, then create a snapshot of all registered databases:

```bash
mangabaclaw backup git init --repository ~/Backups/mangabaclaw-git --remote <private-git-url>
mangabaclaw backup git create --repository ~/Backups/mangabaclaw-git --all --push
```

The repository root must be owned by the current user and must not be group- or
world-writable. MangabaClaw checks this when initializing or adopting a repository
and before every create. On POSIX systems, repair unsafe permissions with
`chmod 700 <repository>` after confirming its ownership.

The repository must be dedicated to MangabaClaw backups. An existing `global/` or
`agents/<agentId>/` scope is backup-owned only when it is empty or contains a
valid schema-version-1 `manifest.json`. MangabaClaw refuses to replace any other
scope. With `--all`, it validates every existing entry under `agents/` before
removing stale backup-owned agent scopes, so an unowned entry aborts the cleanup
before anything is deleted.

You can also select `--global`, repeat `--agent <id>`, or combine the shared database with selected agents. Snapshot creation uses the same online backup, sanitizer, `VACUUM`, owner validation, and integrity checks as `backup sqlite create`; it never reads live SQLite files directly. Rows and schema entries have deterministic ordering, and integers and blobs use lossless encodings. The command creates one commit named `mangabaclaw backup <ISO8601>`. If the database content is unchanged, it prints `no changes` and creates no commit.

Git staging is restricted to the backup-owned `global` and `agents` paths;
unrelated files elsewhere in an adopted repository are never staged.

`--push` pushes the current branch to `origin`. A push failure after a successful local commit is a warning and does not discard or mark the local backup as failed.

<Warning>
  Git history is durable. Without `--exclude-secrets`, snapshots include
  credential material and any pushed remote must be private.

`src/state/secret-state-tables.ts` is the source of truth for redaction. At this revision, `--exclude-secrets` omits these shared-state tables:

- `audit_identity_keys`
- `auth_profile_state`
- `auth_profile_stores`
- `apns_registrations`
- `channel_ingress_events`
- `channel_pairing_requests`
- `clawhub_promotion_claims`
- `device_auth_tokens`
- `device_bootstrap_tokens`
- `device_identities`
- `device_pairing_join_codes`
- `device_pairing_paired`
- `gateway_origin_device_tokens`
- `mcp_oauth_pending_authorizations`
- `mcp_oauth_stores`
- `native_hook_relay_bridges`
- `node_host_config`
- `secret_store_entries`
- `web_push_subscriptions`
- `web_push_vapid_keys`
- `worker_environment_credentials`

It omits these per-agent tables:

- `auth_profile_state`
- `auth_profile_store`
- `session_suggestions`

Restore reports the omitted tables so a redacted snapshot cannot be mistaken
for a complete credential backup.
</Warning>

Inspect or verify history without changing the live databases:

```bash
mangabaclaw backup git log --repository ~/Backups/mangabaclaw-git --limit 20
mangabaclaw backup git verify --repository ~/Backups/mangabaclaw-git --ref <commit> --global
mangabaclaw backup git verify --repository ~/Backups/mangabaclaw-git --ref <commit> --agent main
```

Verification restores the selected snapshot into private scratch space, checks each table's row count and SHA-256, runs `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, and removes the scratch copy. Restore writes only to a fresh target and refuses existing `-wal`, `-shm`, and `-journal` sidecars:

```bash
mangabaclaw backup git restore --repository ~/Backups/mangabaclaw-git --ref <commit> --global --target ./restored/mangabaclaw.sqlite
```

Restore rebuilds content-backed FTS5 indexes after loading their content tables. It deliberately omits the derived `session_transcript_index_state` projection so Gateway startup reconciliation rebuilds transcript search. `vec0` virtual tables are not materialized because the extension is unavailable in the restore process; memory indexing recreates them and schedules a full reindex.

## Schedule backups

Provision one Gateway-owned automation with a fixed name:

```bash
mangabaclaw backup enable --repository ~/Backups/mangabaclaw-git --every 24h --push
```

The default scope is every database. Use `--global-only` or `--agent <id>` to narrow it, and add `--exclude-secrets` for a redacted history. Pushed schedules (`--push`) redact credential-bearing tables by default because an unattended recurring push retains them durably in remote history; pass `--include-secrets` for explicit full-fidelity remote backups (restores from redacted history need device re-pairing and provider re-authentication). `--push` also requires the repository to already have an `origin` remote. Re-running `backup enable` updates the existing automation instead of creating a duplicate. `mangabaclaw backup disable` removes it; disabling an already-missing job is a successful no-op. Backup scheduling currently requires a local Gateway because the command job runs on the Gateway host; for a remote Gateway, create the cron job manually with `mangabaclaw cron add`.

## Recorded runs and freshness

Every real archive, SQLite snapshot, and Git create attempt records a compact outcome in the existing shared state database. Dry runs are not recorded. The log retains the newest 200 attempts, so frequent schedules remain bounded.

`mangabaclaw status` shows one `Backups` overview row, and `mangabaclaw status --json` includes the latest attempt and latest successful run. `mangabaclaw doctor` prints an informational hint when no successful backup is recorded or the newest successful backup is more than 14 days old. Recording is best-effort: a record-write failure prints a warning but never changes a successful backup into a failed command.

## What gets backed up

`mangabaclaw backup create` plans sources from your local MangabaClaw install:

- The state directory (usually `~/.mangabaclaw`)
- The active config file path
- The resolved `credentials/` directory when it exists outside the state directory
- Workspace directories discovered from the current config, unless you pass `--no-include-workspace`

Auth profiles and other per-agent runtime state live in SQLite under the state directory (`agents/<agentId>/agent/mangabaclaw-agent.sqlite`), so they are covered by the state backup entry automatically.

`--only-config` skips state, credentials-directory, and workspace discovery and archives only the active config file path.

MangabaClaw canonicalizes paths before building the archive: if config, the credentials directory, or a workspace already live inside the state directory, they are not duplicated as separate top-level backup sources. Missing paths are skipped.

During archive creation, MangabaClaw excludes known live-mutation paths before `tar` reads them. This avoids races between a file's recorded size and concurrent writes. The filter applies these state-relative rules under each backed-up state directory:

| State-relative scope                         | Skipped file suffixes         |
| -------------------------------------------- | ----------------------------- |
| `sessions/**`                                | `.jsonl`, `.log`              |
| `agents/<agentId>/sessions/**`               | `.jsonl`, `.log`              |
| `cron/runs/**`                               | `.jsonl`, `.log`              |
| `logs/**`                                    | `.jsonl`, `.log`              |
| `delivery-queue/**`                          | `.json`, `.delivered`, `.tmp` |
| `session-delivery-queue/**`                  | `.json`, `.delivered`, `.tmp` |
| Any path under the backed-up state directory | `.sock`, `.pid`, `.tmp`       |

These rules do not filter workspace files outside the state directory. They also omit completed transcript and log files that match the table, so retain those records separately when needed. The JSON result's `skippedVolatileCount` reports how many files were intentionally omitted.

SQLite databases under the state directory are captured with SQLite's online backup API and compacted offline with `VACUUM` so deleted-page remnants do not enter the archive, and live WAL/SHM files are not copied. A plugin-owned database that requires unavailable owner-defined SQLite capabilities fails closed rather than falling back to a direct file copy. SQLite files included through workspace backups are copied as workspace files and are not covered by the compaction guarantee.

Installed plugin source and manifest files under the state directory's `extensions/` tree are included, but their nested `node_modules/` dependency trees are skipped as rebuildable install artifacts. After restoring an archive, use `mangabaclaw plugins update <id>` or reinstall with `mangabaclaw plugins install <spec> --force` if a restored plugin reports missing dependencies.

The state directory's `plugin-skills/` root is a generated, MangabaClaw-owned symlink index, not authoritative state. Backup creation reports and omits that root because its absolute targets are specific to the source installation. After activating restored state, run `mangabaclaw skills list` or start an agent session to rebuild the links from current plugin metadata. Other relative symbolic links are retained when their targets stay inside the archive root; verification rejects absolute or archive-escaping targets.

Installer-managed and rebuildable runtime roots under the state directory are also skipped: `dev/`, `git/`, `npm/`, legacy `npm-runtime/`, `tmp/`, and `tools/`. These contain managed checkouts, package trees, compiler caches, temporary files, and downloaded runtimes rather than authoritative user state; reinstall or update the corresponding runtime or plugin after restore. An explicitly configured config file, credentials directory, or workspace inside one of these roots remains included.

Local edits inside a managed `dev/` checkout are developer source, not MangabaClaw product state, and are not included. Commit and push those edits or copy the checkout separately before relying on a state backup.

## Invalid config behavior

`mangabaclaw backup` bypasses the normal config preflight so it can still help during recovery. Workspace discovery depends on a valid config, so `mangabaclaw backup create` fails fast when the config file exists but is invalid and workspace backup is still enabled.

For a partial backup in that situation, rerun with `--no-include-workspace`: it keeps state, config, and the external credentials directory in scope while skipping workspace discovery entirely.

`--only-config` also works when the config is malformed, since it does not parse the config for workspace discovery.

## Size and performance

MangabaClaw does not enforce a built-in maximum backup size or per-file size limit. An archive write that produces no data for five minutes fails and removes its partial temporary file instead of hanging indefinitely. Practical limits otherwise come from:

- Available space for the temporary archive write plus the final archive
- Time to walk large workspace trees and compress them into a `.tar.gz`
- Time to rescan the archive with `--verify` or `mangabaclaw backup verify`
- Destination filesystem behavior: MangabaClaw requires no-overwrite hard-link publication so a final archive path never exposes an in-progress copy; unsupported filesystems fail with an actionable error

If final-directory durability confirmation fails after publication, the command reports failure but preserves the complete final entry rather than risk deleting a concurrent replacement.

Large workspaces are usually the main driver of archive size. Use `--no-include-workspace` for a smaller/faster backup, or `--only-config` for the smallest archive.

## Related

- [CLI reference](/cli)
- [Migrating an MangabaClaw install](/install/migrating)
- [Restore a full archive](/install/backups#restore-a-full-archive)
