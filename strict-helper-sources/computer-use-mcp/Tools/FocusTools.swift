import ApplicationServices
import CoreGraphics
import Foundation
import MCP

/// Change only the target application's AX text-field focus. This operation
/// never activates the app and never posts keyboard or mouse input.
func backgroundFocusFieldStrictImpl(_ args: [String: Value]) async throws -> CallTool.Result {
    let app = try resolveApp(args.requireString("app"))
    try requireAccessibilityTrusted()
    let expectedPID = try args.requireNumber("target_pid")
    guard expectedPID.isFinite, expectedPID.rounded() == expectedPID,
        expectedPID >= 1, expectedPID <= Double(Int32.max), Int32(expectedPID) == app.pid
    else { return .text("BLOCKED: target PID does not match the currently resolved app.", isError: true) }

    let identifier = try args.requireString("ax_identifier")
    let target = try await resolveMutationTarget(app: app, elementID: args.requireString("element_id"))
    var ownerPID = pid_t(0)
    guard AXUIElementGetPid(target.element, &ownerPID) == .success, ownerPID == app.pid else {
        return .text("BLOCKED: AX element ownership did not match the exact target PID.", isError: true)
    }
    guard ["AXTextField", "AXTextArea"].contains(axRole(target.element)),
        axString(target.element, kAXIdentifierAttribute as String) == identifier
    else { return .text("BLOCKED: target is not the exact requested AX text field.", isError: true) }

    guard let foregroundBefore = FrontmostAppSnapshot.current(), foregroundBefore.pid != app.pid else {
        return .text("BLOCKED: target app is foreground or foreground identity is unavailable.", isError: true)
    }
    let cursorBefore = CGEvent(source: nil)?.location
    let focusedBefore = axElement(app.axApplication, kAXFocusedUIElementAttribute)
    guard let focusedBefore, !CFEqual(focusedBefore, target.element) else {
        return .text("BLOCKED: target is already focused; no focus change was attempted.", isError: true)
    }

    let error = AXUIElementSetAttributeValue(target.element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    guard error == .success else {
        return .text("BLOCKED: AX focus change failed (\(axErrorDescription(error))).", isError: true)
    }

    var changed = false
    for _ in 0..<20 {
        if let current = axElement(app.axApplication, kAXFocusedUIElementAttribute), CFEqual(current, target.element) {
            changed = true
            break
        }
        try? await Task.sleep(for: .milliseconds(20))
    }
    let foregroundAfter = FrontmostAppSnapshot.current()
    let cursorAfter = CGEvent(source: nil)?.location
    guard changed else {
        return .text("FAIL: AX focus attribute was accepted, but AXFocusedUIElement did not become the exact target.", isError: true)
    }
    guard foregroundBefore == foregroundAfter else {
        return .text("FAIL: focus change altered the foreground application.", isError: true)
    }
    guard cursorBefore == cursorAfter else {
        return .text("FAIL: focus change moved the physical cursor.", isError: true)
    }
    let output: [String: Any] = [
        "status": "FOCUS_CHANGED",
        "target_pid": Int(app.pid),
        "target_element_id": target.snapshotElement.id,
        "ax_identifier": identifier,
        "foreground_preserved": true,
        "cursor_preserved": true,
        "keyboard_input_sent": false,
        "activation_used": false,
        "fallback_used": false,
    ]
    let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
    return .text(String(decoding: data, as: UTF8.self))
}
