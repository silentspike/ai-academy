# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main`  | :white_check_mark: |

This is a privately maintained project. Only the main branch receives fixes;
there are no backports to earlier states.

---

## Reporting a Vulnerability

Please do **not** open a public issue. Use GitHub's private reporting instead:

**[Report a vulnerability](https://github.com/silentspike/ai-academy/security/advisories/new)**
(Repository → Security → Report a vulnerability)

Include: affected version or commit, operating mode (bridge serving directly, or
behind a web server), reproduction steps, and the impact you see. A minimal
reproduction helps a lot.

### Response times

| Step | Commitment |
|------|-----------|
| Acknowledgement | within 5 business days |
| Initial assessment | within 10 business days |
| Fix or timeline | depends on severity, but you will hear back |

These commitments are meant seriously, but this project has no on-call rotation
and no service agreement.

---

## In scope

The application runs entirely on the user's machine. There is no hosted service,
no account, and no central data store. What matters therefore is:

- **The bridge** (`bridge/bridge.mjs`) — binds to loopback only, requires a
  pairing token generated at startup, checks the origin of every request exactly,
  enforces size, time and rate limits, and spawns only a fixed list of executables
  with fixed arguments. No shell interpolation anywhere.
- **Handling of model output** — treated as untrusted data, never inserted as
  markup without sanitising.
- **Separation of data and served content** — learning state, profiles and logs
  live structurally outside the served directory and are not reachable over HTTP.
- **Logs** — written redacted; answer texts never appear in clear text, and the
  health endpoint contains no secret.

## Out of scope

- Vulnerabilities in the command-line tools used, or at the model provider —
  please report those to the respective project.
- Attacks that presuppose full access to the user account: anyone who can write
  files locally can modify the application anyway.
- The fact that free-text answers are transmitted to the provider of the connected
  model. That is the deliberate design; the interface says so at every free-text
  field.
- Errors in learning content. Those belong in a regular issue, not a security
  report — please use the *Content or legal error* template.

## Credentials

The application handles **no API keys**. Access to the language model runs
exclusively through the sign-in of the respective command-line tool. There is no
input field for keys, and the pipeline rejects the reintroduction of the
corresponding environment variables.

If you nevertheless find a secret anywhere in this repository, that is a bug —
please report it through the channel above.
