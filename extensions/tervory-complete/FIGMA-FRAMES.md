# Completion and inline-edit frame requests

Behavior ships with native editor controls and plain placeholders. These are
requests, not approved wording or layouts. Request each frame at 1440×900 and
1280×800, including keyboard focus and the disabled action where relevant.

The Window register read from the Figma lane explicitly excludes autocomplete,
inline edit and receipts/savings. Its panel, sign-in and error frames remain
Proposed. Reuse the eventual approved shell and Trigger sign-in frames; none of
those proposals approves the strings in this extension.

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

All visible instructions, toggle labels, action labels and receipt placement
need the owning Figma lane's approved frames before final copy or panel styling.
