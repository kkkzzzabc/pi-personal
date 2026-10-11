// pi-cua-helper: macOS accessibility and input helper for pi's computer-use extension.
//
// Protocol: one JSON object per line on stdin, `{"id": <number>, "method": <string>, "params": {...}}`.
// Each request gets one line on stdout, `{"id", "result"}` or `{"id", "error": {"code", "message"}}`.
// Requests are handled in order. Element indexes come from the latest `get_app_state` of that app.
import AppKit
import ApplicationServices
import Foundation

var snapshots: [pid_t: Snapshot] = [:]


@MainActor
func handle(_ method: String, _ params: JSON) async throws -> Any {
    switch method {
    case "permissions":
        return ["accessibility": AXIsProcessTrusted(), "postEvents": CGPreflightPostEventAccess(),
                "screenRecording": CGPreflightScreenCaptureAccess()]

    case "request_permissions":
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        let ax = AXIsProcessTrustedWithOptions(options)
        let screen = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
        return ["accessibility": ax, "screenRecording": screen]

    case "list_apps":
        return regularApps().map(appInfo)

    case "resolve_app":
        // Identify an app (running or installed) without touching it; used for approval checks.
        let query = try string(params, "app")
        if let running = try? resolveApp(query) { return appInfo(running).merging(["running": true]) { $1 } }
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: query) ?? applicationURL(named: query),
              let bundle = Bundle(url: url) else {
            throw HelperError("app_not_found", "No running or installed app matches '\(query)'.")
        }
        let name = (bundle.localizedInfoDictionary?["CFBundleDisplayName"] ?? bundle.infoDictionary?["CFBundleName"]) as? String
        return ["id": bundle.bundleIdentifier ?? url.path, "name": name ?? url.deletingPathExtension().lastPathComponent,
                "bundleName": url.deletingPathExtension().lastPathComponent, "running": false]

    case "launch_app":
        let query = try string(params, "app")
        if let running = try? resolveApp(query) {
            running.activate()
            return appInfo(running)
        }
        let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: query) ?? applicationURL(named: query)
        guard let appURL = url else { throw HelperError("app_not_found", "No installed app matches '\(query)'.") }
        let app = try await NSWorkspace.shared.openApplication(at: appURL, configuration: NSWorkspace.OpenConfiguration())
        try await Task.sleep(nanoseconds: 800_000_000)
        return appInfo(app)

    case "get_app_state":
        guard AXIsProcessTrusted() else {
            throw HelperError("permissions_missing", "Accessibility permission is not granted to the process that launched the helper.")
        }
        let app = try resolveApp(try string(params, "app"))
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(axApp, 2.0)
        guard let window = targetWindow(axApp), let frame = axFrame(window) else {
            snapshots[app.processIdentifier] = Snapshot(pid: app.processIdentifier, elements: [], windowFrame: .zero, pixelsPerPoint: 1)
            return ["app": appInfo(app), "text": "(The app has no open window. Keyboard shortcuts such as cmd+n still reach it.)",
                    "nodeCount": 0, "truncated": false] as JSON
        }
        let tree = serializeTree(
            window: window,
            maxNodes: optionalInt(params, "maxNodes") ?? 500,
            maxDepth: optionalInt(params, "maxDepth") ?? 30
        )
        var result: JSON = [
            "app": appInfo(app),
            "window": ["title": axString(window, kAXTitleAttribute) ?? "", "x": frame.minX, "y": frame.minY,
                       "width": frame.width, "height": frame.height],
            "text": tree.text,
            "nodeCount": tree.elements.count,
            "truncated": tree.truncated,
        ]
        var pixelsPerPoint = 1.0
        if (params["screenshot"] as? Bool) ?? true {
            if CGPreflightScreenCaptureAccess() {
                let shot = try await captureWindow(pid: app.processIdentifier, frame: frame, maxWidth: optionalInt(params, "maxWidth") ?? 1280)
                pixelsPerPoint = shot.pixelsPerPoint
                result["screenshot"] = ["mimeType": "image/jpeg", "data": shot.data.base64EncodedString(),
                                        "width": shot.width, "height": shot.height]
            } else {
                result["screenshotError"] = "Screen Recording permission is not granted."
            }
        }
        snapshots[app.processIdentifier] = Snapshot(pid: app.processIdentifier, elements: tree.elements,
                                                    windowFrame: frame, pixelsPerPoint: pixelsPerPoint)
        return result

    default:
        if let action = Actions.handlers[method] {
            let app = try resolveApp(try string(params, "app"))
            let result = try await action(app, snapshots[app.processIdentifier], params)
            // Synthesized events are delivered asynchronously; let the app process them
            // so an immediate get_app_state reflects the action.
            try await Task.sleep(nanoseconds: 200_000_000)
            return result
        }
        throw HelperError("unknown_method", "Unknown method '\(method)'.")
    }
}

func applicationURL(named name: String) -> URL? {
    let fm = FileManager.default
    for dir in ["/Applications", "/System/Applications", "/System/Applications/Utilities", "\(NSHomeDirectory())/Applications"] {
        let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).app")
        if fm.fileExists(atPath: url.path) { return url }
    }
    return nil
}

func write(_ object: JSON) {
    var data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    data.append(0x0A)
    FileHandle.standardOutput.write(data)
}

// Connect to the window server before using ScreenCaptureKit or CoreGraphics; a bare CLI
// process otherwise aborts in CGS_REQUIRE_INIT. `.prohibited` keeps the helper out of the Dock.
@MainActor func connectToWindowServer() {
    NSApplication.shared.setActivationPolicy(.prohibited)
}
connectToWindowServer()

for try await line in FileHandle.standardInput.bytes.lines {
    guard let data = line.data(using: .utf8),
          let request = (try? JSONSerialization.jsonObject(with: data)) as? JSON else {
        write(["id": NSNull(), "error": ["code": "parse_error", "message": "Request is not a JSON object."]])
        continue
    }
    let id = request["id"] ?? NSNull()
    do {
        let result = try await handle(request["method"] as? String ?? "", request["params"] as? JSON ?? [:])
        write(["id": id, "result": result])
    } catch let error as HelperError {
        write(["id": id, "error": ["code": error.code, "message": error.message]])
    } catch {
        write(["id": id, "error": ["code": "internal_error", "message": "\(error)"]])
    }
}
