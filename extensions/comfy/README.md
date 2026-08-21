# @mangabaclaw/comfy-provider

Official ComfyUI image, video, and music generation provider plugin for
MangabaClaw.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/comfy-provider
mangabaclaw gateway restart
```

## Configure

Local ComfyUI workflows do not require credentials. Comfy Cloud workflows use
`COMFY_API_KEY` or `COMFY_CLOUD_API_KEY`.

Full workflow, model, and provider configuration:

- https://docs.mangabaclaw.ai/providers/comfy

## Package

- Plugin id: `comfy`
- Package: `@mangabaclaw/comfy-provider`
- Minimum MangabaClaw host: `2026.7.2`
