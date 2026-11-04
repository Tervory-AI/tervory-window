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
| WINDOW-20 | Connect Tervory | Enter `invalid` instead of a personal token | Personal token refused.; no arbitrary server is contacted | none |
| WINDOW-21 | Review pull request | Choose `github`, enter `alice/project` and PR number `8` in the offline fixture | Worker receives PR 8 and the credential name; no token or model override in the request | none |
| WINDOW-22 | PR review webhook | Choose `github`, enter `alice/project`, select Disable | Webhook is disabled; nothing is copied to the clipboard | none |
| WINDOW-23 | PR review webhook | Choose `github`, enter `alice/project`, select Enable, then Copy webhook secret | Only that explicit choice copies the returned fixture secret | none |

| WINDOW-24 | Agents → Finished → Open pull request | Open the finished `alice/other #8` fixture review | Running and Finished groups are shown; the PR opens at https://github.com/alice/other/pull/8 | none |
| WINDOW-25 | Agents → Show receipt | Show the running fixture job’s receipt | Recorded cost: $0.010000; input 3, output 5 tokens; unrelated response fields are omitted | none |


Complete and agents are integrated from their own commits. Index is pending its owner branch. The native boot job runs the owner's completion/inline-edit editor suite against the built Tervory executable. Offline acceptance shares one execution of that suite across its three individually checked rows. Prepare the editor dependency with `node build/test-editor.mjs` before running offline tests. Without VSCODE_EXECUTABLE_PATH, Linux x64 uses a checksum-pinned stock VSCodium fixture. Tests themselves do not download it. Panel basics follow the approved Figma register. Builds are unsigned; signing setting names are in ../ops/FOUNDER-SETTINGS.md.
