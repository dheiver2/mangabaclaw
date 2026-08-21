---
summary: "Runtime boundaries, hooks, tools, permissions, and diagnostics for the Codex harness"
title: "Codex harness runtime"
read_when:
  - You need the Codex harness runtime support contract
  - You are debugging native Codex tools, hooks, compaction, or feedback upload
  - You are changing plugin behavior across MangabaClaw and Codex harness turns
---

Runtime contract for Codex harness turns. For setup and routing, see
[Codex harness](/plugins/codex-harness). For config fields, see
[Codex harness reference](/plugins/codex-harness-reference).

## Overview

Codex owns the native model loop, native thread resume, native tool
continuation, and native compaction. MangabaClaw owns channel routing, session
files, visible message delivery, MangabaClaw dynamic tools, approvals, media
delivery, and a transcript mirror around that boundary.

For native connected apps, Codex also owns the final per-thread app and tool
policy. MangabaClaw caches a runtime-and-workspace-scoped `plugin/installed`
snapshot, reads exact configured plugin details, provisionally admits only
explicitly allowed, ownership-proven apps, and creates a deny-by-default
native thread. One `app/installed` request verifies the actual thread ID
without forcing an inventory refresh. Native app execution begins only after
Codex confirms the app is enabled and callable for that thread.

This check finishes before MangabaClaw injects history, starts a turn, or commits a
thread binding. Failed persistent provisional threads are deleted; ephemeral
threads are unsubscribed. MangabaClaw retires the app-server connection when safe
cleanup cannot be confirmed. Supervised branches also clean up their temporary
probe and preserve recovery state if cleanup fails.

Account-wide app access cannot override an explicitly disabled configured
workspace plugin. MangabaClaw uses its installed snapshot and reads only that
exact plugin's details to identify and deny its apps; it never scans unrelated
marketplaces or activates the plugin.

Prompt routing follows the selected runtime, not just the provider string. A
native Codex turn gets Codex app-server developer instructions; an explicit
MangabaClaw compatibility route keeps the normal MangabaClaw system prompt even when
it uses Codex-flavored OpenAI auth or transport.

MangabaClaw starts and resumes native Codex threads with Codex's built-in
personality disabled (`personality: "none"`) so workspace personality files
and MangabaClaw agent identity stay authoritative. Native Codex keeps Codex-owned
base/model instructions and project-doc loading otherwise. Lightweight
MangabaClaw runs (for example cron) still suppress project-doc loading.

MangabaClaw developer instructions cover MangabaClaw runtime concerns: source-channel
delivery, MangabaClaw dynamic tools, ACP delegation, adapter context, and the
active agent workspace profile files. Skill catalogs and tool-routed
`MEMORY.md` pointers are projected as turn-scoped collaboration developer
instructions. When memory tools are unavailable, active `BOOTSTRAP.md` content
and full `MEMORY.md` fall back to plain turn input context instead.

When `mangabaclaw_direct.sessions_yield` is available, those instructions also
tell a native Codex parent to end the current turn when a child's result should
arrive in a later turn. Native `wait_agent` remains for an intentional same-turn
wait when the immediate next step is blocked on the child; completion polling
loops are not a substitute.

Most MangabaClaw dynamic tools use the searchable `mangabaclaw` namespace. Tools
marked `catalogMode: "direct-only"` use `mangabaclaw_direct`, which Codex keeps
directly model-visible as `DirectModelOnly` instead of exposing it to nested
Code Mode execution.

## Thread bindings and model changes

When an MangabaClaw session is attached to an existing Codex thread, the next
turn resends the currently selected model, approval policy, sandbox,
approvals reviewer, and service tier to app-server. Switching from
`openai/gpt-5.5` to `openai/gpt-5.2` keeps the thread binding but asks Codex to
continue with the newly selected model.

Supervised bindings are the exception. The MangabaClaw model picker stays locked,
and resumes omit model and provider overrides so Codex restores the canonical
thread's persisted model and provider. A separate native Codex control can
change that persisted pair, and the initial snapshot can produce Codex's normal
model-difference warning; the outer MangabaClaw model and fallback chain never
substitute for either.

## Supervision and safe continuation

Codex supervision is an opt-in capability of the same `codex` plugin. It discovers
native threads through a separate connection and projects only non-archived
sessions into the Gateway catalog. Without explicit `appServer` connection
settings, that connection uses managed user-home stdio while the ordinary
harness remains agent-scoped. Listing and metadata reads are passive: they do
not resume a thread, subscribe MangabaClaw to its live events, or answer its
approvals.

For a stored or idle session on the Gateway computer, **Continue as branch**
creates a normal, model-locked Chat and mirrors bounded user and assistant
history through the source's last terminal persisted turn. The first normal
Chat turn installs the real approval handlers and uses a temporary native fork
to pin the snapshot without a model or provider override. Codex App Server uses
its current native configuration and returns the selected pair; it emits its
normal warning if that model differs from the source's last recorded model.
On the same supervision connection, MangabaClaw starts the canonical
`appServer`-source Codex harness thread under its cwd and runtime policy with
exactly the returned model and provider for that initial start, injects the
bounded visible history, and archives the temporary fork. The source is never
resumed. The canonical thread has the full MangabaClaw harness tool surface;
reasoning, tool calls, and tool results from the source are not cloned into it.
The private connection scope survives pending and committed binding states, so
every later turn remains on that connection with native auth and provider
configuration. Disabled supervision or binding/connection drift fails closed
rather than switching to the ordinary agent-home harness.

The original CLI, VS Code, Atlas, or ChatGPT source remains eligible for both
catalogs. The canonical branch is a native Codex thread, but its source kind is
`appServer`; native clients may filter that source kind, so its appearance in
Codex Desktop is not guaranteed.

Active sources cannot start a new branch or be archived; an existing supervised
Chat can still be opened. `notLoaded` means activity is unknown, not idle;
MangabaClaw allows archive for a local `idle` or `notLoaded` row only after explicit
no-other-runner confirmation and a fresh process-local status read. Codex
serializes thread mutations within one App Server process but does not provide
an exclusive cross-process runner or approval-owner lease, so that read cannot
prove that another process is not using the thread. MangabaClaw blocks a known
active binding owner for the exact target or any non-archived spawned descendant
returned by Codex's paginated descendant query. Enumeration errors, cycles, and
safety-limit exhaustion fail closed. Native archive can still race a new turn
in another process, so confirmation covers unknown clients and the gap between
status read and archive. A supervised model-locked Chat cannot be deleted while
it protects the native binding.

Paired-node catalogs stay metadata-only in the initial release. The current
node invoke boundary is request/response and cannot carry the long-lived turn
events, approval requests, or streaming output required by a real Codex harness
binding. Remote **Continue** and **Archive** therefore remain unavailable even
when the row is idle.

See [Codex supervision](/plugins/codex-supervision) for operator setup and the
visible Control UI behavior.

## Visible replies and heartbeats

Direct/source chat turns through the Codex harness default to automatic final
assistant delivery for internal WebChat surfaces, matching the Pi harness
contract: the agent replies normally and MangabaClaw posts the final text to the
source conversation. Set `messages.visibleReplies: "message_tool"` to keep
final assistant text private unless the agent calls `message(action="send")`.

Codex heartbeat turns get `heartbeat_respond` in the searchable MangabaClaw tool
catalog by default so the agent can record whether the wake should stay quiet
or notify. Heartbeat initiative guidance is sent as a Codex collaboration-mode
developer instruction scoped to the heartbeat turn; ordinary chat turns stay
in Codex Default mode. The heartbeat monitor's cron scratch is appended to the
heartbeat prompt when present.

## Hook boundaries

| Layer                                 | Owner                    | Purpose                                                             |
| ------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| MangabaClaw plugin hooks                 | MangabaClaw                 | Product/plugin compatibility across MangabaClaw and Codex harnesses.   |
| Codex app-server extension middleware | MangabaClaw bundled plugins | Per-turn adapter behavior around MangabaClaw dynamic tools.            |
| Codex native hooks                    | Codex                    | Low-level Codex lifecycle and native tool policy from Codex config. |

MangabaClaw does not use project or global Codex `hooks.json` files to route
plugin behavior. For the native tool and permission bridge, MangabaClaw injects
per-thread Codex config for `PreToolUse`, `PostToolUse`, `PermissionRequest`,
and `Stop`.

When Codex app-server approvals are enabled (`approvalPolicy` is not
`"never"`), the default injected native hook config omits `PermissionRequest`
so Codex's app-server reviewer and MangabaClaw's approval bridge handle real
escalations after review. Add `permission_request` to
`nativeHookRelay.events` to force the compatibility relay anyway. Other Codex
hooks such as `SessionStart` and `UserPromptSubmit` remain Codex-level
controls; they are not exposed as MangabaClaw plugin hooks in the v1 contract.

For MangabaClaw dynamic tools, MangabaClaw executes the tool after Codex asks for
the call, so plugin and middleware behavior runs in the harness adapter. Codex
Code Mode receives generic dynamic results as text and serializes nested
dynamic calls; callers must parse JSON-looking results and cannot rely on
`Promise.all` for concurrent submission. For Codex-native tools, Codex owns the
canonical tool record; MangabaClaw can mirror selected events but cannot rewrite
the native thread unless Codex exposes that through app-server or native hook
callbacks.

Codex app-server report-mode `PreToolUse` events defer plugin approval to the
matching app-server approval. If an MangabaClaw `before_tool_call` hook returns
`requireApproval` while the native payload sets `mangabaclaw_approval_mode:
"report"`, the native hook relay records the plugin approval requirement and
returns no native decision. When Codex later sends the app-server approval
request for the same tool use, MangabaClaw opens the plugin approval prompt and
maps the decision back to Codex. Codex `PermissionRequest` events are a
separate approval path and can still route through MangabaClaw approvals when
configured for that bridge.

Codex app-server item notifications also provide async `after_tool_call`
observations for native tool completions not already covered by the native
`PostToolUse` relay. These are telemetry/compatibility only; they cannot
block, delay, or mutate the native tool call.

Compaction and LLM lifecycle projections come from Codex app-server
notifications and MangabaClaw adapter state, not native Codex hook commands.
`before_compaction`, `after_compaction`, `llm_input`, and `llm_output` are
adapter-level observations, not byte-for-byte captures of Codex's internal
request or compaction payloads.

Codex native `hook/started` and `hook/completed` app-server notifications are
projected as `codex_app_server.hook` agent events for trajectory and
debugging. They do not invoke MangabaClaw plugin hooks.

## Experimental sandbox process streaming

Native sandbox execution remains opt-in through
`appServer.experimental.sandboxExecServer`. When enabled for an active
MangabaClaw sandbox, sandboxed processes stream ordered stdout, stderr, or PTY
output notifications. MangabaClaw retains only a bounded recent-output buffer for
polling and replay, so long-running processes cannot grow the app-server bridge
without limit. Process exit and cleanup remain tied to the sandbox-owned
process. Failed environment registration never falls back to host execution.

See [Sandboxed native execution](/plugins/codex-harness-reference#sandboxed-native-execution)
for configuration and local-only transport restrictions.

## V1 support contract

Supported in Codex runtime v1:

| Surface                                       | Support                                                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI model loop through Codex               | Supported                                                                        | Codex app-server owns the OpenAI turn, native thread resume, and native tool continuation.                                                                                                                                                                                                                                                                                                                                                                                          |
| MangabaClaw channel routing and delivery         | Supported                                                                        | Telegram, Discord, Slack, WhatsApp, iMessage, and other channels stay outside the model runtime.                                                                                                                                                                                                                                                                                                                                                                                    |
| MangabaClaw dynamic tools                        | Supported                                                                        | Codex asks MangabaClaw to execute these tools, so MangabaClaw stays in the execution path.                                                                                                                                                                                                                                                                                                                                                                                                |
| Prompt and context plugins                    | Supported                                                                        | MangabaClaw projects MangabaClaw-specific prompt/context into the Codex turn while leaving Codex-owned base, model, and configured project-doc prompts in the native Codex lane. MangabaClaw disables Codex's built-in personality for native threads so agent workspace personality files remain authoritative. Native Codex developer instructions accept only command guidance explicitly scoped to `codex_app_server`; legacy global command hints remain for non-Codex prompt surfaces. |
| Context engine lifecycle                      | Supported                                                                        | Assemble, ingest, and after-turn maintenance run around Codex turns. Context engines do not replace native Codex compaction.                                                                                                                                                                                                                                                                                                                                                        |
| Dynamic tool hooks                            | Supported                                                                        | `before_tool_call`, `after_tool_call`, and tool-result middleware run around MangabaClaw-owned dynamic tools.                                                                                                                                                                                                                                                                                                                                                                          |
| Lifecycle hooks                               | Supported as adapter observations                                                | `llm_input`, `llm_output`, `agent_end`, `before_compaction`, and `after_compaction` fire with honest Codex-mode payloads.                                                                                                                                                                                                                                                                                                                                                           |
| Final-answer revision gate                    | Supported through native hook relay                                              | Codex `Stop` is relayed to `before_agent_finalize`; `revise` asks Codex for one more model pass before finalization.                                                                                                                                                                                                                                                                                                                                                                |
| Native shell, patch, and MCP block or observe | Supported through native hook relay                                              | Codex `PreToolUse` and `PostToolUse` are relayed for committed native tool surfaces, including MCP payloads on the pinned Codex app-server. Blocking is supported; argument rewriting is not.                                                                                                                                                                                                                                                                                       |
| Native permission policy                      | Supported through Codex app-server approvals and compatibility native hook relay | Codex app-server approval requests route through MangabaClaw after Codex review. The `PermissionRequest` native hook relay is opt-in for native approval modes because Codex emits it before guardian review.                                                                                                                                                                                                                                                                          |
| App-server trajectory capture                 | Supported                                                                        | MangabaClaw records the request it sent to app-server and the app-server notifications it receives.                                                                                                                                                                                                                                                                                                                                                                                    |

Not supported in Codex runtime v1:

| Surface                                             | V1 boundary                                                                                                                                     | Future path                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Native tool argument mutation                       | Codex native pre-tool hooks can block, but MangabaClaw does not rewrite Codex-native tool arguments.                                               | Requires Codex hook/schema support for replacement tool input.                            |
| Editable Codex-native transcript history            | Codex owns canonical native thread history. MangabaClaw owns a mirror and can project future context, but should not mutate unsupported internals. | Add explicit Codex app-server APIs if native thread surgery is needed.                    |
| `tool_result_persist` for Codex-native tool records | That hook transforms MangabaClaw-owned transcript writes, not Codex-native tool records.                                                           | Could mirror transformed records, but canonical rewrite needs Codex support.              |
| Rich native compaction metadata                     | MangabaClaw can request native compaction, but does not receive a stable kept/dropped list, token delta, completion summary, or summary payload.   | Needs richer Codex compaction events.                                                     |
| Compaction intervention                             | MangabaClaw does not let plugins or context engines veto, rewrite, or replace native Codex compaction.                                             | Add Codex pre/post compaction hooks if plugins need to veto or rewrite native compaction. |
| Byte-for-byte model API request capture             | MangabaClaw can capture app-server requests and notifications, but Codex core builds the final OpenAI API request internally.                      | Needs a Codex model-request tracing event or debug API.                                   |

## Native permissions and MCP elicitations

For `PermissionRequest`, MangabaClaw only returns explicit allow or deny
decisions when policy decides. A no-decision result is not an allow: Codex
treats it as no hook decision and falls through to its own guardian or user
approval path.

Codex app-server approval modes omit this native hook by default. This
applies unless `permission_request` is explicitly included in
`nativeHookRelay.events` or a compatibility runtime installs it.

When an operator chooses `allow-always` for a Codex native permission
request, MangabaClaw remembers that exact provider/session/tool input/cwd
fingerprint for a bounded session window. The remembered decision is
intentionally exact-match only: a changed command, arguments, tool payload, or
cwd creates a fresh approval.

Codex MCP tool approval elicitations route through MangabaClaw's plugin approval
flow when Codex marks `_meta.codex_approval_kind` as `"mcp_tool_call"`.
Plugin, account, Computer Use, and MCP approval classification runs before
ordinary input handling. A denied policy or unmappable approval schema returns
an explicit decline and never becomes a general-purpose form.

MangabaClaw supports app-server MCP elicitation modes `form`, `openai/form`, and
`url`. Standard and extended forms can contain at most 12 fields. MangabaClaw
normalizes field names to Gateway-safe question IDs, retains the original names
in accepted content, and presents fields in sequential batches of up to three.
Each field may offer at most four choices; fields and choices over those limits
are declined rather than truncated. Supported fields are free-form strings,
string `enum` or `oneOf` choices, booleans, numbers and integers, and
multi-select string arrays. Free-form string values are limited to 4,096
characters. String length, `email`, `uri`, `date`, and
`date-time` constraints and numeric or array bounds are validated before an
accepted response is returned. Optional fields, required fields, and valid
defaults retain their schema meaning.

`openai/form` also supports a single-select `openai/imagePicker` field with up
to four bounded item IDs and titles. MangabaClaw uses only those IDs and titles; it
does not fetch or render item images. An unknown extended field type produces a
visible operator message and an explicit decline. This visible fallback is part
of the `openai/form` capability contract.

URL elicitations are shown as literal text with explicit Continue and Decline
choices. MangabaClaw does not fetch or open the URL. URLs are limited to 2,048
characters, must use HTTP or HTTPS, cannot include credentials, and cannot
contain control or invisible characters. Invalid URLs produce a visible
explanation and an explicit decline.

Codex `request_user_input` and ordinary MCP elicitations share one per-turn
interactive queue. The Control UI renders each non-secret Gateway question, and
a single choice uses typed channel buttons when the channel supports them.
Button taps, Control UI answers, and the next queued plain-text reply resolve
the same exact app-server request. `serverRequest/resolved` selects a request by
its outer string-or-integer JSON-RPC ID; attempt abort, timeout, and cleanup
cancel the current owner. Late answers cannot resolve a queued replacement.

Only an explicit field `isSecret: true` or Codex question
`isSecret: true` enables secret handling. Secret form fields are requested one
at a time through the warned ephemeral text-reply path and never create durable
Gateway question records. MangabaClaw does not infer secrecy from field names.

For the general plugin approval flow that carries these prompts, see
[Plugin permission requests](/plugins/plugin-permission-requests).

## Queue steering

Active-run queue steering maps onto Codex app-server `turn/steer`. With the
default `messages.queue.mode: "steer"`, MangabaClaw batches steer-mode chat
messages for the configured quiet window and sends them as one `turn/steer`
request in arrival order.

Codex review and manual compaction turns can reject same-turn steering. In
that case, MangabaClaw waits for the active run to finish before starting the
prompt. Use `/queue followup` or `/queue collect` when messages should queue
by default instead of steering. See [Steering queue](/concepts/queue-steering).

## Codex feedback upload

When `/diagnostics [note]` is approved for a session on the native Codex
harness, MangabaClaw also calls Codex app-server `feedback/upload` for relevant
Codex threads, including logs for each listed thread and spawned Codex
subthreads when available.

The upload goes through Codex's normal feedback path to OpenAI servers. If
Codex feedback is disabled in that app-server, the command returns the
app-server error. The completed diagnostics reply lists the channels,
MangabaClaw session ids, Codex thread ids, and local `codex resume <thread-id>`
commands for the threads that were sent.

If you deny or ignore the approval, MangabaClaw does not print those Codex ids
and does not send Codex feedback. The upload does not replace the local
Gateway diagnostics export. See [Diagnostics export](/gateway/diagnostics) for
the approval, privacy, local bundle, and group-chat behavior.

Use `/codex diagnostics [note]` only when you want the Codex feedback upload
for the currently attached thread without the full Gateway diagnostics
bundle.

## Compaction and transcript mirror

When the selected model uses the Codex harness, native thread compaction
belongs to Codex app-server. MangabaClaw does not run preflight compaction for
Codex turns, replace Codex compaction with context-engine compaction, or fall
back to MangabaClaw or public OpenAI summarization when native compaction cannot
be started. MangabaClaw keeps a transcript mirror for channel history, search,
`/new`, `/reset`, and future model or harness switching.

Explicit compaction requests, such as `/compact` or a plugin-requested manual
compact operation, start native Codex compaction with `thread/compact/start`.
MangabaClaw keeps the request and shared-client lease open until Codex emits the
matching `contextCompaction` completion item and then reports the compaction
turn as completed. If that terminal turn exceeds the configured compaction
timeout, MangabaClaw requests a native turn interrupt. The lease and per-thread
compaction fence remain held until Codex reports terminal state or confirms
the interrupt RPC. If Codex does not confirm within the interrupt grace
period, MangabaClaw retires the connection before releasing the fence. Remote
connections also detach the matching thread binding so later work cannot
overlap an unconfirmed remote turn. Other turns on a retired connection fail
and can retry on a fresh client. Client closure, request cancellation, or a
failed compaction turn returns a failed operation. Automatic context-pressure
compaction is Codex's job; MangabaClaw only starts native compaction for manually
requested triggers.

When a context engine requests Codex thread-bootstrap projection, MangabaClaw
projects tool-call names and ids, input shapes, and redacted tool-result
content into the fresh Codex thread. It does not copy raw tool-call argument
values into that projection.

The mirror includes the user prompt, final assistant text, and lightweight
Codex reasoning or plan records when the app-server emits them. MangabaClaw
records the native compaction start and terminal status, but it does not
expose a human-readable compaction summary or an auditable list of which
entries Codex kept after compaction.

Because Codex owns the canonical native thread, `tool_result_persist` does
not rewrite Codex-native tool result records. It only applies when MangabaClaw
writes an MangabaClaw-owned session transcript tool result.

## Media and delivery

MangabaClaw continues to own media delivery and media provider selection. Image,
video, music, PDF, TTS, and media understanding use matching provider/model
settings such as `agents.defaults.mediaModels.image`,
`agents.defaults.mediaModels.video`, `pdfModel`, and `tts`.

Text, images, video, music, TTS, approvals, and messaging-tool output continue
through the normal MangabaClaw delivery path; media generation does not require
the legacy runtime. When Codex emits a native image-generation item with a
`savedPath`, MangabaClaw forwards that exact file through the normal reply-media
path even if the Codex turn has no assistant text.

## Related

- [Codex harness](/plugins/codex-harness)
- [Codex harness reference](/plugins/codex-harness-reference)
- [Codex supervision](/plugins/codex-supervision)
- [Native Codex plugins](/plugins/codex-native-plugins)
- [Plugin hooks](/plugins/hooks)
- [Agent harness plugins](/plugins/sdk-agent-harness)
- [Diagnostics export](/gateway/diagnostics)
- [Trajectory export](/tools/trajectory)
