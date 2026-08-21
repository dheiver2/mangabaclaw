---
summary: "Overview of MangabaClaw onboarding options and flows"
read_when:
  - Choosing an onboarding path
  - Setting up a new environment
title: "Onboarding overview"
sidebarTitle: "Onboarding Overview"
---

MangabaClaw has terminal and macOS app onboarding. Both establish inference first:
they detect existing AI access, require a live completion, and only then start
MangabaClaw to configure the remaining setup. A reachable, configured Gateway
whose default agent already has a configured model skips onboarding and opens
the normal agent UI. The terminal flow also offers the full classic wizard for
detailed setup.

## Which path should I use?

|                | CLI onboarding                         | macOS app onboarding                                          |
| -------------- | -------------------------------------- | ------------------------------------------------------------- |
| **Platforms**  | macOS, Linux, Windows (native or WSL2) | macOS only                                                    |
| **Interface**  | Inference setup, then MangabaClaw         | Inference setup, then MangabaClaw                                |
| **Best for**   | Servers, headless, full control        | Desktop Mac, visual setup                                     |
| **Automation** | `--non-interactive` for scripts        | Manual only                                                   |
| **Command**    | `mangabaclaw onboard`                     | [Download the app](/platforms/macos#download), then launch it |

Most users should start with **CLI onboarding** — it works everywhere and gives
you the most control.

## What onboarding configures

The guided inference phase establishes only:

1. **Model provider and auth** — detected access or a verified provider sign-in,
   API key, or token
2. **Verified inference** — a real completion on the default agent's effective
   model

After that completion passes, MangabaClaw can configure the workspace, Gateway,
Gateway service, channels, agents, plugins, and other optional features.

The classic CLI wizard can additionally configure:

1. **Channels** (optional) — built-in and bundled chat channels such as
   Discord, Feishu, Google Chat, iMessage, Mattermost, Microsoft Teams,
   Telegram, WhatsApp, and more
2. **Advanced Gateway controls** — remote mode, network settings, and daemon choices

## CLI onboarding

Run in any terminal:

```bash
mangabaclaw onboard
```

The guided flow detects existing AI access, live-tests candidates in order,
and falls through on failure. If detection is exhausted, it shows OpenAI,
Anthropic, xAI (Grok), Google, and OpenRouter first. **More…** contains the
remaining providers in provider groups, with regions, plans, and supported
browser, device, API-key, or token methods in a second menu. It saves the model
and credential only after a passing completion, then starts MangabaClaw to
configure the workspace, Gateway, channels, agents, plugins, and other optional
features. **Skip for now** exits without starting MangabaClaw. There is no
in-flow classic handoff; exit and run `mangabaclaw onboard --classic` when you want
the classic wizard instead.

After inference passes, MangabaClaw can hand channel setup to a masked terminal
wizard. It does not open guided or classic provider setup; exit MangabaClaw and
run `mangabaclaw onboard` to change the model provider or its authentication.

Use `mangabaclaw onboard --classic` for detailed model/auth, channel, skill,
remote Gateway, or import setup. Adding `--install-daemon` also selects the
classic flow and installs the background service in one step. Use `mangabaclaw
setup` for conversational non-inference setup and repair. `mangabaclaw
onboard --modern` is a compatibility alias that uses the same live-inference
gate.

Full reference: [Onboarding (CLI)](/start/wizard)
CLI command docs: [`mangabaclaw onboard`](/cli/onboard)

## macOS app onboarding

[Download the macOS app](/platforms/macos#download), then open it. If its
configured local or remote Gateway is reachable
and the default agent already has a configured model, the app skips onboarding
and MangabaClaw and opens the normal agent UI immediately.

For a fresh or incomplete Gateway, the first-run flow detects existing AI
access (Claude Code, Codex, or API keys), live-tests the best
option, and saves it only after a real reply — falling back automatically and
offering a verified manual API-key step when nothing is found. Sensitive
credentials use masked input. Once inference passes, MangabaClaw starts and
helps configure the rest.

Gemini CLI remains available as an explicitly configured runtime after setup,
but Gemini CLI and Antigravity are not offered as detected inference routes.
Use Google AI Studio API-key or Vertex AI for guided setup. The optional Gemini
CLI runtime specifically requires an AI Studio API-key profile.

Full reference: [Onboarding (macOS App)](/start/onboarding)

## Custom or unlisted providers

If your provider is not listed, run `mangabaclaw onboard --classic`, choose
**Custom Provider**, and enter:

- Endpoint compatibility: OpenAI-compatible (`/chat/completions`), OpenAI Responses-compatible (`/responses`), Anthropic-compatible (`/messages`), or unknown (probes all three and auto-detects)
- Base URL and API key (API key is optional if the endpoint does not require one)
- Model ID and optional model alias

Multiple custom endpoints can coexist — each gets its own endpoint ID.

## Related

- [Getting started](/start/getting-started)
- [CLI setup reference](/start/wizard-cli-reference)
