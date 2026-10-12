# v0.1.0 release qualification

Date: 2026-10-12

## Keymap isolation

The clean upstream commit `82dd8093e44819c51537f489059e172777d7f1d7` reproduces four `KeymapTests` failures: `modifierChord`, `modifierAliases`, `wouldInsertTextDetectsPrintableKeys`, and `wouldInsertTextRejectsNavigationAndShortcuts`. Each fails because the parser rejects `a` or `s` as an unknown key in a test chord. The same four failures occur in the repository source.

Static call graph: `Keymap.parse` and `Keymap.wouldInsertText` are reached only from `press_key` and its secure-field safety gate. The exported adapter allowlist excludes `press_key`, `type_text`, and all other synthetic-input tools. `click` calls `clickImpl` and AX delivery; `background_type_text_strict` calls `backgroundTypeTextStrictImpl`, which validates PID, ownership, existing AX focus, and non-foreground state before `CGEvent.postToPid`; neither calls Keymap. Perception, window listing, set_value, and health_report do not call Keymap.

Therefore the failing tests are an isolated upstream test/parser defect and are not reachable from the supported adapter API or strict PID route. They do not justify changing the input engine.

## Gates

- Portable paths: PASS. Helper is resolved from `bin/computer-use-mcp` beside the package or explicit `BACKGROUND_COMPUTER_USE_HELPER`; missing helper fails closed.
- Fresh arm64 Swift release build: PASS. The generated helper was `Mach-O arm64`; SHA256 was `d8dafe625ee32f8fdbde426fb2a0d0a334e6906265df0840de25211c363cbe82`.
- Fresh adapter and stdio tests: PASS, 11/11.
- Independent GUI acceptance with the fresh adapter/helper: PASS for AX discovery, AXPress, strict PID text, binding/readback, dependent label, foreground, cursor, and no global fallback.
- License: PASS for upstream MIT; dependency licenses are recorded by the lockfile and are compatible with this private candidate.
- Secret/history scan: PASS; no credentials or private user paths remain in tracked files/history.
- Network listener: PASS, none implemented.
- CI/release workflows: PASS as preparation; release workflow is manual build-only and never publishes.

## Scope limits

macOS arm64 only. Accessibility permission is required. Strict text works only when the target AXTextField is already focused, the target app is not foreground, and the exact PID and element identity match. HTTP transport is not implemented. No Windows support is claimed.

## Decision

`PUBLICATION_READY=NO` while the upstream Keymap suite remains red. The defect is isolated from the supported API, but the full upstream suite is not green. No tests were disabled or altered.
