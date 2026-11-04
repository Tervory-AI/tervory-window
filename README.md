# Tervory desktop window

Tervory reuses Code-OSS on Windows, macOS and Linux. The implementation is reviewed
on `codex/window`; native installers remain unsigned until founder signing
accounts are configured.

The built-in chat and agent panel lives in `extension/` and reuses the pinned
Tervory CLI. The other built-in components live under `extensions/`:

- `tervory-complete`: autocomplete and inline edits.
- `tervory-index`: private local project indexing.
- `tervory-agents`: project rules, background agents and PR review.

Build scripts discover every component under `extensions/`. Code-OSS source is
fetched at a fixed commit; the whole fork is never vendored here.
