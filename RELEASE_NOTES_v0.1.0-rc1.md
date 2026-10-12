# macOS Background Computer Use MCP v0.1.0-rc1

Local release candidate; not published.

- macOS arm64.
- stdio MCP transport.
- Safe allowlist: `list_apps`, `list_windows`, `get_app_state`, `click`, `set_value`, `health_report`, and `background_type_text_strict`.
- Strict text requires an already-focused AXTextField, exact PID/element identity, and a non-foreground target app.
- Global keyboard/mouse input, activation, clipboard, shell execution, network listeners, and automatic fallbacks are disabled.
- Accessibility permission is required.
- HTTP transport and Windows support are not included.

Known upstream-only test defect: four KeymapTests reject single-letter test keys. The parser is unreachable from the supported adapter allowlist and was not changed.
