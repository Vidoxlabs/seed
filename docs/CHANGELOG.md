# Changelog

Earlier release history (0.2.0 through 0.8.0) lives in the Changes sections of docs/contracts/ (run-model.md, tool-id.md, provider.md) and docs/bloom-interop.md.

## Unreleased

### Added

- Capability ledger (`docs/capabilities/`), six lead capability specifications (`CAP-03`, `CAP-06`, `CAP-12`, `CAP-13`, `CAP-16`, `CAP-17`), ADR convention pointer (`docs/adr/README.md`), and roadmap capability mapping (CAP-01, seed#1).
- Standalone capability ledger checks and scaffold squash evidence (CAP-02, seed#2).
- Closed tool schema validation and optional registry output schemas (CAP-03, seed#3).
- Model profile validator with reported, probed, and unknown provenance, plus recorded offline provider conformance fixtures (CAP-16, seed#4).
- Recorded owner decisions for the bloom doctor probe slice, now landed in bloom (CAP-16, seed#6).
- End-to-end harness exercise that composes the registry, admission, provider, run record, receipt, lease and resume contracts in one run (CAP-12, seed#7).

### Changed

- Rule 3 of the run model and the run-engine paragraph state that a restart resumes from a receipt, not an intent, and that an intent with no receipt goes to the owner (CAP-12, seed#7).
