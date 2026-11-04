# Window acceptance

Open a trusted local Git project with `file.txt` and `second.txt` containing `old` on line 1. The following exact model results use the offline fake Tank. Live responses vary.

| ID | Where | What he does | What he should see | Setting it needs |
| --- | --- | --- | --- | --- |
| WINDOW-01 | Tervory panel → Send | Enter `Explain this project` | Project context sent via CLI; receipt cost 0.01, baseline 0.04, saved 0.03 | none |
| WINDOW-02 | Tervory: Trigger sign-in | Choose US and finish browser sign-in | US CLI credentials stored in editor SecretStorage | none |
| WINDOW-03 | Tervory: Trigger sign-in | Choose ZA and finish browser sign-in | ZA CLI credentials stored in editor SecretStorage | none |
| WINDOW-04 | Tervory panel → Code | Enter `change both files`, accept both files, then enter `/undo` | Both files become `new`, then both return to `old` | none |
| WINDOW-05 | Tervory panel → Code → Accept | Enter `change both files`, accept only the first file’s hunk | file.txt becomes `new`; second.txt remains `old` | none |
| WINDOW-06 | Tervory panel → Code → Reject | Enter `change both files`, reject every proposed hunk | Both files remain `old` | none |
| WINDOW-07 | Untrusted project → Tervory panel | Ask to edit | No Tank request or project edit | none |
| WINDOW-08 | Tervory panel → Code | Request `echo panel-command`, select Run | Waiting for Run → Running → Finished, exit code 0, panel-command in terminal output | none |
| WINDOW-09 | Tervory panel → Code | Request the same command, select Cancel | Command is not run; Tank receives ran=false | none |
| WINDOW-10 | Tervory panel → Plugins | Open Plugins and Confirm the listing card | Installed plugin list and MCP tools come from the regional Tank | none |
| WINDOW-11 | Tervory panel, offline Tank fixture | Enter `explain` and select Send | Offline; Connection lost.; No action was retried. | none |
| WINDOW-12 | Tervory panel → multi-file review | Enter `change both files`, replace file.txt with `outside change`, then accept both hunks | External contents survive; second.txt remains old | none |
| WINDOW-13 | Tervory panel → multi-file review | Enter `change both files`, select New chat before accepting | Both files remain old | none |
| WINDOW-14 | Editor → Tab autocomplete, then Tab | Open the fixture main.js; request completion and press Tab | Multi-line `return 42;` ghost text is accepted; typing cancels a pending request | none |
| WINDOW-15 | Select code → Edit with Tervory | Select `return 1;`, enter `Return forty two`, inspect diff, choose Accept, then editor Undo | Original file is unchanged before acceptance; then contains `return 42;`; Undo restores it | none |
| WINDOW-16 | Project .tervory/rules | Change the fixture rule and request another completion | Each request uses the current file; missing rules work; oversize rules fail closed | none |
| WINDOW-17 | Agents → Start task | Choose a saved GitHub credential name, enter owner/repository and a task, close the window | Worker receives only the credential name; the submitted task is not cancelled by window disposal | none |
| WINDOW-18 | Save GitHub credential | Enter a credential name and token in the masked form | Token goes to the authenticated worker vault; it is not included in task bodies | none |
| WINDOW-19 | Agents → Cancel | Select Cancel on a queued or running task | One cancellation request for that job; finished jobs have no cancel action | none |
| WINDOW-20 | Agents with an expired or invalid Trigger session | Open the Agents view with the offline invalid-session fixture | Trigger sign-in; no server is contacted | none |
| WINDOW-21 | Review pull request | Choose `github`, enter `alice/project` and PR number `8` in the offline fixture | Worker receives PR 8 and the credential name; no token or model override in the request | none |
| WINDOW-22 | PR review webhook | Choose `github`, enter `alice/project`, select Disable | Webhook is disabled; nothing is copied to the clipboard | none |
| WINDOW-23 | PR review webhook | Choose `github`, enter `alice/project`, select Enable, then Copy webhook secret | Only that explicit choice copies the returned fixture secret | none |
| WINDOW-24 | Agents → Finished → Open pull request | Open the finished `alice/other #8` fixture review | Running and Finished groups are shown; the PR opens at https://github.com/alice/other/pull/8 | none |
| WINDOW-25 | Agents → Show receipt | Show the running fixture job’s receipt | Recorded cost: $0.010000; input 3, output 5 tokens; unrelated response fields are omitted | none |
| WINDOW-26 | Agents → Trigger sign-in | Select Trigger sign-in | Opens the panel’s existing Trigger sign-in flow; no separate personal-token prompt | none |
| WINDOW-27 | Command Palette → Tervory: Sign out | Run Sign out, then open the Tervory panel | Trigger sign-in; the shared CLI session is cleared | none |
| WINDOW-28 | Project index, local model fixture | Embed `reset forgotten password`, `recover account credentials`, and `paint a mountain landscape` offline | 384-dimensional vectors; account phrases are closer than the landscape phrase; no model network access | none |
| WINDOW-29 | Command Palette → Search this project | Search `help someone regain access to their account` in the fixture | `account.ts` ranks first; exact `resetPassword(email:` matches line 2 and uppercase `RESETPASSWORD` does not match | none |
| WINDOW-30 | Project index file watchers | Create, edit and delete `created.ts`; add/remove `account.ts` in `.tervoryignore` | File count changes 2 → 3 → 2; ignored file is removed, then restored | none |
| WINDOW-31 | Project index privacy fixture | Use nested ignore rules and a symlink to an outside folder | Only `sub/allowed.ts` is indexed; outside and ignored sources stay excluded | none |
| WINDOW-32 | Project context API | Request `forgot password` with a 200-character budget | Local file URIs; total snippet text is at most 200 characters | none |
| WINDOW-33 | Tervory panel, indexed context fixture | Send `Explain this project` | Tank receives `old` from the current file as Project context DATA; cached text and `.git/config` are omitted | none |
| WINDOW-34 | Command Palette → Tervory: Codebase search | Search `old`, then select Open first result | Codebase search; Search this project; `file.txt:1`; opens `file.txt` without a Tank request | none |
| WINDOW-35 | Command Palette → Rebuild project index | Run the command on the two-file fixture | Both eligible files are indexed; file count is 2 | none |

Complete, index and agents are integrated from their own commits. The native boot job runs completion/inline-edit and index editor suites against the built Tervory executable. Offline acceptance shares one execution of that suite across its three individually checked rows. Prepare the editor dependency with `node build/test-editor.mjs` before running offline tests. Without VSCODE_EXECUTABLE_PATH, Linux x64 uses a checksum-pinned stock VSCodium fixture. Tests themselves do not download it. Panel basics follow the approved Figma register. Builds are unsigned; signing setting names are in ../ops/FOUNDER-SETTINGS.md.
