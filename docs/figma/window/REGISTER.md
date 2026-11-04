# Approved panel basics

Founder approval in the Window task supersedes the Proposed status in the source registers.

Source: [tervory-tank PR #685](https://github.com/Tervory-AI/tervory-tank/pull/685), branch `codex/figma-w5`, `docs/figma/window/REGISTER.md` and `REGISTER-AGENT.md`.

Implementation targets: sign-in 548:77, empty 553:1326, conversation 555:284, command waiting 556:1710, running 557:1062, finished 557:1260, undo 557:4683, plugins/MCP 557:6211, error 557:8131, offline 557:8327, multi-file review 557:4283 and receipt 557:4501 in [the design file](https://www.figma.com/design/ZnphBOJU6657tohGLD3IzS).

The built-in panel uses the approved wording, Inter, navy outline actions with 48px controls, white surfaces, a shared header and composer. Code-OSS supplies native editor chrome; the webview does not redraw it. Dynamic paths, outputs, receipts and device codes come from the CLI/Tank; illustrative design values are not inserted as live results.

Autocomplete, inline edits, indexing, background agents and PR comments are integrated from their owners. The source agent register governs their visible basics.
