# Security

The server is local stdio only in this snapshot. It does not open a network listener, execute shell commands, read credentials, or copy TCC/Keychain state. Unsafe upstream tools are rejected before dispatch. GUI tests must use an isolated fixture and never user documents.

Report security issues privately before any public release.
