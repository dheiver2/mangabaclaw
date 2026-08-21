---
summary: "CLI reference for `mangabaclaw clawbot` (legacy alias namespace)"
read_when:
  - You maintain older scripts using `mangabaclaw clawbot ...`
  - You need migration guidance to current commands
title: "Clawbot"
---

# `mangabaclaw clawbot`

Legacy alias namespace kept for backward compatibility. It registers the same QR command as the top-level CLI, so `mangabaclaw clawbot qr` accepts every [`mangabaclaw qr`](/cli/qr) flag.

## Migration

Prefer the modern top-level command:

- `mangabaclaw clawbot qr` -> `mangabaclaw qr`

## Related

- [CLI reference](/cli)
