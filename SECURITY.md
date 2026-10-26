# Security Policy

We take security reports seriously and appreciate responsible disclosure.

## Supported versions

`dte-sdk` is pre-1.0. Security fixes are provided for the latest published
version only.

| Version          | Supported          |
| ---------------- | ------------------ |
| latest 0.x       | :white_check_mark: |
| older 0.x        | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.** Public
disclosure before a fix is available puts every downstream user at risk.

Instead, report privately through GitHub:

1. Go to the [**Security** tab](https://github.com/arrowsw/dte-sdk/security) of
   the repository.
2. Click **"Report a vulnerability"** to open a private advisory.

If you cannot use GitHub's private reporting, you may reach the maintainers via
the contact listed on the repository's GitHub organization page.

### What to include

- A description of the issue and its impact.
- A minimal reproduction (input, function called, observed vs expected
  result), or a proof-of-concept for resource-exhaustion issues.
- The affected version(s).

### Response targets

- **Acknowledgement:** within 72 hours.
- **Triage and severity assessment:** within 7 days.
- **Fix or mitigation:** as fast as severity warrants; we will keep you updated
  and coordinate a disclosure timeline with you.

## Scope

Out of scope: vulnerabilities in dependencies of the development toolchain that
do not affect the published, zero-runtime-dependency package.

## Supply chain

Releases are published from CI on a signed tag with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements)
(a Sigstore attestation linking each tarball to its source commit and build).
You can verify an installed copy with:

```bash
npm audit signatures
```
