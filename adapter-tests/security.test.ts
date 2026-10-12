import assert from "node:assert/strict";
import test from "node:test";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SAFE_TOOLS, sanitizeToolSchema, upstreamArguments, validateToolArguments } from "../adapter-src/policy.js";

test("only inspection, AXPress, bounded AX value setting, and non-probing health are allowlisted", () => {
  assert.deepEqual([...SAFE_TOOLS].sort(), [
    "background_focus_field_strict", "background_type_text_strict", "click", "get_app_state", "health_report", "list_apps", "list_windows", "set_value",
  ]);
});

test("all foreground/event/launch/window/text/clipboard handlers fail closed", () => {
  const excluded = [
    "type_text", "press_key", "scroll", "drag", "select_text",
    "perform_secondary_action", "open_app", "open_url", "manage_window",
    "read_clipboard", "write_clipboard",
  ];
  for (const name of excluded) {
    assert.match(validateToolArguments(name, {}).error ?? "", /not available/);
  }
});

test("model tool schema omits screenshot, OCR, event, activation, and capture probe parameters", () => {
  const tool = {
    name: "get_app_state",
    description: "state",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        include_screenshot: { type: "boolean" },
        ocr: { type: "boolean" },
        allow_focus_change: { type: "boolean" },
      },
      required: ["app"],
    },
  } as Tool;
  const safe = sanitizeToolSchema(tool);
  assert.ok(safe);
  assert.deepEqual(Object.keys(safe.inputSchema.properties ?? {}).sort(), ["app"]);
  assert.equal(safe.inputSchema.additionalProperties, false);
});

test("click schema exposes only app and element_id", () => {
  const tool = {
    name: "click",
    description: "unsafe upstream description",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" }, element_id: { type: "string" },
        x: { type: "number" }, allow_global_cursor: { type: "boolean" }, confirm: { type: "boolean" },
      },
      required: ["app"],
    },
  } as Tool;
  const safe = sanitizeToolSchema(tool);
  assert.ok(safe);
  assert.deepEqual(Object.keys(safe.inputSchema.properties ?? {}).sort(), ["app", "element_id"]);
  assert.deepEqual(safe.inputSchema.required, ["app", "element_id"]);
  assert.equal(safe.inputSchema.additionalProperties, false);
  assert.match(safe.description ?? "", /own AXPress action/);
});

test("unlisted and mistyped arguments are rejected", () => {
  assert.match(validateToolArguments("get_app_state", { app: "Finder", ocr: true }).error ?? "", /not allowed/);
  assert.match(validateToolArguments("get_app_state", { app: 7 }).error ?? "", /app must be a non-empty string/);
  assert.match(validateToolArguments("list_windows", {}).error ?? "", /app.*required/);
  assert.match(validateToolArguments("list_windows", { app: "" }).error ?? "", /app.*non-empty/);
  assert.match(validateToolArguments("set_value", { app: "TextEdit", element_id: "e1@s1", value: "x", confirm: true }).error ?? "", /not allowed/);
  assert.match(validateToolArguments("get_app_state", { app: "Finder", max_elements: 5001 }).error ?? "", /max_elements/);
});

test("set_value is limited to resolved identifiers and 4096 UTF-8 bytes", () => {
  assert.equal(validateToolArguments("set_value", { app: "TextEdit", element_id: "e1@s1", value: "safe" }).error, undefined);
  assert.match(validateToolArguments("set_value", { app: "TextEdit", element_id: "e1@s1", value: "é".repeat(2049) }).error ?? "", /4096 UTF-8 bytes/);
  assert.match(validateToolArguments("set_value", { app: "TextEdit", element_id: "", value: "safe" }).error ?? "", /element_id/);
});

test("click requires a current-shaped accessibility id and rejects every fallback flag", () => {
  assert.equal(validateToolArguments("click", { app: "Finder", element_id: "e12@s3" }).error, undefined);
  assert.match(validateToolArguments("click", { app: "Finder", element_id: "opaque-id" }).error ?? "", /current accessibility id/);
  assert.match(validateToolArguments("click", { app: "Finder", element_id: "e12@s3", x: 2 }).error ?? "", /not allowed/);
  assert.match(validateToolArguments("click", { app: "Finder", element_id: "e12@s3", allow_global_cursor: true }).error ?? "", /not allowed/);
});

test("adapter forces no screenshots, no state echo after write, and no capture health probe", () => {
  assert.deepEqual(upstreamArguments("get_app_state", { app: "Finder" }), {
    app: "Finder", include_screenshot: false, ocr: false,
  });
  assert.deepEqual(upstreamArguments("set_value", { app: "TextEdit", element_id: "e1@s1", value: "x" }), {
    app: "TextEdit", element_id: "e1@s1", value: "x", include_screenshot: false, include_state: false,
  });
  assert.deepEqual(upstreamArguments("click", { app: "Finder", element_id: "e12@s3" }), {
    app: "Finder", element_id: "e12@s3",
  });
  assert.deepEqual(upstreamArguments("health_report", {}), { probe_capture_service: false });
});

test("helper resolution rejects missing paths without downloading or falling back", async () => {
  const { resolveHelperPath } = await import("../adapter-src/index.js");
  await assert.rejects(resolveHelperPath("/definitely/missing/computer-use-mcp"), /helper not found/);
});
