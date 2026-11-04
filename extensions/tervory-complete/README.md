# Tervory completion

Gate 1: `POST /v1/command/complete` accepts a bounded prefix/suffix, nearest tabs,
project rules, and either `mode: complete` or `mode: edit`. Identity comes from
Tank's existing personal-token corridor. Ask (the default) returns `status: ask`
without dispatch; only explicit confirmation or the Auto toggle permits a call.
No automatic retry. Completion stops at 1.5 seconds, editing at 8 seconds, and
client disconnect cancels the route. Client deadlines include authentication.

The existing `command.code` policy remains the only routing policy: Tank's
cheapest-passing ladder, cache, masking, ledger, and measured savings apply.
No new provider, key, model pin, paid policy or schema is introduced. A missing
policy fails closed. Receipts come from tenant-scoped ledger IDs, including
escalation attempts. Unknown savings remain pending; customer receipts hide models.

Run the HTTP contract tests in the Tank repository with its Python 3.12 dependencies:
`python -m pytest -q tests/test_window_complete.py`.

Every requested state is listed in [FIGMA-FRAMES.md](FIGMA-FRAMES.md).
All visible wording is provisional until the panel frames in
`docs/figma/window/REGISTER.md` are available. Required frames:

- Completion: multiline ghost text, Tab hint, dismissed/loading/empty states.
- Spending: Ask/Auto toggle, one-request Ask confirmation, declined state.
- Inline edit: selection instruction input, progress/cancel, in-place removed and
  added lines, Accept/Reject actions, stale-selection/error state.
- Project rules: missing/present/unreadable/oversize states for `.tervory/rules`.
- Account and receipt: sign in/out, expired account, cost/savings pending/error.

No Figma wording or panel layout is invented here. Native editor inputs and plain
placeholder labels provide behavior until approved frames land.

The extension bundles `cli/src/client.mjs` from immutable Tank revision
`412c48c4ca3918a21cfbdee3c522d7cb67e88b0c`. CI checks that public repository out
at `.tmp/tank-client` and installs its existing CLI dependencies. For a cloud
checkout of Tank, run `npm ci --prefix /path/to/tervory-tank/cli --ignore-scripts`,
then `npm ci` in this extension folder and build with
`TERVORY_CLI_ROOT=/path/to/tervory-tank/cli npm run build`.
The default client path is this repository's `.tmp/tank-client/cli`. The build bundles the existing CLI client, including its
login flow, credential refresh, pinned regional origins, bounded HTTP and receipt
formatting. Credentials use the editor's SecretStorage. No model or URL setting
is exposed. The same extension code uses native editor APIs on Linux, macOS and
Windows; stock VSCodium Linux is the exercised host in this change.

`Tervory: Ask / Auto` selects spending behavior at application scope (a repository
cannot enable Auto). Typing in Ask mode does not dispatch. `Tervory: Complete`
asks once for a request. Auto debounces typing and closes superseded requests.
Tab accepts the editor's ghost text; typing, cursor moves or Escape dismiss it.
Only trusted file workspaces send code. The open file's nearest three open tabs
from the same workspace contribute bounded context. Missing rules send an empty
string; unreadable or oversized rules stop the request rather than silently
omitting them. Rules are re-read for each completion and selected-code edit.

Select text and press Ctrl+K (Cmd+K on macOS), or run `Tervory: Change`. Describe
the change in the native input, review the native inline diff, then Accept or
Reject in the editor title or CodeLens. The preview uses read-only virtual
documents and language-scoped inline-diff defaults, leaving the source unchanged
until acceptance. Acceptance is one undoable edit. Any intervening source edit
invalidates the proposal. Empty replacements support deletion.

`VSCODE_EXECUTABLE_PATH=/path/to/codium xvfb-run -a npm test` runs the actual
extension host through `@vscode/test-electron` against a loopback fake Tank; omit
`xvfb-run` on a desktop host. CI pins and checksums stock VSCodium. No Tervory
window-shell build, live account or model call is needed. Cancelled Tank dispatches
write an unknown-spend receipt rather than claiming zero cost or savings.
