# @mangabaclaw/pixverse-provider

Official PixVerse video generation provider plugin for MangabaClaw.

This plugin registers PixVerse as a `video_generate` provider for text-to-video and image-to-video workflows.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/pixverse-provider
```

Restart the Gateway after installing or updating the plugin.

## Configure

Store your PixVerse API key in MangabaClaw config or expose the supported environment variable to the Gateway. Then select PixVerse as a video generation provider.

Full setup and model/provider examples:

- https://docs.mangabaclaw.ai/providers/pixverse

## Package

- Plugin id: `pixverse`
- Package: `@mangabaclaw/pixverse-provider`
- Minimum MangabaClaw host: `2026.5.26`
