# `@mangabaclaw/ai`

Reusable model API contracts, provider adapters, and streaming primitives from
MangabaClaw. The package supports isolated runtime instances; importing it does not
register providers globally.

```ts
import { createLlmRuntime } from "@mangabaclaw/ai";
import { registerBuiltInApiProviders } from "@mangabaclaw/ai/providers";

const runtime = createLlmRuntime();
registerBuiltInApiProviders(runtime.registry);
```

Provider-neutral contracts, validation, diagnostics, and event streams are
available from the package root and focused subpaths such as
`@mangabaclaw/ai/event-stream`, `@mangabaclaw/ai/transports`, and
`@mangabaclaw/ai/validation`. No second MangabaClaw runtime package is required.

Provider ids, credentials, model catalogs, retries, and failover remain
application concerns. MangabaClaw supplies those policies around this package.
Host policy (request fetch guarding, secret redaction, strict-tool defaults,
provider plugin hooks, and diagnostics logging) can be injected with
`configureAiTransportHost`; the defaults are inert.

The explicit `@mangabaclaw/ai/internal/anthropic`, `openai`, `retry-after`,
`runtime`, and `shared` subpaths exist for the MangabaClaw application itself.
They carry no semver guarantee and can change or disappear in any release; do
not depend on them outside MangabaClaw.
