// Runs test-projects serially with a one-worker Vitest budget.
process.env.MANGABACLAW_TEST_PROJECTS_SERIAL = "1";
process.env.MANGABACLAW_VITEST_MAX_WORKERS = "1";

await import("./test-projects.mts");
