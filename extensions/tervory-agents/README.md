# Window agents

This extension runs in the existing VS Code compatible Tervory window on Windows,
macOS and Linux. It installs nothing on the user's laptop beyond the window.
Use Connect Tervory to store the personal credential in the window's secret store.
Use Save GitHub credential to send a masked field directly to the server vault;
subsequent tasks select its name. Never paste a GitHub credential into chat.

Start task queues work on the worker server, independent of this extension's
lifetime. Only a fresh `worker/window-<job-id>` branch is published, followed by a
draft PR on the selected repository. The worker never merges. Auto routing and
usage receipts come from the existing command code-turn and policy ladder.

Visible strings are plain placeholders awaiting `docs/figma/window/REGISTER.md`.
Frames needed: task launch (repository, credential name, prompt), named GitHub
vault credential form, task progress with one Cancel action, failure/interrupted
state, PR result with receipt link, and running/finished task list. Additional frames: PR review launch (repository, PR number, credential name),
webhook opt-in and setup (callback URL, masked secret with explicit copy actions),
review result with PR and receipt links, PR-head-changed state, and incomplete/oversized
diff state. All visible copy remains placeholder wording.

Validation: from this extension directory, run `bash scripts/precheck.sh /path/to/tervory-tank`.
The window main currently contains its ownership README; this extension check reuses
Tank's pinned gitleaks and Semgrep gates without rule or file exclusions. The check
enforces that this component has no external dependencies; OSV has no inputs yet.

Review pull request uses Tank Auto and posts comments only on the exact PR head
reviewed. No review executes repository code. The user can enable or disable a
signed GitHub pull-request webhook in the window. Configure the supplied callback
URL, application/json, generated secret, and pull-request events on GitHub; the
server deduplicates deliveries for the same PR head. Enabling a webhook never
asks the user to paste their GitHub token into a chat.

The view groups tasks and reviews into Running and Finished. A PR link opens only
GitHub; Show receipt reads the existing command receipt and displays recorded
cost, baseline, savings and token counts. Running jobs remain visible even when
more than 100 newer jobs have finished. History shows up to 100 recent finished
jobs and 100 active/queued jobs, plus any additional running jobs. Final group,
empty, error, PR-link and receipt-detail frames are still needed from Figma.
