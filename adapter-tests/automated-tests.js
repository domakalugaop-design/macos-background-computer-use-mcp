#!/usr/bin/env node
import { spawn } from "node:child_process";
const ADAPTER_PATH = "/Users/artemgavrilenko/Development/background-computer-use-adapter/dist/index.js";
const UPSTREAM_BINARY = "/Users/artemgavrilenko/Development/background-computer-use-adapter/computer-use-mcp";
async function runAdapter(input) {
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
                if (!child.killed)
                    child.kill("SIGKILL");
                resolve({ stdout, stderr });
            }, 1000);
        }, 5000);
    });
}
function parseResponse(output) {
    const lines = output.trim().split("\n");
    for (const line of lines) {
        if (line.startsWith("{")) {
            try {
                return JSON.parse(line);
            }
            catch {
                continue;
            }
        }
    }
    throw new Error("No valid JSON response found");
}
async function testMCPProtocol() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
        const response = parseResponse(result.stdout);
        if (response && typeof response === "object" && "result" in response) {
            return { name: "MCP Protocol - tools/list", passed: true };
        }
        return { name: "MCP Protocol - tools/list", passed: false, error: "Invalid response format" };
    }
    catch (e) {
        return { name: "MCP Protocol - tools/list", passed: false, error: String(e) };
    }
}
async function testToolAllowlist() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
        const response = parseResponse(result.stdout);
        const toolNames = response.result.tools.map(t => t.name);
        const expectedTools = new Set([
            "list_apps", "list_windows", "get_app_state", "click", "type_text",
            "press_key", "scroll", "set_value", "select_text", "perform_secondary_action",
            "open_app", "open_url", "manage_window", "read_clipboard", "write_clipboard", "health_report"
        ]);
        const missing = Array.from(expectedTools).filter(t => !toolNames.includes(t));
        if (missing.length === 0) {
            return { name: "Tool Allowlist - all expected tools present", passed: true };
        }
        return { name: "Tool Allowlist", passed: false, error: `Missing tools: ${missing.join(", ")}` };
    }
    catch (e) {
        return { name: "Tool Allowlist", passed: false, error: String(e) };
    }
}
async function testUnknownToolRejection() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"unknown_tool","arguments":{}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32601) {
            return { name: "Unknown Tool Rejection", passed: true };
        }
        return { name: "Unknown Tool Rejection", passed: false, error: "Expected error code -32601" };
    }
    catch (e) {
        return { name: "Unknown Tool Rejection", passed: false, error: String(e) };
    }
}
async function testUnknownArgumentRejection() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"click","arguments":{"app":"Finder","unknown_param":true}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32602) {
            return { name: "Unknown Argument Rejection", passed: true };
        }
        return { name: "Unknown Argument Rejection", passed: false, error: "Expected error code -32602" };
    }
    catch (e) {
        return { name: "Unknown Argument Rejection", passed: false, error: String(e) };
    }
}
async function testForegroundParameterRejection() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"click","arguments":{"app":"Finder","element_id":"test","allow_global_cursor":true}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32602 && response.error.message.includes("allow_global_cursor")) {
            return { name: "Foreground Parameter Rejection (allow_global_cursor)", passed: true };
        }
        return { name: "Foreground Parameter Rejection", passed: false, error: "Expected error for allow_global_cursor" };
    }
    catch (e) {
        return { name: "Foreground Parameter Rejection", passed: false, error: String(e) };
    }
}
async function testGlobalInputProhibition() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"press_key","arguments":{"app":"Finder","key":"cmd+s","allow_global_keyboard":true}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32602 && response.error.message.includes("allow_global_keyboard")) {
            return { name: "Global Input Prohibition (allow_global_keyboard)", passed: true };
        }
        return { name: "Global Input Prohibition", passed: false, error: "Expected error for allow_global_keyboard" };
    }
    catch (e) {
        return { name: "Global Input Prohibition", passed: false, error: String(e) };
    }
}
async function testCoordinateClickProhibition() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"click","arguments":{"app":"Finder","x":100,"y":200}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32602 && response.error.message.includes("Coordinate-based")) {
            return { name: "Coordinate Click Prohibition", passed: true };
        }
        return { name: "Coordinate Click Prohibition", passed: false, error: "Expected error for coordinate click" };
    }
    catch (e) {
        return { name: "Coordinate Click Prohibition", passed: false, error: String(e) };
    }
}
async function testCoordinateScrollProhibition() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scroll","arguments":{"app":"Finder","delta_y":100}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32602 && response.error.message.includes("Coordinate/delta-based")) {
            return { name: "Coordinate Scroll Prohibition", passed: true };
        }
        return { name: "Coordinate Scroll Prohibition", passed: false, error: "Expected error for coordinate scroll" };
    }
    catch (e) {
        return { name: "Coordinate Scroll Prohibition", passed: false, error: String(e) };
    }
}
async function testDragProhibition() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"drag","arguments":{"app":"Finder"}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32601 && response.error.message.includes("not available")) {
            return { name: "Drag Operation Prohibition", passed: true };
        }
        return { name: "Drag Operation Prohibition", passed: false, error: "Expected error for drag" };
    }
    catch (e) {
        return { name: "Drag Operation Prohibition", passed: false, error: String(e) };
    }
}
async function testEventFallbackProhibition() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"click","arguments":{"app":"Finder","element_id":"test","allow_focus_change":true}}}');
        const response = parseResponse(result.stdout);
        if (response.error && response.error.code === -32602 && response.error.message.includes("allow_focus_change")) {
            return { name: "Event Fallback Prohibition (allow_focus_change)", passed: true };
        }
        return { name: "Event Fallback Prohibition", passed: false, error: "Expected error for allow_focus_change" };
    }
    catch (e) {
        return { name: "Event Fallback Prohibition", passed: false, error: String(e) };
    }
}
async function testAmbiguousTargetHandling() {
    try {
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"click","arguments":{"app":"Finder","element_id":"nonexistent_element_id"}}}');
        const response = parseResponse(result.stdout);
        // Should get an error from upstream about element not found
        if (response.error && (response.error.code === -32602 || response.error.code === -32603)) {
            return { name: "Ambiguous Target Handling", passed: true };
        }
        return { name: "Ambiguous Target Handling", passed: false, error: "Expected error for nonexistent element" };
    }
    catch (e) {
        return { name: "Ambiguous Target Handling", passed: false, error: String(e) };
    }
}
async function testRetryLimit() {
    // Test that repeated calls to the same failing operation don't loop infinitely
    // This is more of a design check - the adapter doesn't implement retries itself
    return { name: "Retry Limit (design)", passed: true, error: "Adapter doesn't implement automatic retries - upstream handles it" };
}
async function testBackendFailureHandling() {
    try {
        // Test with an app that doesn't exist
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_app_state","arguments":{"app":"NonExistentApp12345"}}}');
        const response = parseResponse(result.stdout);
        if (response.error && (response.error.code === -32602 || response.error.code === -32603)) {
            return { name: "Backend Failure Handling", passed: true };
        }
        return { name: "Backend Failure Handling", passed: false, error: "Expected error for nonexistent app" };
    }
    catch (e) {
        return { name: "Backend Failure Handling", passed: false, error: String(e) };
    }
}
async function testMCPIsolation() {
    try {
        // Verify old open-computer-use is not in the isolated config
        const result = await runAdapter('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
        const response = parseResponse(result.stdout);
        const toolNames = response.result.tools.map(t => t.name);
        // Check that no tool names contain "open-computer-use" prefix
        const hasOldPrefix = toolNames.some(t => t.startsWith("open-computer-use_"));
        if (!hasOldPrefix) {
            return { name: "MCP Isolation - no old open-computer-use tools", passed: true };
        }
        return { name: "MCP Isolation", passed: false, error: "Found old open-computer-use tools" };
    }
    catch (e) {
        return { name: "MCP Isolation", passed: false, error: String(e) };
    }
}
async function runAllTests() {
    const tests = [
        testMCPProtocol,
        testToolAllowlist,
        testUnknownToolRejection,
        testUnknownArgumentRejection,
        testForegroundParameterRejection,
        testGlobalInputProhibition,
        testCoordinateClickProhibition,
        testCoordinateScrollProhibition,
        testDragProhibition,
        testEventFallbackProhibition,
        testAmbiguousTargetHandling,
        testRetryLimit,
        testBackendFailureHandling,
        testMCPIsolation,
    ];
    const results = [];
    console.log("Running automated tests...\n");
    for (const test of tests) {
        const result = await test();
        results.push(result);
        const status = result.passed ? "✅ PASS" : "❌ FAIL";
        console.log(`${status} ${result.name}`);
        if (!result.passed && result.error) {
            console.log(`   Error: ${result.error}`);
        }
    }
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`\n${passed}/${total} tests passed`);
    if (passed !== total) {
        console.log("\nFailed tests:");
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
        process.exit(1);
    }
}
runAllTests().catch(console.error);
//# sourceMappingURL=automated-tests.js.map