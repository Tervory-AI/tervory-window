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

The three sibling extensions require integration before their acceptance rows can be added. Panel Figma frames are listed in ../figma/window/REGISTER.md. Builds are unsigned; reserved signing account names are in ../ops/FOUNDER-SETTINGS.md.
