---
summary: "How MangabaClaw upgrades the previous Matrix plugin in place, including encrypted-state recovery limits and manual recovery steps."
read_when:
  - Upgrading an existing Matrix installation
  - Migrating encrypted Matrix history and device state
title: "Matrix migration"
---

Upgrade from the previous public `matrix` plugin to the current implementation.

For most users, the upgrade is in place:

- the plugin stays `@mangabaclaw/matrix`
- the channel stays `matrix`
- your config stays under `channels.matrix`
- cached credentials move into the shared `state/mangabaclaw.sqlite` plugin state
- runtime state stays under `~/.mangabaclaw/matrix/`

You do not need to rename config keys or reinstall the plugin under a new name.
The root `mangabaclaw` package no longer bundles Matrix runtime code or Matrix SDK
dependencies. If `mangabaclaw channels status` shows Matrix is configured but the
plugin is not installed, run `mangabaclaw doctor --fix` or
`mangabaclaw plugins install @mangabaclaw/matrix`; do not install Matrix SDK packages
into the root MangabaClaw package.

## What the migration does automatically

Matrix migration runs when you run [`mangabaclaw doctor --fix`](/gateway/doctor). File-based sidecars next to the dedicated Matrix store retain their client-start fallback, but credential-file import is Doctor-only; runtime reads only canonical SQLite credential state.

Doctor migration covers:

- importing and verifying retired `~/.mangabaclaw/credentials/matrix/credentials*.json` files before archiving them
- keeping the same account selection and `channels.matrix` config
- importing file-based sidecar state (`bot-storage.json` sync cache, `recovery-key.json`, `legacy-crypto-migration.json`, IndexedDB snapshots) into Matrix SQLite state; migrated files are archived with a `.migrated` suffix
- reusing the most complete existing token-hash storage root for the same Matrix account, homeserver, user, and device when the access token changes later

## Upgrading from MangabaClaw releases older than 2026.4

Releases through the 2026.6 train also migrated the original flat single-store
Matrix layout (`~/.mangabaclaw/matrix/bot-storage.json` plus
`~/.mangabaclaw/matrix/crypto/`) and prepared encrypted-state recovery from the
old rust crypto store. Current releases no longer carry that migration.

If you are upgrading an installation that still uses the flat layout, first
upgrade to a 2026.6 release, run `mangabaclaw doctor --fix`, and start the gateway
once so the flat store and any recoverable room keys are migrated. Then update
to the latest release.

The previous public Matrix plugin did **not** automatically create Matrix room-key backups. If your old installation had local-only encrypted history that was never backed up, some older encrypted messages may remain unreadable after the upgrade regardless of the migration path.

## Recommended upgrade flow

1. Update MangabaClaw and the Matrix plugin normally.
2. Run:

   ```bash
   mangabaclaw doctor --fix
   ```

3. Start or restart the gateway.
4. Check current verification and backup state:

   ```bash
   mangabaclaw matrix verify status
   mangabaclaw matrix verify backup status
   ```

5. Put the recovery key for the Matrix account you are repairing in an account-specific environment variable. For a single default account, `MATRIX_RECOVERY_KEY` is fine. For multiple accounts, use one variable per account, for example `MATRIX_RECOVERY_KEY_ASSISTANT`, and add `--account assistant` to the command.

6. If MangabaClaw tells you a recovery key is needed, run the command for the matching account:

   ```bash
   printf '%s\n' "$MATRIX_RECOVERY_KEY" | mangabaclaw matrix verify backup restore --recovery-key-stdin
   printf '%s\n' "$MATRIX_RECOVERY_KEY_ASSISTANT" | mangabaclaw matrix verify backup restore --recovery-key-stdin --account assistant
   ```

7. If this device is still unverified, run the command for the matching account:

   ```bash
   printf '%s\n' "$MATRIX_RECOVERY_KEY" | mangabaclaw matrix verify device --recovery-key-stdin
   printf '%s\n' "$MATRIX_RECOVERY_KEY_ASSISTANT" | mangabaclaw matrix verify device --recovery-key-stdin --account assistant
   ```

   If the recovery key is accepted and backup is usable, but `Cross-signing verified`
   is still `no`, complete self-verification from another Matrix client:

   ```bash
   mangabaclaw matrix verify self
   ```

   Accept the request in another Matrix client, compare the emoji or decimals,
   and type `yes` only when they match. The command waits for full Matrix
   identity trust before reporting success.

8. If you are intentionally abandoning unrecoverable old history and want a fresh backup baseline for future messages, run:

   ```bash
   mangabaclaw matrix verify backup reset --yes
   ```

   Add `--rotate-recovery-key` only when the old recovery key should stop unlocking the fresh backup.

9. If no server-side key backup exists yet, create one for future recoveries:

   ```bash
   mangabaclaw matrix verify bootstrap
   ```

## Common messages and what they mean

`Failed migrating legacy Matrix client storage: ...`

- Meaning: the Matrix client-side fallback found file-based sidecar state, but the import into SQLite failed. MangabaClaw rolls back completed moves and aborts that fallback instead of silently starting with a fresh store.
- What to do: inspect filesystem permissions or conflicts, keep the old state intact, and retry after fixing the error.

`Matrix is installed from a custom path: ...`

- Meaning: Matrix is pinned to a path install, so mainline updates do not automatically replace it with the default Matrix package.
- What to do: reinstall with `mangabaclaw plugins install @mangabaclaw/matrix` when you want to return to the default Matrix plugin.

`Matrix is installed from a custom path that no longer exists: ...`

- Meaning: your plugin install record points at a local path that is gone.
- What to do: reinstall with `mangabaclaw plugins install @mangabaclaw/matrix`, or if you are running from a repo checkout, `mangabaclaw plugins install ./path/to/local/matrix-plugin`. `mangabaclaw doctor --fix` can also remove the stale Matrix plugin references for you.

### Manual recovery messages

`mangabaclaw matrix verify status` and `mangabaclaw matrix verify backup status` print a `Backup issue:` line plus `Next steps:` guidance when the room-key backup is not healthy on this device:

| Backup issue                                                          | Meaning                                            | Fix                                                                                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `no room-key backup exists on the homeserver`                         | nothing to restore from                            | `mangabaclaw matrix verify bootstrap` to create a room key backup                                                                            |
| `backup decryption key is not loaded on this device`                  | key exists but is not active here                  | `mangabaclaw matrix verify backup restore`; if it still cannot load the key, pipe the recovery key via `--recovery-key-stdin`                |
| `backup decryption key could not be loaded from secret storage (...)` | secret storage load failed or is unsupported       | pipe the recovery key: `printf '%s\n' "$MATRIX_RECOVERY_KEY" \| mangabaclaw matrix verify backup restore --recovery-key-stdin`               |
| `backup key mismatch (...)`                                           | stored key does not match the active server backup | rerun `verify backup restore --recovery-key-stdin` with the active server backup key, or `verify backup reset --yes` for a fresh baseline |
| `backup signature chain is not trusted by this device`                | device does not trust the cross-signing chain yet  | `verify device --recovery-key-stdin`, then `verify self` from another verified client if trust is still incomplete                        |
| `backup exists but is not active on this device`                      | server backup present, local session inactive      | verify the device first, then recheck with `mangabaclaw matrix verify backup status`                                                         |
| `backup trust state could not be fully determined`                    | diagnostics were inconclusive                      | `mangabaclaw matrix verify status --verbose`                                                                                                 |

Other recovery errors:

`Matrix recovery key is required`

- Meaning: you tried a recovery step without supplying a recovery key when one was required.
- What to do: rerun the command with `--recovery-key-stdin`, for example `printf '%s\n' "$MATRIX_RECOVERY_KEY" | mangabaclaw matrix verify device --recovery-key-stdin`.

`Invalid Matrix recovery key: ...`

- Meaning: the provided key could not be parsed or did not match the expected format.
- What to do: retry with the exact recovery key from your Matrix client or recovery-key export.

`Matrix recovery key was applied, but this device still lacks full Matrix identity trust.`

- Meaning: the recovery key unlocked usable backup material, but Matrix has not established full cross-signing identity trust for this device. Check the command output for `Recovery key accepted`, `Backup usable`, `Cross-signing verified`, and `Device verified by owner`.
- What to do: run `mangabaclaw matrix verify self`, accept the request in another Matrix client, compare the SAS, and type `yes` only when it matches. Use `printf '%s\n' "$MATRIX_RECOVERY_KEY" | mangabaclaw matrix verify bootstrap --recovery-key-stdin --force-reset-cross-signing` only when you intentionally want to replace the current cross-signing identity.

If you accept losing unrecoverable old encrypted history, you can instead reset the
current backup baseline with `mangabaclaw matrix verify backup reset --yes`. When the
stored backup secret is broken, that reset also repairs secret storage so the
new backup key can load correctly after restart.

## If encrypted history still does not come back

Run these checks in order:

```bash
mangabaclaw matrix verify status --verbose
mangabaclaw matrix verify backup status --verbose
printf '%s\n' "$MATRIX_RECOVERY_KEY" | mangabaclaw matrix verify backup restore --recovery-key-stdin --verbose
```

If the backup restores successfully but some old rooms are still missing history, those missing keys were probably never backed up by the previous plugin.

## If you want to start fresh for future messages

If you accept losing unrecoverable old encrypted history and only want a clean backup baseline going forward, run these commands in order:

```bash
mangabaclaw matrix verify backup reset --yes
mangabaclaw matrix verify backup status --verbose
mangabaclaw matrix verify status
```

If the device is still unverified after that, finish verification from your Matrix client by comparing the SAS emoji or decimal codes and confirming that they match.

## Related

- [Matrix](/channels/matrix): channel setup and config.
- [Matrix push rules](/channels/matrix-push-rules): notification routing.
- [Doctor](/gateway/doctor): health check and automatic migration trigger.
- [Migration guide](/install/migrating): all migration paths (machine moves, cross-system imports).
- [Plugins](/tools/plugin): plugin install and registration.
