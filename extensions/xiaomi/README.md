# MangabaClaw Xiaomi Provider

Official MangabaClaw provider plugin for Xiaomi MiMo pay-as-you-go and Token Plan
models, usage tracking, and text-to-speech.

Install from MangabaClaw:

```bash
mangabaclaw plugins install @mangabaclaw/xiaomi-provider
mangabaclaw gateway restart
```

Configure `XIAOMI_API_KEY` for `xiaomi/*` models and speech, or
`XIAOMI_TOKEN_PLAN_API_KEY` for `xiaomi-token-plan/*` models. See
https://docs.mangabaclaw.ai/providers/xiaomi for regional Token Plan setup and
the full model and speech configuration.
