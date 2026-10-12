# macOS Background Computer Use MCP

Local research repository for a background-only macOS MCP adapter. The execution policy is fail-closed: AX discovery/read, AXPress, bounded AXSetValue, health reporting, and the qualified strict PID-only text route are exposed; global keyboard/mouse input, activation, clipboard, shell execution, and automatic fallbacks are excluded.

The strict route is based on `minghinmatthewlam/computer-use-mcp` commit `82dd8093e44819c51537f489059e172777d7f1d7` and retains the upstream MIT notice. This repository is an un-published qualification snapshot; paths and binaries must be made portable before distribution.
