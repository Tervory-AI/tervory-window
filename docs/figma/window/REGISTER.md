# Window frames required

Status: required; no approved desktop frames were supplied with WINDOW.
The existing web COMMAND wireframe does not approve desktop panel wording or
native editor review states. This register makes no design-approval claim.

| Frame | Required state and behavior |
| --- | --- |
| WINDOW-01 | Right-docked Tervory chat/agent panel, exact supplied logo, empty state, project selection and trusted/untrusted folder. |
| WINDOW-02 | Trigger sign-in: US/ZA choice, browser/device approval pending, success, cancellation, expired/revoked sign-in and sign-out. All authentication uses the current CLI implementation. |
| WINDOW-03 | Ask/read-project request, streaming answer, bounded error/cancel state, receipts and savings using the CLI's exact output. |
| WINDOW-04 | Multi-file change review with editor diffs, accept/reject whole file and individual hunk, reject all, stale file refusal, and no changes before acceptance. |
| WINDOW-05 | Undo confirmation, successful restore, user-edited-file refusal and empty undo history. |
| WINDOW-06 | Approved command: full command, host-permissions notice where applicable, explicit approval, window terminal output, timeout/cancel/truncation and refusal. |
| WINDOW-07 | Plugins and MCP catalogue, card tool/arguments, Confirm/cancel, running state and receipt. |
| WINDOW-08 | Unsigned install/checksum verification and native OS trust dialogs; no signing or notarization claim. |

The separate tervory-complete, tervory-index and tervory-agents owners supply
frames for their own functions. Their merged integration gets acceptance rows
in docs/acceptance/window.md. No final panel copy or layout is approved here.
