---
name: diagnose-gateway
description: Diagnose Gateway, config, secrets, channels, and port failures with read-only one-liners.
---

# Diagnose the Gateway

This playbook is read-only: no config writes, no service restarts, no `doctor --fix`, no killing listeners. Never print secret values; report only redacted SecretRef owner state. Every run ends with the observable Prove result or an exact explanation of why it could not be proven.

## Gather

```
mangabaclaw doctor --non-interactive
mangabaclaw gateway status --deep
mangabaclaw config validate
mangabaclaw channels status
mangabaclaw models status
mangabaclaw channels logs --channel <id>
```

On managed installs, bounded recent logs: `./scripts/clawlog.sh` (repo checkout) or the log path printed at gateway startup (`/tmp/mangabaclaw/mangabaclaw-<date>.log` by default).

Check these signatures without guessing:

- invalid config or schema errors (`config validate` names the exact key and line);
- degraded SecretRef owners — report the owner, never ids or values;
- expired or rejected channel authentication (`channels status` per account);
- `EADDRINUSE`, a second gateway listener, or service/config port mismatch (`lsof -nP -iTCP:<port> -sTCP:LISTEN`);
- gateway crash loops: read the last startup stack in the gateway log; a schema-valid config that still crashes startup is a bug — capture the stack and report it.

Correlate timestamps and identify the first owner-boundary failure.

## Mutate

Nothing. This skill changes no state.

## Repair

Translate each finding into the next action, naming the responsible skill when one exists: `configure-channel`, `add-model-provider`, or `cloud-image-bake`. Recommend `mangabaclaw doctor --fix --non-interactive` only as a separately approved step.

## Prove

Repeat the smallest read-only probe that exposes the condition and record its output, for example:

```
mangabaclaw gateway status --deep
mangabaclaw channels status --deep
```

If access, logs, or the gateway are unavailable, report that exact blocker rather than declaring a cause.

## Report

Findings in causal order with evidence for each; current gateway/config/SecretRef/channel/port state; one recommended next skill or operator action. State explicitly that nothing was changed.

Further reference: https://docs.openclaw.ai/gateway/troubleshooting
