# @mangabaclaw/diagnostics-prometheus

Official Prometheus diagnostics exporter for MangabaClaw.

This plugin exposes MangabaClaw Gateway runtime metrics in Prometheus text format for Prometheus, Grafana, VictoriaMetrics, and compatible scrapers.

## Install

```bash
mangabaclaw plugins install @mangabaclaw/diagnostics-prometheus
```

Restart the Gateway after installing or updating the plugin.

## Configure

Enable the plugin and set the scrape endpoint options in `plugins.entries.diagnostics-prometheus.config`.

The full config surface, metric names, and scrape examples live in the docs:

- https://docs.mangabaclaw.ai/gateway/prometheus

## Package

- Plugin id: `diagnostics-prometheus`
- Package: `@mangabaclaw/diagnostics-prometheus`
- Minimum MangabaClaw host: `2026.4.25`
