# @mangabaclaw/llama-cpp-provider

Official llama.cpp provider for managed and external MangabaClaw model servers.

The `llama-cpp` provider either installs a pinned, integrity-verified
`llama-server` under MangabaClaw's `localService` supervisor or connects to a
server that you already operate. Both choices use `llama-cpp/<model>` references
and MangabaClaw's normal OpenAI-compatible chat transport. Local embeddings require
the managed choice.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/llama-cpp-provider
```

Restart the Gateway after installing or updating the plugin. Interactive setup
shows **Managed local server** and **Existing llama-server** under one
**Local llama.cpp** group.

## Configure managed text inference

After explicit consent, MangabaClaw installs the matching server build and
downloads Gemma 4 E4B IT Q4_K_M (approximately 5.0 GB) plus EmbeddingGemma
(approximately 0.3 GB). The default chat download is offered only on machines
with at least 16 GiB of RAM.

Custom GGUF models remain supported through `params.modelPath`. Rerun llama.cpp
setup after changing the model so MangabaClaw can verify the file and regenerate
the managed router preset.

See the [llama.cpp provider guide](https://docs.mangabaclaw.ai/plugins/llama-cpp)
for platform requirements, custom GGUF configuration, diagnostics, and repair.

## Connect to an existing server

Choose **Existing llama-server** during setup and enter the endpoint and
optional API key. MangabaClaw passively discovers single-model and router catalogs.
It never installs, starts, stops, or reconfigures the external process.

See the [llama.cpp provider guide](https://docs.mangabaclaw.ai/plugins/llama-cpp)
for authentication, router behavior, manual configuration, and troubleshooting.

## Configure embeddings

Set `memory.search.provider` to `local`. The plugin preserves the historical
`local` embedding provider and index identity while serving requests through
the managed server's `/v1/embeddings` endpoint.

## Package

- Plugin id: `llama-cpp`
- Provider id: `llama-cpp`
- Package: `@mangabaclaw/llama-cpp-provider`
- Minimum MangabaClaw host: `2026.6.2`
