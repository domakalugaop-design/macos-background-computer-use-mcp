import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("production stdio path starts the pinned patched helper and exposes eight safe tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/index.js")],
  });
  const client = new Client({ name: "background-cu-stdio-smoke", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "background_focus_field_strict", "background_type_text_strict", "click", "get_app_state", "health_report", "list_apps", "list_windows", "set_value",
    ]);
    const click = tools.tools.find((tool) => tool.name === "click");
    assert.ok(click);
    assert.deepEqual(Object.keys(click.inputSchema.properties ?? {}).sort(), ["app", "element_id"]);
    await assert.rejects(
      client.callTool({ name: "click", arguments: { app: "Finder", element_id: "invalid" } }),
    );
    await assert.rejects(
      client.callTool({ name: "press_key", arguments: { app: "Finder", key: "cmd+q" } }),
    );
  } finally {
    await client.close();
  }
});
