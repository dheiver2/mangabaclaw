// Runs test-projects with Vitest import duration diagnostics enabled.
process.env.MANGABACLAW_VITEST_IMPORT_DURATIONS = "1";
process.env.MANGABACLAW_VITEST_PRINT_IMPORT_BREAKDOWN = "1";

await import("./test-projects.mts");
