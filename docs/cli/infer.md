---
summary: "Infer-first CLI for provider-backed model, image, audio, TTS, video, web, and embedding workflows"
read_when:
  - Adding or modifying `mangabaclaw infer` commands
  - Designing stable headless capability automation
title: "Inference CLI"
---

`mangabaclaw infer` is the canonical headless surface for provider-backed inference. It exposes capability families (`model`, `image`, `audio`, `tts`, `video`, `web`, `embedding`), not raw gateway RPC names or agent tool ids. `mangabaclaw capability ...` is an alias for the same command tree.

Reasons to prefer it over a one-off provider wrapper:

- Reuses providers and models already configured in MangabaClaw.
- Stable `--json` envelope for scripts and agent-driven automation (see [JSON output](#json-output)).
- Runs the normal local path without the gateway for most subcommands.
- For end-to-end provider checks, it exercises the shipped CLI, config loading, default-agent resolution, bundled plugin activation, and the shared capability runtime before the provider request goes out.

## Turn infer into a skill

Copy and paste this to an agent:

```text
Read https://docs.mangabaclaw.ai/cli/infer, then create a skill that routes my common workflows to `mangabaclaw infer`.
Focus on model runs, image generation, video generation, audio transcription, TTS, web search, and embeddings.
```

A good infer-based skill maps common user intents to the right subcommand, includes a few canonical examples per workflow, prefers `mangabaclaw infer ...` over lower-level alternatives, and does not re-document the entire infer surface in the skill body.

## Command tree

```text
 mangabaclaw infer
  list
  inspect

  model
    run
    list
    inspect
    providers
    auth login
    auth logout
    auth status

  image
    generate
    edit
    describe
    describe-many
    providers

  audio
    transcribe
    providers

  tts
    convert
    voices
    providers
    personas
    status
    enable
    disable
    set-provider
    set-persona

  video
    generate
    describe
    providers

  web
    search
    fetch
    providers

  embedding
    create
    providers
```

`infer list` / `infer inspect --name <capability>` show this tree as data (capability id, transports, description).

## Common tasks

| Task                          | Command                                                                                       | Notes                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Run a text/model prompt       | `mangabaclaw infer model run --prompt "..." --json`                                              | Local by default                                      |
| Run a model prompt on images  | `mangabaclaw infer model run --prompt "Describe this" --file ./image.png --model provider/model` | Repeat `--file` for multiple images                   |
| Generate an image             | `mangabaclaw infer image generate --prompt "..." --json`                                         | Use `image edit` when starting from an existing file  |
| Describe an image file or URL | `mangabaclaw infer image describe --file ./image.png --prompt "..." --json`                      | `--model` must be an image-capable `<provider/model>` |
| Transcribe audio              | `mangabaclaw infer audio transcribe --file ./memo.m4a --json`                                    | `--model` must be `<provider/model>`                  |
| Synthesize speech             | `mangabaclaw infer tts convert --text "..." --output ./speech.mp3 --json`                        | `tts status` only runs through the gateway            |
| Generate a video              | `mangabaclaw infer video generate --prompt "..." --json`                                         | Supports provider hints such as `--resolution`        |
| Describe a video file         | `mangabaclaw infer video describe --file ./clip.mp4 --json`                                      | `--model` must be `<provider/model>`                  |
| Search the web                | `mangabaclaw infer web search --query "..." --json`                                              |                                                       |
| Fetch a web page              | `mangabaclaw infer web fetch --url https://example.com --json`                                   |                                                       |
| Create embeddings             | `mangabaclaw infer embedding create --text "..." --json`                                         |                                                       |

## Behavior

- Use `--json` when the output feeds another command or script; text output otherwise.
- Use `--provider` or `--model provider/model` to pin a specific backend.
- Use `model run --thinking <level>` for a one-shot thinking/reasoning override: `off`, `minimal`, `low`, `medium`, `high`, `adaptive`, `xhigh`, or `max`.
- For `image describe`, `audio transcribe`, and `video describe`, `--model` must use the form `<provider/model>`.
- For `image describe`, `--file` accepts local paths and HTTP(S) URLs; remote URLs go through the normal media-fetch SSRF policy.
- Stateless execution commands (`model run`, `image *`, `audio *`, `video *`, `web *`, `embedding *`) default to local. Gateway-managed state commands (`tts status`) default to gateway.
- The local path never requires the gateway to be running.
- Provider inventory commands whose `configured` state can come from saved agent auth accept
  `--agent <id>`. Without it, they use `agents.defaults.systemAgent.agentId` or the sole configured
  agent; explicit multi-agent fleets with no system owner must pass `--agent`. The provider catalog
  remains aggregate; `--agent` scopes saved-auth and per-agent selection facts. Gateway-owned TTS
  provider state remains Gateway-global, so `tts providers --gateway` does not accept `--agent`.
- Commands that resolve agent-owned model or auth state (`model run`, `image generate`, `image edit`,
  `image describe`, `image describe-many`, `audio transcribe`, `video generate`, `video describe`,
  `embedding create`, and `model auth login/logout/status`) also accept `--agent <id>`. They resolve
  an explicit id first, then `agents.defaults.systemAgent.agentId`, then the sole configured agent.
- Generated image and video `--output` files are staged beside the destination and replace it only after the complete buffer is written; a failed write leaves an existing destination unchanged.
- Local `model run` is a lean one-shot provider completion: it resolves the configured agent model and auth but does not start a chat-agent turn, load tools, or open bundled MCP servers.
- `model run --file` attaches image files (auto-detected MIME type) to the prompt; repeat `--file` for multiple images. Non-image files are rejected — use `infer audio transcribe` or `infer video describe` instead.
- `model run --gateway` exercises Gateway routing, saved auth, provider selection, and the embedded runtime, but stays a raw model probe: no prior session transcript, bootstrap/AGENTS context, tools, or bundled MCP servers.
- `model run --gateway --model <provider/model>` requires a trusted-operator gateway credential, because it asks the Gateway to run a one-off provider/model override.

## Model

Text inference and model/provider inspection.

```bash
mangabaclaw infer model run --prompt "Reply with exactly: smoke-ok" --json
mangabaclaw infer model run --prompt "Summarize this changelog entry" --model openai/gpt-5.4 --json
mangabaclaw infer model run --prompt "Describe this image in one sentence" --file ./photo.jpg --model google/gemini-2.5-flash --json
mangabaclaw infer model run --prompt "Use more reasoning here" --thinking high --json
mangabaclaw infer model providers --agent <id> --json
mangabaclaw infer model inspect --model gpt-5.6-sol --json
```

Use full `<provider/model>` refs with `--local` to smoke-test one provider without starting the Gateway or loading the agent tool surface:

```bash
mangabaclaw infer model run --local --model anthropic/claude-sonnet-4-6 --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model cerebras/zai-glm-4.7 --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model google/gemini-2.5-flash --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model groq/llama-3.1-8b-instant --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model mistral/mistral-medium-3-5 --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model mistral/mistral-small-latest --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model openai/gpt-5.6-luna --prompt "Reply with exactly: pong" --json
mangabaclaw infer model run --local --model ollama/qwen2.5vl:7b --prompt "Describe this image." --file ./photo.jpg --json
```

Notes:

- Local `model run` is the narrowest CLI smoke for provider/model/auth health: for non-ChatGPT-Codex providers it sends only the supplied prompt.
- Local `model run --model <provider/model>` can resolve exact bundled static-catalog rows (the same rows `mangabaclaw models list --all` shows) before that provider is written to config. Provider auth is still required; missing credentials fail as auth errors, not `Unknown model`.
- For Mistral Medium 3.5 reasoning probes, leave temperature unset/default. Mistral rejects `reasoning_effort="high"` with `temperature: 0`; use default temperature or a non-zero value such as `0.7`.
- OpenAI ChatGPT/Codex OAuth (`openai-chatgpt-responses` API) local probes add a minimal system instruction so the transport can populate its required `instructions` field — no full agent context, tools, memory, or session transcript.
- `model run --file` attaches image content directly to the single user message. Common formats (PNG, JPEG, WebP) work when MIME type is detected as `image/*`; unsupported or unrecognized files fail before the provider is called. Use `infer image describe` instead when you want MangabaClaw's image-model routing and fallbacks rather than a direct multimodal-model probe.
- The selected model must support image input; text-only models may reject the request at the provider layer.
- `model run --prompt` must contain non-whitespace text; empty prompts are rejected before any provider or Gateway call.
- Local `model run` exits non-zero when the provider returns no text output, so unreachable providers and empty completions do not look like successful probes.
- Use `model run --gateway` to test Gateway routing or agent-runtime setup while keeping the model input raw. Use `mangabaclaw agent` or a chat surface for full agent context, tools, memory, and session transcript.
- `--thinking adaptive` maps to the completion-runtime level `medium`; `--thinking max` maps to `max` for OpenAI models that support the native max effort, otherwise `xhigh`.
- `model auth login`, `model auth logout`, and `model auth status` manage saved provider auth state.

## Image

Generation, edit, and description.

```bash
mangabaclaw infer image generate --prompt "friendly lobster illustration" --json
mangabaclaw infer image generate --prompt "cinematic product photo of headphones" --json
mangabaclaw infer image generate --model openai/gpt-image-1.5 --output-format png --background transparent --prompt "simple red circle sticker on a transparent background" --json
mangabaclaw infer image generate --model openai/gpt-image-2 --quality low --openai-moderation low --prompt "low-cost draft poster" --json
mangabaclaw infer image generate --prompt "slow image backend" --timeout-ms 180000 --json
mangabaclaw infer image edit --file ./logo.png --model openai/gpt-image-1.5 --output-format png --background transparent --prompt "keep the logo, remove the background" --json
mangabaclaw infer image edit --file ./poster.png --prompt "make this a vertical story ad" --size 2160x3840 --aspect-ratio 9:16 --resolution 4K --json
mangabaclaw infer image describe --file ./photo.jpg --json
mangabaclaw infer image describe --file https://example.com/photo.png --json
mangabaclaw infer image describe --file ./receipt.jpg --prompt "Extract the merchant, date, and total" --json
mangabaclaw infer image describe-many --file ./before.png --file ./after.png --prompt "Compare the screenshots and list visible UI changes" --json
mangabaclaw infer image describe --file ./ui-screenshot.png --model openai/gpt-5.4-mini --json
mangabaclaw infer image describe --file ./photo.jpg --model ollama/qwen2.5vl:7b --prompt "Describe the image in one sentence" --timeout-ms 300000 --json
```

Notes:

- Use `image edit` when starting from existing input files; `--size`, `--aspect-ratio`, or `--resolution` add geometry hints on providers/models that support them.
- `--output-format png --background transparent` with `--model openai/gpt-image-1.5` gives transparent-background OpenAI PNG output; `--openai-background` is an OpenAI-specific alias for the same hint. Providers that do not declare background support report it as an ignored override (see `ignoredOverrides` in the [JSON envelope](#json-output)).
- `--quality low|medium|high|auto` works for providers that support image-quality hints, including OpenAI. OpenAI also accepts `--openai-moderation low|auto`.
- `image providers --json` lists which bundled image providers are discoverable, configured, selected, and which generation/edit capabilities each exposes.
- `image generate --model <provider/model> --json` is the narrowest live smoke for image-generation changes:

  ```bash
  mangabaclaw infer image providers --json
  mangabaclaw infer image generate \
    --model google/gemini-3.1-flash-image \
    --prompt "Minimal flat test image: one blue square on a white background, no text." \
    --output ./mangabaclaw-infer-image-smoke.png \
    --json
  ```

  The response reports `ok`, `provider`, `model`, `attempts`, and written output paths. When `--output` is set, the final extension may follow the provider's returned MIME type.

- For `image describe` and `image describe-many`, use `--prompt` for a task-specific instruction (OCR, comparison, UI inspection, concise captioning).
- Use `--timeout-ms` for slow local vision models or cold Ollama starts.
- For `image describe`, an explicit `--model` (must be an image-capable `<provider/model>`) runs first, then tries configured `agents.defaults.imageModel.fallbacks` if that call fails. Input-preparation errors (missing file, unsupported URL) fail before any fallback attempt, and the model must be image-capable in the model catalog or provider config.
- For local Ollama vision models, pull the model first and set `OLLAMA_API_KEY` to any placeholder value, for example `ollama-local`. See [Ollama](/providers/ollama#vision-and-image-description).

## Audio

File transcription (not realtime session management).

```bash
mangabaclaw infer audio transcribe --file ./memo.m4a --json
mangabaclaw infer audio transcribe --agent <id> --file ./memo.m4a --json
mangabaclaw infer audio transcribe --file ./team-sync.m4a --language en --prompt "Focus on names and action items" --json
mangabaclaw infer audio transcribe --file ./memo.m4a --model openai/whisper-1 --json
```

`--model` must be `<provider/model>`.

## TTS

Speech synthesis and TTS provider/persona state.

```bash
mangabaclaw infer tts convert --text "hello from mangabaclaw" --output ./hello.mp3 --json
mangabaclaw infer tts convert --text "Your build is complete" --output ./build-complete.mp3 --json
mangabaclaw infer tts convert --provider xiaomi --text "Provider-only selection" --output ./xiaomi.mp3 --json
mangabaclaw infer tts providers --json
mangabaclaw infer tts personas --json
mangabaclaw infer tts status --json
```

Notes:

- `tts status` only supports `--gateway` (it reflects gateway-managed TTS state).
- Local and loopback-Gateway `tts convert --output` copies stage beside the destination and replace it only after success; a failed copy leaves an existing file unchanged.
- Use `tts convert --provider <id>` when selecting a provider without overriding its model.
- Use `tts providers`, `tts voices`, `tts personas`, `tts set-provider`, and `tts set-persona` to inspect and configure TTS behavior.

## Video

Generation and description.

```bash
mangabaclaw infer video generate --prompt "cinematic sunset over the ocean" --json
mangabaclaw infer video generate --prompt "slow drone shot over a forest lake" --resolution 768P --duration 6 --json
mangabaclaw infer video describe --file ./clip.mp4 --json
mangabaclaw infer video describe --agent <id> --file ./clip.mp4 --json
mangabaclaw infer video describe --file ./clip.mp4 --model openai/gpt-5.4-mini --json
```

Notes:

- `video generate` accepts `--size`, `--aspect-ratio`, `--resolution`, `--duration`, `--audio`, `--watermark`, and `--timeout-ms`, forwarded to the video-generation runtime.
- Provider-hosted video downloads reject empty, text, and JSON responses instead of reporting an unusable file as successful output.
- With `--output`, URL-backed video streams to a sibling temporary file and replaces the destination only after the complete non-empty download succeeds; a failed stream leaves an existing destination unchanged.
- `--model` must be `<provider/model>` for `video describe`.

## Web

Search and fetch.

```bash
mangabaclaw infer web search --query "MangabaClaw docs" --json
mangabaclaw infer web search --query "MangabaClaw infer web providers" --json
mangabaclaw infer web fetch --url https://docs.mangabaclaw.ai/cli/infer --json
mangabaclaw infer web providers --agent <id> --json
```

`web providers` lists available, configured, and selected providers for search and fetch.

## Embedding

Vector creation and embedding-provider inspection.

```bash
mangabaclaw infer embedding create --text "friendly lobster" --json
mangabaclaw infer embedding create --text "customer support ticket: delayed shipment" --model openai/text-embedding-3-large --json
mangabaclaw infer embedding providers --agent <id> --json
```

## JSON output

Infer commands normalize JSON output under a shared envelope:

```json
{
  "ok": true,
  "capability": "image.generate",
  "transport": "local",
  "provider": "openai",
  "model": "gpt-image-2",
  "attempts": [],
  "outputs": []
}
```

Stable top-level fields:

- `ok`
- `capability`
- `transport`
- `provider`
- `model`
- `attempts`
- `inputs` (image attachments sent with the request, when applicable)
- `outputs`
- `ignoredOverrides` (hint keys a provider does not support, when applicable)
- `error`

For generated media commands, `outputs` contains files written by MangabaClaw. Use the `path`, `mimeType`, `size`, and any media-specific dimensions in that array for automation instead of parsing human-readable stdout.

## Common pitfalls

```bash
# Bad
mangabaclaw infer media image generate --prompt "friendly lobster"

# Good
mangabaclaw infer image generate --prompt "friendly lobster"
```

```bash
# Bad
mangabaclaw infer audio transcribe --file ./memo.m4a --model whisper-1 --json

# Good
mangabaclaw infer audio transcribe --file ./memo.m4a --model openai/whisper-1 --json
```

## Related

- [CLI reference](/cli)
- [Models](/concepts/models)
