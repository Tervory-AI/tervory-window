# Founder settings

## Window installer signing (unsigned until supplied)

These optional GitHub repository settings require founder-owned paid signing
accounts. No values are requested or stored in this repository. Current
`window` builds are unsigned on **every OS**, with checksums and explicit
`-unsigned` artifact names. These names reserve the future signing integration;
merely adding them does not make today's build signed or notarized.

| Setting name | Where | Purpose |
| --- | --- | --- |
| `WINDOW_WINDOWS_CERTIFICATE_BASE64` | GitHub Actions secret | Founder-owned Windows Authenticode certificate. |
| `WINDOW_WINDOWS_CERTIFICATE_PASSWORD` | GitHub Actions secret | Unlock that certificate in a future signing step. |
| `WINDOW_APPLE_ID` | GitHub Actions secret | Founder-owned Apple notarization account. |
| `WINDOW_APPLE_TEAM_ID` | GitHub Actions secret | Apple developer team for a future signing/notarization step. |
| `WINDOW_APPLE_APP_PASSWORD` | GitHub Actions secret | App-specific notarization credential. |

No setting is needed to build the unsigned Linux, macOS or Windows artifacts.
Trigger sign-in configuration remains owned by `codex/trigger-signin`; the
window uses the CLI's current sign-in flow and adds no identity provider setting.
