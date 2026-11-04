# WINDOW-COMPLETE handoff

This new repository has a minimal root precheck which reuses Tank's existing
pinned scanners and finding policy. Its Gitleaks config uses defaults with no
exceptions or fingerprints.

Server integrations stay in tervory-tank; the extension workflow lives here.
The founder-approved local precheck change scopes Semgrep to changed files only;
its CI scanner, rules, baseline and finding gates stay unchanged.

Narrow integrations approved in chat:

- `tank/main.py`: register the new completion router before tenant endpoint binding.
- `tank/personal_tokens.py`: add only POST `/v1/command/complete` to the CLI corridor.
- `workspace/lib/tank.ts`: forward only that path through the existing personal-token proxy.
- `tests/test_pat_route_corridor.py`: mirror the same one-path addition in the security contract.
- `.github/workflows/window-complete.yml`: run extension tests when this extension changes.

The feature lives in `extensions/tervory-complete/` and the new
`tank/window_complete.py`. It reuses `cli/src/client.mjs` for login, refresh,
regional Tank calls and receipt display. Tank keeps the existing `command.code`
policy, ladder and cost evidence; no new provider, key or paid configuration.

Local evidence: seven Tank HTTP/corridor tests; one completion proxy test; the
existing six CLI public-edge tests; a stock VSCodium 1.143.17232 extension-host
run via `@vscode/test-electron` against a loopback fake Tank. Editor coverage:
multiline ghost text, native acceptance, nearest tabs, Ask's no-spend default,
keypress cancellation, selected-code edits, rules, native inline diff,
Accept/Reject, undo, stale snapshots, deletion, rule reload and missing/oversize
rules. The test runner requires a success marker as well as editor exit success.

Two branches form this job: one PR in tervory-window for the extension and one
in tervory-tank for the completion route and wiring. Claude opens the two PRs. Never merge. Use the per-gate pushed
heads and live CI results from the chat report. Linux stock VSCodium is the
exercised host; macOS/Windows native editor APIs are used but those hosts have not
been executed locally. Placeholder wording and every needed Figma frame are
listed in README.md; the Window register was absent on the initial main checkout.
