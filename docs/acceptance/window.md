# Window acceptance

Open a trusted local Git project with `file.txt` and `second.txt` containing `old` on line 1. The following exact model results use the offline fake Tank. Live responses vary.

| ID | Where | What he does | What he should see | Setting it needs |
| --- | --- | --- | --- | --- |
| WINDOW-01 | Tervory panel → Ask | Enter `Explain this project` | Project context sent via CLI; receipt cost 0.01, baseline 0.04, saved 0.03 | none |
| WINDOW-02 | Tervory: Trigger sign-in | Choose US and finish browser sign-in | US CLI credentials stored in editor SecretStorage | none |
| WINDOW-03 | Tervory: Trigger sign-in | Choose ZA and finish browser sign-in | ZA CLI credentials stored in editor SecretStorage | none |
| WINDOW-04 | Tervory panel → Code | Accept the fixture two-file edit, then enter /undo | Both files become `new`, then both return to `old` | none |
| WINDOW-05 | Tervory panel → Code → Accept | Accept only the first file's hunk | file.txt becomes `new`; second.txt remains `old` | none |
| WINDOW-06 | Tervory panel → Code → Reject | Reject every proposed hunk | Both files remain `old` | none |
| WINDOW-07 | Untrusted project → Tervory panel | Ask to edit | No Tank request or project edit | none |
| WINDOW-08 | Tervory panel → Code | Request `echo panel-command`, select Run | Waiting for Run → Running → Finished, exit code 0, panel-command in terminal output | none |
| WINDOW-09 | Tervory panel → Code | Request the same command, select Cancel | Command is not run; Tank receives ran=false | none |
| WINDOW-10 | Tervory panel → Plugins | Open Plugins | Installed plugin list and MCP tools come from the regional Tank | none |
| WINDOW-11 | Tervory panel, offline Tank fixture | Send a request | Offline; Connection lost.; No action was retried. | none |
| WINDOW-12 | Tervory panel → multi-file review | Change file.txt externally before accepting both hunks | External contents survive; second.txt remains old | none |
| WINDOW-13 | Tervory panel → multi-file review | Cancel before accepting | Both files remain old | none |

Complete and agents are integrated from their own commits. Index is pending its owner branch. The native boot job runs the completion/inline-edit owner's actual editor suite against the built Tervory executable. Panel basics follow the approved Figma register. Builds are unsigned; signing setting names are in ../ops/FOUNDER-SETTINGS.md.
