import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/types.js";
import { resolveFileExtractionLimits } from "./file-extraction-limits.js";

describe("resolveFileExtractionLimits", () => {
  it("sizes inbound extraction to managed-media defaults, not the 5MB/4-page input_file defaults", () => {
    // Regression for #90096: large managed PDFs were skipped because inbound
    // extraction inherited the OpenResponses input_file defaults (5MB / 4 pages),
    // so locked-down agents saw only the attachment marker.
    const limits = resolveFileExtractionLimits({} as MangabaClawConfig);
    expect(limits.maxBytes).toBe(20 * 1024 * 1024);
    expect(limits.pdf.maxPages).toBe(20);
    expect(limits.allowedMimesConfigured).toBe(false);
  });

  it("derives the byte cap from agents.defaults.mediaMaxMb", () => {
    const cfg = { agents: { defaults: { mediaMaxMb: 12 } } } as MangabaClawConfig;
    expect(resolveFileExtractionLimits(cfg).maxBytes).toBe(12 * 1024 * 1024);
  });

  it("derives the page budget from agents.defaults.pdfMaxPages", () => {
    const cfg = { agents: { defaults: { pdfMaxPages: 50 } } } as MangabaClawConfig;
    expect(resolveFileExtractionLimits(cfg).pdf.maxPages).toBe(50);
  });

  it("clamps the byte cap to the 25MB host-side safety ceiling", () => {
    const cfg = { agents: { defaults: { mediaMaxMb: 500 } } } as MangabaClawConfig;
    expect(resolveFileExtractionLimits(cfg).maxBytes).toBe(25 * 1024 * 1024);
  });

  it("clamps the page budget to the 150-page ceiling", () => {
    const cfg = { agents: { defaults: { pdfMaxPages: 100000 } } } as MangabaClawConfig;
    expect(resolveFileExtractionLimits(cfg).pdf.maxPages).toBe(150);
  });

  it("ignores non-positive or non-finite agent limits and falls back to defaults", () => {
    const cfg = {
      agents: { defaults: { mediaMaxMb: 0, pdfMaxPages: -4 } },
    } as unknown as MangabaClawConfig;
    const limits = resolveFileExtractionLimits(cfg);
    expect(limits.maxBytes).toBe(20 * 1024 * 1024);
    expect(limits.pdf.maxPages).toBe(20);
  });

  it("lets an explicit responses.files operator config win per-field", () => {
    const cfg = {
      agents: { defaults: { mediaMaxMb: 20, pdfMaxPages: 20 } },
      gateway: {
        http: {
          endpoints: {
            responses: {
              files: {
                maxBytes: 3 * 1024 * 1024,
                pdf: { maxPages: 2 },
                allowedMimes: ["text/plain"],
              },
            },
          },
        },
      },
    } as MangabaClawConfig;
    const limits = resolveFileExtractionLimits(cfg);
    expect(limits.maxBytes).toBe(3 * 1024 * 1024);
    expect(limits.pdf.maxPages).toBe(2);
    expect(limits.allowedMimesConfigured).toBe(true);
  });
});
