#!/usr/bin/env node

import { spawn, ChildProcess } from "node:child_process";

const ADAPTER_PATH = process.env.ADAPTER_PATH ?? "./dist/index.js";
const UPSTREAM_BINARY = process.env.UPSTREAM_BINARY ?? "./bin/computer-use-mcp";

async function runAdapter(input: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [ADAPTER_PATH], {
      env: { ...process.env, COMPUTER_USE_MCP_BINARY: UPSTREAM_BINARY },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => { stdout += data.toString(); });
    child.stderr?.on("data", (data) => { stderr += data.toString(); });

    child.stdin?.write(input + "\n");
    child.stdin?.end();

    setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
        resolve({ stdout, stderr });
      }, 1000);
    }, 5000);
  });
}

async function debugTest() {
  const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"click","arguments":{"app":"Finder","x":100,"y":200}}}');
  console.log("STDOUT:");
  console.log(result.stdout);
  console.log("\nSTDERR:");
  console.log(result.stderr);
  
  const lines = result.stdout.trim().split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        console.log("\nParsed response:");
        console.log(JSON.stringify(parsed, null, 2));
        break;
      } catch {
        continue;
      }
    }
  }
}

debugTest().catch(console.error);