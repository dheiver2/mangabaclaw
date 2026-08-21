---
summary: "Generated inventory of MangabaClaw plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the canonical internal vs external plugin list
title: "Plugin inventory"
---

# Plugin inventory

This page is generated from top-level `extensions/*/mangabaclaw.plugin.json`
manifests and the root npm package `files` exclusions. Optional `package.json`
metadata enriches package and distribution details. Regenerate it with:

```bash
pnpm plugins:inventory:gen
```

## Definitions

- **Core npm package:** built into the `mangabaclaw` npm package and available without a separate plugin install.
- **Official external package:** MangabaClaw-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Use the install route in each entry to decide whether install is needed. Plugins
that say `included in MangabaClaw` are already present in the core package.
Official external packages need one install, then a Gateway restart.

For example, Discord is an official external package:

```bash
mangabaclaw plugins install @mangabaclaw/discord
mangabaclaw gateway restart
mangabaclaw plugins inspect discord --runtime --json
```

During the launch cutover, ordinary bare package specs still install from npm.
Use `clawhub:@mangabaclaw/discord` or `npm:@mangabaclaw/discord` when you need an
explicit source. After install, follow the plugin's setup doc, such as
[Discord](/channels/discord), to add credentials and channel config. See
[Manage plugins](/plugins/manage-plugins) for update, uninstall, and publishing
commands.

Each entry lists the package, distribution route, and description.

## Core npm package

57 plugins

- **[active-memory](/plugins/reference/active-memory)** (`mangabaclaw`) - included in MangabaClaw. Runs bounded pre-reply memory retrieval and implements per-agent Remember across conversations for eligible private conversations.

- **[admin-http-rpc](/plugins/reference/admin-http-rpc)** (`@mangabaclaw/admin-http-rpc`) - included in MangabaClaw. MangabaClaw admin HTTP RPC endpoint.

- **[alibaba](/plugins/reference/alibaba)** (`@mangabaclaw/alibaba-provider`) - included in MangabaClaw. Adds video generation provider support.

- **[anthropic](/plugins/reference/anthropic)** (`@mangabaclaw/anthropic-provider`) - included in MangabaClaw. Anthropic models, Claude CLI, and native Claude session catalog.

- **[azure-speech](/plugins/reference/azure-speech)** (`@mangabaclaw/azure-speech`) - included in MangabaClaw. Azure AI Speech text-to-speech (MP3, native Ogg/Opus voice notes, PCM telephony).

- **[beam](/plugins/reference/beam)** (`@mangabaclaw/beam`) - included in MangabaClaw. Read-only coding-session Beam receiver.

- **[bonjour](/plugins/reference/bonjour)** (`@mangabaclaw/bonjour`) - included in MangabaClaw. Advertise the local MangabaClaw gateway over Bonjour/mDNS.

- **[browser](/plugins/reference/browser)** (`@mangabaclaw/browser-plugin`) - included in MangabaClaw. Adds agent-callable tools.

- **[canvas](/plugins/reference/canvas)** (`@mangabaclaw/canvas-plugin`) - included in MangabaClaw. Presents hosted widget documents on paired macOS panels.

- **[clawrouter](/plugins/reference/clawrouter)** (`@mangabaclaw/clawrouter`) - included in MangabaClaw. Adds ClawRouter model provider support to MangabaClaw.

- **[copilot-proxy](/plugins/reference/copilot-proxy)** (`@mangabaclaw/copilot-proxy`) - included in MangabaClaw. Adds Copilot Proxy model provider support to MangabaClaw.

- **[crabbox](/plugins/reference/crabbox)** (`@mangabaclaw/crabbox-provider`) - included in MangabaClaw. Cloud worker provider backed by the Crabbox CLI.

- **[cua-computer](/plugins/reference/cua-computer)** (`@mangabaclaw/cua-computer`) - included in MangabaClaw. Experimental CUA Driver computer control for macOS, Windows, and Linux node hosts.

- **[deepgram](/plugins/reference/deepgram)** (`@mangabaclaw/deepgram-provider`) - included in MangabaClaw. Adds media understanding provider support. Adds realtime transcription provider support.

- **[device-pair](/plugins/reference/device-pair)** (`mangabaclaw`) - included in MangabaClaw. Generate setup codes and approve device pairing requests.

- **[document-extract](/plugins/reference/document-extract)** (`@mangabaclaw/document-extract-plugin`) - included in MangabaClaw. Extract text and fallback page images from local document attachments.

- **[elevenlabs](/plugins/reference/elevenlabs)** (`@mangabaclaw/elevenlabs-speech`) - included in MangabaClaw. Adds media understanding provider support. Adds realtime transcription provider support. Adds text-to-speech provider support.

- **[fal](/plugins/reference/fal)** (`@mangabaclaw/fal-provider`) - included in MangabaClaw. Adds fal model provider support to MangabaClaw.

- **[file-transfer](/plugins/reference/file-transfer)** (`@mangabaclaw/file-transfer`) - included in MangabaClaw. Fetch, list, and write files on paired nodes via dedicated node commands. Bypasses bash stdout truncation by using base64 over node.invoke for binaries up to 16 MB.

- **[github-copilot](/plugins/reference/github-copilot)** (`@mangabaclaw/github-copilot-provider`) - included in MangabaClaw. Adds GitHub Copilot model provider support to MangabaClaw.

- **[google](/plugins/reference/google)** (`@mangabaclaw/google-plugin`) - included in MangabaClaw. Adds Google, Google Gemini CLI, Google Vertex model provider support to MangabaClaw.

- **[huggingface](/plugins/reference/huggingface)** (`@mangabaclaw/huggingface-provider`) - included in MangabaClaw. Adds Hugging Face model provider support to MangabaClaw.

- **[linux-node](/plugins/reference/linux-node)** (`@mangabaclaw/linux-node`) - included in MangabaClaw. Desktop notifications, camera capture, and location for Linux node hosts.

- **[litellm](/plugins/reference/litellm)** (`@mangabaclaw/litellm-provider`) - included in MangabaClaw. Adds LiteLLM model provider support to MangabaClaw.

- **[llm-task](/plugins/reference/llm-task)** (`@mangabaclaw/llm-task`) - included in MangabaClaw. Generic JSON-only LLM tool for structured tasks callable from workflows.

- **[lmstudio](/plugins/reference/lmstudio)** (`@mangabaclaw/lmstudio-provider`) - included in MangabaClaw. Adds LM Studio model provider support to MangabaClaw.

- **[logbook](/plugins/reference/logbook)** (`@mangabaclaw/logbook`) - included in MangabaClaw. Automatic work journal: captures periodic screen snapshots from a paired node and turns them into a reviewable timeline of your day.

- **[memory-core](/plugins/reference/memory-core)** (`@mangabaclaw/memory-core`) - included in MangabaClaw. Adds agent-callable tools.

- **[memory-wiki](/plugins/reference/memory-wiki)** (`@mangabaclaw/memory-wiki`) - included in MangabaClaw. Persistent wiki compiler and Obsidian-friendly knowledge vault for MangabaClaw.

- **[microsoft](/plugins/reference/microsoft)** (`@mangabaclaw/microsoft-speech`) - included in MangabaClaw. Adds text-to-speech provider support.

- **[microsoft-foundry](/plugins/reference/microsoft-foundry)** (`@mangabaclaw/microsoft-foundry`) - included in MangabaClaw. Adds Microsoft Foundry model provider support to MangabaClaw.

- **[migrate-claude](/plugins/reference/migrate-claude)** (`@mangabaclaw/migrate-claude`) - included in MangabaClaw. Imports Claude Code and Claude Desktop instructions, MCP servers, skills, and safe configuration into MangabaClaw.

- **[migrate-hermes](/plugins/reference/migrate-hermes)** (`@mangabaclaw/migrate-hermes`) - included in MangabaClaw. Imports Hermes configuration, memories, skills, and supported credentials into MangabaClaw.

- **[minimax](/plugins/reference/minimax)** (`@mangabaclaw/minimax-provider`) - included in MangabaClaw. Adds MiniMax, MiniMax Portal model provider support to MangabaClaw.

- **[nvidia](/plugins/reference/nvidia)** (`@mangabaclaw/nvidia-provider`) - included in MangabaClaw. Adds NVIDIA model provider support to MangabaClaw.

- **[oc-path](/plugins/reference/oc-path)** (`@mangabaclaw/oc-path`) - included in MangabaClaw. Adds the mangabaclaw path CLI for oc:// workspace file addressing.

- **[ollama](/plugins/reference/ollama)** (`@mangabaclaw/ollama-provider`) - included in MangabaClaw. Adds Ollama, Ollama Cloud model provider support to MangabaClaw.

- **[onepassword](/plugins/reference/onepassword)** (`@mangabaclaw/onepassword`) - included in MangabaClaw. 1Password SecretRef resolver and curated agent broker with approval policy and SQLite audit history.

- **[open-prose](/plugins/reference/open-prose)** (`@mangabaclaw/open-prose`) - included in MangabaClaw. OpenProse VM skill pack with a /prose slash command.

- **[openai](/plugins/reference/openai)** (`@mangabaclaw/openai-provider`) - included in MangabaClaw. Adds OpenAI model provider support to MangabaClaw.

- **[opencode-go](/plugins/reference/opencode-go)** (`@mangabaclaw/opencode-go-provider`) - included in MangabaClaw. Adds OpenCode Go model provider support to MangabaClaw.

- **[openrouter](/plugins/reference/openrouter)** (`@mangabaclaw/openrouter-provider`) - included in MangabaClaw. Adds OpenRouter model provider support to MangabaClaw.

- **[policy](/plugins/reference/policy)** (`@mangabaclaw/policy`) - included in MangabaClaw. Adds policy-backed doctor checks for workspace conformance.

- **[reef](/plugins/reference/reef)** (`@mangabaclaw/reef`) - included in MangabaClaw. Guarded end-to-end encrypted claw channel.

- **[runway](/plugins/reference/runway)** (`@mangabaclaw/runway-provider`) - included in MangabaClaw. Adds video generation provider support.

- **[senseaudio](/plugins/reference/senseaudio)** (`@mangabaclaw/senseaudio-provider`) - included in MangabaClaw. Adds media understanding provider support.

- **[sglang](/plugins/reference/sglang)** (`@mangabaclaw/sglang-provider`) - included in MangabaClaw. Adds SGLang model provider support to MangabaClaw.

- **[talk-voice](/plugins/reference/talk-voice)** (`mangabaclaw`) - included in MangabaClaw. Manage Talk voice selection (list/set).

- **[telegram](/plugins/reference/telegram)** (`@mangabaclaw/telegram`) - included in MangabaClaw. Adds the Telegram channel surface for sending and receiving MangabaClaw messages.

- **[together](/plugins/reference/together)** (`@mangabaclaw/together-provider`) - included in MangabaClaw. Adds Together model provider support to MangabaClaw.

- **[tts-local-cli](/plugins/reference/tts-local-cli)** (`@mangabaclaw/tts-local-cli`) - included in MangabaClaw. Adds text-to-speech provider support.

- **[vault](/plugins/reference/vault)** (`@mangabaclaw/vault`) - included in MangabaClaw. HashiCorp Vault SecretRef provider integration.

- **[vllm](/plugins/reference/vllm)** (`@mangabaclaw/vllm-provider`) - included in MangabaClaw. Adds vLLM model provider support to MangabaClaw.

- **[web-readability](/plugins/reference/web-readability)** (`@mangabaclaw/web-readability-plugin`) - included in MangabaClaw. Extract readable article content from local HTML web fetch responses.

- **[webhooks](/plugins/reference/webhooks)** (`@mangabaclaw/webhooks`) - included in MangabaClaw. Authenticated inbound webhooks that bind external automation to MangabaClaw TaskFlows.

- **[workboard](/plugins/reference/workboard)** (`@mangabaclaw/workboard`) - included in MangabaClaw. Dashboard workboard for agent-owned issues and sessions.

- **[xai](/plugins/reference/xai)** (`@mangabaclaw/xai-plugin`) - included in MangabaClaw. Adds xAI model provider support to MangabaClaw.

## Official external packages

90 plugins

- **[acpx](/plugins/reference/acpx)** (`@mangabaclaw/acpx`) - npm; ClawHub. MangabaClaw ACP runtime backend with plugin-owned session and transport management.

- **[amazon-bedrock](/plugins/reference/amazon-bedrock)** (`@mangabaclaw/amazon-bedrock-provider`) - npm; ClawHub. MangabaClaw Amazon Bedrock provider plugin with model discovery, embeddings, and guardrail support.

- **[amazon-bedrock-mantle](/plugins/reference/amazon-bedrock-mantle)** (`@mangabaclaw/amazon-bedrock-mantle-provider`) - npm; ClawHub. MangabaClaw Amazon Bedrock Mantle provider plugin for OpenAI-compatible model routing.

- **[anthropic-vertex](/plugins/reference/anthropic-vertex)** (`@mangabaclaw/anthropic-vertex-provider`) - npm; ClawHub. MangabaClaw Anthropic Vertex provider plugin for Claude models on Google Vertex AI.

- **[arcee](/plugins/reference/arcee)** (`@mangabaclaw/arcee-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/arcee-provider`. Adds Arcee model provider support to MangabaClaw.

- **[baseten](/plugins/reference/baseten)** (`@mangabaclaw/baseten-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/baseten-provider`. MangabaClaw Baseten provider plugin.

- **[brave](/plugins/reference/brave)** (`@mangabaclaw/brave-plugin`) - npm; ClawHub. MangabaClaw Brave Search provider plugin for web search.

- **[buzz](/plugins/reference/buzz)** (`@mangabaclaw/buzz`) - npm; ClawHub: `clawhub:@mangabaclaw/buzz`. Connect MangabaClaw agents to Buzz rooms.

- **[byteplus](/plugins/reference/byteplus)** (`@mangabaclaw/byteplus-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/byteplus-provider`. Adds BytePlus, BytePlus Plan model provider support to MangabaClaw.

- **[cerebras](/plugins/reference/cerebras)** (`@mangabaclaw/cerebras-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/cerebras-provider`. Adds Cerebras model provider support to MangabaClaw.

- **[chutes](/plugins/reference/chutes)** (`@mangabaclaw/chutes-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/chutes-provider`. Adds Chutes model provider support to MangabaClaw.

- **[clickclack](/plugins/reference/clickclack)** (`@mangabaclaw/clickclack`) - npm; ClawHub: `clawhub:@mangabaclaw/clickclack`. Adds the Clickclack channel surface for sending and receiving MangabaClaw messages.

- **[cloudflare-ai-gateway](/plugins/reference/cloudflare-ai-gateway)** (`@mangabaclaw/cloudflare-ai-gateway-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/cloudflare-ai-gateway-provider`. Adds Cloudflare AI Gateway model provider support to MangabaClaw.

- **[codex](/plugins/reference/codex)** (`@mangabaclaw/codex`) - npm; ClawHub. Codex app-server harness and native session catalog.

- **[cohere](/plugins/reference/cohere)** (`@mangabaclaw/cohere-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/cohere-provider`. MangabaClaw Cohere provider plugin.

- **[comfy](/plugins/reference/comfy)** (`@mangabaclaw/comfy-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/comfy-provider`. Adds ComfyUI model provider support to MangabaClaw.

- **[copilot](/plugins/reference/copilot)** (`@mangabaclaw/copilot`) - npm; ClawHub: `clawhub:@mangabaclaw/copilot`. Registers the GitHub Copilot agent runtime.

- **[deepinfra](/plugins/reference/deepinfra)** (`@mangabaclaw/deepinfra-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/deepinfra-provider`. Adds DeepInfra model provider support to MangabaClaw.

- **[deepseek](/plugins/reference/deepseek)** (`@mangabaclaw/deepseek-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/deepseek-provider`. Adds DeepSeek model provider support to MangabaClaw.

- **[diagnostics-otel](/plugins/reference/diagnostics-otel)** (`@mangabaclaw/diagnostics-otel`) - npm; ClawHub: `clawhub:@mangabaclaw/diagnostics-otel`. MangabaClaw diagnostics OpenTelemetry exporter for metrics, traces, and logs.

- **[diagnostics-prometheus](/plugins/reference/diagnostics-prometheus)** (`@mangabaclaw/diagnostics-prometheus`) - npm; ClawHub: `clawhub:@mangabaclaw/diagnostics-prometheus`. MangabaClaw diagnostics Prometheus exporter for runtime metrics.

- **[diffs](/plugins/reference/diffs)** (`@mangabaclaw/diffs`) - npm; ClawHub. MangabaClaw read-only diff viewer plugin and file renderer for agents.

- **[diffs-language-pack](/plugins/reference/diffs-language-pack)** (`@mangabaclaw/diffs-language-pack`) - npm; ClawHub: `clawhub:@mangabaclaw/diffs-language-pack`. Adds syntax highlighting for languages outside the default diffs viewer set.

- **[discord](/plugins/reference/discord)** (`@mangabaclaw/discord`) - npm; ClawHub. MangabaClaw Discord channel plugin for channels, DMs, commands, and app events.

- **[duckduckgo](/plugins/reference/duckduckgo)** (`@mangabaclaw/duckduckgo-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/duckduckgo-plugin`. Adds web search provider support.

- **[exa](/plugins/reference/exa)** (`@mangabaclaw/exa-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/exa-plugin`. Adds web search provider support.

- **[featherless](/plugins/reference/featherless)** (`@mangabaclaw/featherless-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/featherless-provider`. MangabaClaw Featherless AI provider plugin.

- **[feishu](/plugins/reference/feishu)** (`@mangabaclaw/feishu`) - npm; ClawHub. MangabaClaw Feishu/Lark channel plugin for chats and workplace tools (community maintained by @m1heng).

- **[firecrawl](/plugins/reference/firecrawl)** (`@mangabaclaw/firecrawl-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/firecrawl-plugin`. Adds agent-callable tools. Adds web fetch provider support. Adds web search provider support.

- **[fireworks](/plugins/reference/fireworks)** (`@mangabaclaw/fireworks-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/fireworks-provider`. Adds Fireworks model provider support to MangabaClaw.

- **[fish-audio-speech](/plugins/reference/fish-audio-speech)** (`@mangabaclaw/fish-audio-speech`) - npm; ClawHub: `clawhub:@mangabaclaw/fish-audio-speech`. Fish Audio S2.1 hosted text-to-speech with streaming, voice notes, and telephony output.

- **[gmi](/plugins/reference/gmi)** (`@mangabaclaw/gmi-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/gmi-provider`. MangabaClaw GMI Cloud provider plugin.

- **[google-meet](/plugins/reference/google-meet)** (`@mangabaclaw/google-meet`) - npm; ClawHub. MangabaClaw Google Meet participant plugin for joining calls through Chrome or Twilio transports.

- **[googlechat](/plugins/reference/googlechat)** (`@mangabaclaw/googlechat`) - npm; ClawHub. MangabaClaw Google Chat channel plugin for spaces and direct messages.

- **[gradium](/plugins/reference/gradium)** (`@mangabaclaw/gradium-speech`) - npm; ClawHub: `clawhub:@mangabaclaw/gradium-speech`. Adds text-to-speech provider support.

- **[groq](/plugins/reference/groq)** (`@mangabaclaw/groq-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/groq-provider`. Adds Groq model provider support to MangabaClaw.

- **[imessage](/plugins/reference/imessage)** (`@mangabaclaw/imessage`) - npm; ClawHub: `clawhub:@mangabaclaw/imessage`. Adds the iMessage channel surface for sending and receiving MangabaClaw messages.

- **[inworld](/plugins/reference/inworld)** (`@mangabaclaw/inworld-speech`) - npm; ClawHub: `clawhub:@mangabaclaw/inworld-speech`. Inworld streaming text-to-speech (MP3, OGG_OPUS, PCM telephony).

- **[irc](/plugins/reference/irc)** (`@mangabaclaw/irc`) - npm; ClawHub: `clawhub:@mangabaclaw/irc`. Adds the IRC channel surface for sending and receiving MangabaClaw messages.

- **[kilocode](/plugins/reference/kilocode)** (`@mangabaclaw/kilocode-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/kilocode-provider`. Adds Kilocode model provider support to MangabaClaw.

- **[kimi](/plugins/reference/kimi)** (`@mangabaclaw/kimi-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/kimi-provider`. Adds Kimi, Kimi Coding model provider support to MangabaClaw.

- **[line](/plugins/reference/line)** (`@mangabaclaw/line`) - npm; ClawHub. MangabaClaw LINE channel plugin for LINE Bot API chats.

- **[llama-cpp](/plugins/reference/llama-cpp)** (`@mangabaclaw/llama-cpp-provider`) - npm; ClawHub. Managed and external llama.cpp servers for GGUF chat and embeddings.

- **[lobster](/plugins/reference/lobster)** (`@mangabaclaw/lobster`) - npm; ClawHub. Lobster workflow tool plugin for typed pipelines and resumable approvals.

- **[longcat](/plugins/reference/longcat)** (`@mangabaclaw/longcat-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/longcat-provider`. MangabaClaw LongCat provider plugin.

- **[matrix](/plugins/reference/matrix)** (`@mangabaclaw/matrix`) - ClawHub: `clawhub:@mangabaclaw/matrix`; npm. MangabaClaw Matrix channel plugin for rooms and direct messages.

- **[mattermost](/plugins/reference/mattermost)** (`@mangabaclaw/mattermost`) - npm; ClawHub: `clawhub:@mangabaclaw/mattermost`. Adds the Mattermost channel surface for sending and receiving MangabaClaw messages.

- **[memory-lancedb](/plugins/reference/memory-lancedb)** (`@mangabaclaw/memory-lancedb`) - npm; ClawHub. MangabaClaw LanceDB-backed long-term memory plugin with auto-recall, auto-capture, and vector search.

- **[meta](/plugins/reference/meta)** (`@mangabaclaw/meta-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/meta-provider`. Adds Meta model provider support to MangabaClaw.

- **[mistral](/plugins/reference/mistral)** (`@mangabaclaw/mistral-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/mistral-provider`. Adds Mistral model provider support to MangabaClaw.

- **[moonshot](/plugins/reference/moonshot)** (`@mangabaclaw/moonshot-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/moonshot-provider`. Adds Moonshot model provider support to MangabaClaw.

- **[msteams](/plugins/reference/msteams)** (`@mangabaclaw/msteams`) - npm; ClawHub. MangabaClaw Microsoft Teams channel plugin for bot conversations.

- **[mxc](/plugins/reference/mxc)** (`@mangabaclaw/mxc-sandbox`) - npm; ClawHub. OS-level sandboxed tool execution via MXC: runs commands in a Windows ProcessContainer with configured MXC policy files.

- **[nextcloud-talk](/plugins/reference/nextcloud-talk)** (`@mangabaclaw/nextcloud-talk`) - npm; ClawHub. MangabaClaw Nextcloud Talk channel plugin for conversations.

- **[nostr](/plugins/reference/nostr)** (`@mangabaclaw/nostr`) - npm; ClawHub. MangabaClaw Nostr channel plugin for NIP-04 encrypted direct messages.

- **[novita](/plugins/reference/novita)** (`@mangabaclaw/novita-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/novita-provider`. Adds Novita, Novita AI, Novitaai model provider support to MangabaClaw.

- **[opencode](/plugins/reference/opencode)** (`@mangabaclaw/opencode-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/opencode-provider`. Adds OpenCode model provider support to MangabaClaw.

- **[openshell](/plugins/reference/openshell)** (`@mangabaclaw/openshell-sandbox`) - npm; ClawHub. MangabaClaw sandbox backend for the NVIDIA OpenShell CLI with mirrored local workspaces and SSH command execution.

- **[parallel](/tools/parallel-search)** (`@mangabaclaw/parallel-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/parallel-plugin`. Adds web search provider support.

- **[perplexity](/plugins/reference/perplexity)** (`@mangabaclaw/perplexity-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/perplexity-plugin`. Adds web search provider support.

- **[pixverse](/plugins/reference/pixverse)** (`@mangabaclaw/pixverse-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/pixverse-provider`. MangabaClaw PixVerse video generation provider plugin.

- **[qianfan](/plugins/reference/qianfan)** (`@mangabaclaw/qianfan-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/qianfan-provider`. Adds Qianfan model provider support to MangabaClaw.

- **[qqbot](/plugins/reference/qqbot)** (`@tencent-connect/mangabaclaw-qqbot`) - npm. MangabaClaw QQ Bot channel plugin for group and direct-message workflows.

- **[qwen](/plugins/reference/qwen)** (`@mangabaclaw/qwen-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/qwen-provider`. Adds Qwen, Qwen Cloud, Model Studio, DashScope, Qwen Token Plan, Bailian Token Plan model provider support to MangabaClaw.

- **[raft](/plugins/reference/raft)** (`@mangabaclaw/raft`) - npm; ClawHub. MangabaClaw Raft channel plugin for secure CLI wake bridges.

- **[searxng](/plugins/reference/searxng)** (`@mangabaclaw/searxng-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/searxng-plugin`. Adds web search provider support.

- **[signal](/plugins/reference/signal)** (`@mangabaclaw/signal`) - npm; ClawHub: `clawhub:@mangabaclaw/signal`. Adds the Signal channel surface for sending and receiving MangabaClaw messages.

- **[slack](/plugins/reference/slack)** (`@mangabaclaw/slack`) - npm; ClawHub. MangabaClaw Slack channel plugin for channels, DMs, commands, and app events.

- **[sms](/plugins/reference/sms)** (`@mangabaclaw/sms`) - npm; ClawHub: `clawhub:@mangabaclaw/sms`. Twilio SMS/MMS channel plugin for MangabaClaw messages.

- **[stepfun](/plugins/reference/stepfun)** (`@mangabaclaw/stepfun-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/stepfun-provider`. Adds StepFun, StepFun Plan model provider support to MangabaClaw.

- **[synology-chat](/plugins/reference/synology-chat)** (`@mangabaclaw/synology-chat`) - npm; ClawHub. Synology Chat channel plugin for MangabaClaw channels and direct messages.

- **[synthetic](/plugins/reference/synthetic)** (`@mangabaclaw/synthetic-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/synthetic-provider`. Adds Synthetic model provider support to MangabaClaw.

- **[tavily](/plugins/reference/tavily)** (`@mangabaclaw/tavily-plugin`) - npm; ClawHub: `clawhub:@mangabaclaw/tavily-plugin`. Adds agent-callable tools. Adds web search provider support.

- **[teams-meetings](/plugins/reference/teams-meetings)** (`@mangabaclaw/teams-meetings`) - npm; ClawHub: `clawhub:@mangabaclaw/teams-meetings`. Join Microsoft Teams meetings as a Chrome browser guest.

- **[tencent](/plugins/reference/tencent)** (`@mangabaclaw/tencent-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/tencent-provider`. Adds Tencent TokenHub, Tencent Tokenplan model provider support to MangabaClaw.

- **[tlon](/plugins/reference/tlon)** (`@mangabaclaw/tlon`) - npm; ClawHub. MangabaClaw Tlon/Urbit channel plugin for chat workflows.

- **[tokenjuice](/plugins/reference/tokenjuice)** (`@mangabaclaw/tokenjuice`) - npm; ClawHub: `clawhub:@mangabaclaw/tokenjuice`. Compacts exec and bash tool results with tokenjuice reducers.

- **[twitch](/plugins/reference/twitch)** (`@mangabaclaw/twitch`) - npm; ClawHub. MangabaClaw Twitch channel plugin for chat and moderation workflows.

- **[venice](/plugins/reference/venice)** (`@mangabaclaw/venice-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/venice-provider`. Adds Venice model provider support to MangabaClaw.

- **[vercel-ai-gateway](/plugins/reference/vercel-ai-gateway)** (`@mangabaclaw/vercel-ai-gateway-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/vercel-ai-gateway-provider`. Adds Vercel AI Gateway model provider support to MangabaClaw.

- **[voice-call](/plugins/reference/voice-call)** (`@mangabaclaw/voice-call`) - npm; ClawHub. MangabaClaw voice-call plugin for Twilio, Telnyx, and Plivo phone calls.

- **[volcengine](/plugins/reference/volcengine)** (`@mangabaclaw/volcengine-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/volcengine-provider`. Adds Volcengine, Volcengine Plan model provider support to MangabaClaw.

- **[voyage](/plugins/reference/voyage)** (`@mangabaclaw/voyage-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/voyage-provider`. Adds embedding provider support, including memory search.

- **[vydra](/plugins/reference/vydra)** (`@mangabaclaw/vydra-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/vydra-provider`. Adds Vydra model provider support to MangabaClaw.

- **[whatsapp](/plugins/reference/whatsapp)** (`@mangabaclaw/whatsapp`) - ClawHub: `clawhub:@mangabaclaw/whatsapp`; npm. MangabaClaw WhatsApp channel plugin for WhatsApp Web chats.

- **[xiaomi](/plugins/reference/xiaomi)** (`@mangabaclaw/xiaomi-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/xiaomi-provider`. Adds Xiaomi, Xiaomi Token Plan model provider support to MangabaClaw.

- **[zai](/plugins/reference/zai)** (`@mangabaclaw/zai-provider`) - npm; ClawHub: `clawhub:@mangabaclaw/zai-provider`. Adds Z.AI model provider support to MangabaClaw.

- **[zalo](/plugins/reference/zalo)** (`@mangabaclaw/zalo`) - npm; ClawHub. MangabaClaw Zalo channel plugin for bot and webhook chats.

- **[zalouser](/plugins/reference/zalouser)** (`@mangabaclaw/zalouser`) - npm; ClawHub. MangabaClaw Zalo Personal Account plugin via native zca-js integration.

- **[zoom-meetings](/plugins/reference/zoom-meetings)** (`@mangabaclaw/zoom-meetings`) - npm; ClawHub: `clawhub:@mangabaclaw/zoom-meetings`. Join Zoom meetings as a Chrome browser guest.

## Source checkout only

2 plugins

- **[qa-channel](/plugins/reference/qa-channel)** (`@mangabaclaw/qa-channel`) - source checkout only. Adds the QA Channel surface for sending and receiving MangabaClaw messages.

- **[qa-lab](/plugins/reference/qa-lab)** (`@mangabaclaw/qa-lab`) - source checkout only. MangabaClaw QA lab plugin with private debugger UI and scenario runner.
