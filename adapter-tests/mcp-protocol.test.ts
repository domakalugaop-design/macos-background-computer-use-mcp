import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BackgroundComputerUseAdapter, createAdapterServer } from "../src/index.js";

const temporaryDirs: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("stdio MCP exposes only the sanitized tools and rejects unsafe calls before upstream dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "background-cu-mcp-test-"));
  temporaryDirs.push(directory);
  const callLog = join(directory, "upstream-calls.jsonl");
  const fixture = join(directory, "mock-upstream.mjs");
  await writeFile(fixture, `#!/usr/bin/env node
let buffer = "";
const names = ["list_apps","list_windows","get_app_state","click","type_text","press_key","scroll","drag","set_value","select_text","perform_secondary_action","open_app","open_url","manage_window","read_clipboard","write_clipboard","health_report"];
for await (const chunk of process.stdin) {
  buffer += chunk.toString();
  let newline;
  while ((newline = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    if (request.method === "tools/list") {
    const tools = names.map((name) => ({name, description:name, inputSchema:{type:"object",properties:{app:{type:"string"},value:{type:"string"},element_id:{type:"string"},activate:{type:"boolean"},allow_focus_change:{type:"boolean"},include_screenshot:{type:"boolean"},probe_capture_service:{type:"boolean"},x:{type:"number"}}}}));
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,result:{tools}})+"\\n");
    } else if (request.method === "tools/call") {
      await import("node:fs/promises").then((fs) => fs.appendFile(${JSON.stringify(callLog)}, JSON.stringify(request.params)+"\\n"));
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,result:{content:[{type:"text",text:"stubbed"}]}})+"\\n");
    }
  }
}
`);
  await chmod(fixture, 0o700);

  const adapter = new BackgroundComputerUseAdapter(fixture);
  await adapter.start();
  const server = createAdapterServer(adapter);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "adapter-security-test", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(clientTransport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "background_type_text_strict", "click", "get_app_state", "health_report", "list_apps", "list_windows", "set_value",
    ]);
    const clickTool = tools.tools.find((tool) => tool.name === "click");
    assert.ok(clickTool);
    assert.deepEqual(Object.keys(clickTool.inputSchema.properties ?? {}).sort(), ["app", "element_id"]);
    assert.deepEqual(clickTool.inputSchema.required, ["app", "element_id"]);
    const stateTool = tools.tools.find((tool) => tool.name === "get_app_state");
    assert.ok(stateTool);
    assert.equal("include_screenshot" in (stateTool.inputSchema.properties ?? {}), false);
    assert.equal(stateTool.inputSchema.additionalProperties, false);

    await assert.rejects(
      client.callTool({ name: "press_key", arguments: { app: "Finder", key: "cmd+q" } }),
    );
    await assert.rejects(
      client.callTool({ name: "open_app", arguments: { app: "Finder", activate: true } }),
    );
    await assert.rejects(
      client.callTool({ name: "get_app_state", arguments: { app: "Finder", ocr: true } }),
    );
    await assert.rejects(
      client.callTool({ name: "click", arguments: { app: "Finder", element_id: "e12@s3", allow_global_cursor: true } }),
    );
    assert.equal(await readFile(callLog, "utf8").catch(() => ""), "");

    await client.callTool({ name: "get_app_state", arguments: { app: "Finder" } });
    await client.callTool({ name: "click", arguments: { app: "Finder", element_id: "e12@s3" } });
    await client.callTool({ name: "set_value", arguments: { app: "TextEdit", element_id: "e0@s1", value: "ok" } });
    const calls = (await readFile(callLog, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(calls[0], {
      name: "get_app_state",
      arguments: { app: "Finder", include_screenshot: false, ocr: false },
    });
    assert.deepEqual(calls[1], {
      name: "click",
      arguments: { app: "Finder", element_id: "e12@s3" },
    });
    assert.deepEqual(calls[2], {
      name: "set_value",
      arguments: { app: "TextEdit", element_id: "e0@s1", value: "ok", include_screenshot: false, include_state: false },
    });
  } finally {
    await client.close();
    await server.close();
    await adapter.shutdown();
  }
});
