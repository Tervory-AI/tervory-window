# Completion and inline-edit wording

The founder approved the basic frames on 4 November 2026. Copy is transcribed
from [Tank PR #685](https://github.com/Tervory-AI/tervory-tank/pull/685),
`docs/figma/window/agent-evidence/editor-agent-audit.json` at
`59e6a71addc51a26c70f74b981102c37236fc344`.

| State | Approved nodes (1440 / 1280) | Native editor wording |
| --- | --- | --- |
| Autocomplete | 557:1461 / 557:1555 | Tab autocomplete; A suggestion appears at the cursor in the editor.; Tab to accept    Esc to dismiss |
| Selection | 557:1649 / 557:1746 | Edit with Opli Code; Describe edit |
| Instruction | 557:1843 / 557:1940 | Inline edit; Describe the change for the selected code.; Propose edit |
| Diff | 557:2037 / 557:2141 | Inline edit; Review the diff in place before applying it.; Accept; Reject |

The extension uses native controls. Shell/chat composer copy and example file
names, code and instructions are fixture content, not extension instructions.
Accept/Reject already matched the approved frames. Additional states below
remain frame requests; the basic approval does not approve their placeholder copy.

| Request | Required frame |
| --- | --- |
| WC01 | Multiline ghost text with Tab hint and surrounding file context |
| WC02 | Completion waiting, no result and dismissed states |
| WC03 | Ask / Auto selector and current spending mode |
| WC04 | One-request Ask confirmation and declined state |
| WC05 | Selected-code instruction input and empty input |
| WC06 | Inline-edit progress and Cancel action |
| WC07 | Native inline removed/added code with Accept and Reject |
| WC08 | Accepted change with undo available |
| WC09 | Rejected change with original text retained |
| WC10 | Stale selection/source changed; old proposal cannot be accepted |
| WC11 | Empty replacement presented as deletion |
| WC12 | Request timeout, connection failure and cancellation |
| WC13 | Project rules present and included |
| WC14 | Project rules absent |
| WC15 | Project rules unreadable or over limit; request stopped |
| WC16 | Recorded cost and savings receipt |
| WC17 | Unknown cost or comparison pending; no invented savings |
| WC18 | Signed-out or expired session; reuse Trigger sign-in and US / ZA frames |
