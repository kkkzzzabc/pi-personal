import AppKit
import ApplicationServices

/// Error returned to the client as `{id, error: {code, message}}`.
struct HelperError: Error {
    let code: String
    let message: String
    init(_ code: String, _ message: String) {
        self.code = code
        self.message = message
    }
}

typealias JSON = [String: Any]

func string(_ params: JSON, _ key: String) throws -> String {
    guard let value = params[key] as? String, !value.trimmingCharacters(in: .whitespaces).isEmpty else {
        throw HelperError("invalid_params", "\(key) is required")
    }
    return value
}

func optionalInt(_ params: JSON, _ key: String) -> Int? {
    if let n = params[key] as? Int { return n }
    if let d = params[key] as? Double, d.rounded() == d { return Int(d) }
    return nil
}

func optionalDouble(_ params: JSON, _ key: String) -> Double? {
    if let d = params[key] as? Double { return d }
    if let n = params[key] as? Int { return Double(n) }
    return nil
}

// MARK: - Apps

func appInfo(_ app: NSRunningApplication) -> JSON {
    [
        "id": app.bundleIdentifier ?? "pid:\(app.processIdentifier)",
        "name": app.localizedName ?? "",
        "bundleName": bundleName(app) ?? "",
        "pid": Int(app.processIdentifier),
        "active": app.isActive,
        "hidden": app.isHidden,
    ]
}

func regularApps() -> [NSRunningApplication] {
    NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }
}

/// Bundle file name without `.app`, e.g. "Calculator"; stable across UI languages.
func bundleName(_ app: NSRunningApplication) -> String? {
    app.bundleURL?.deletingPathExtension().lastPathComponent
}

/// Resolve a running app by bundle id, localized name, or bundle file name (case-insensitive).
func resolveApp(_ query: String) throws -> NSRunningApplication {
    var q = query.lowercased()
    if q.hasSuffix(".app") { q = String(q.dropLast(4)) }
    let apps = regularApps()
    if let app = apps.first(where: { $0.bundleIdentifier?.lowercased() == q }) { return app }
    let byName = apps.filter { $0.localizedName?.lowercased() == q || bundleName($0)?.lowercased() == q }
    if byName.count == 1 { return byName[0] }
    if byName.count > 1 { throw HelperError("ambiguous_app", "More than one running app is named '\(query)'; use its bundle id.") }
    throw HelperError("app_not_running", "No running app matches '\(query)'. Launch it first.")
}

// MARK: - Accessibility primitives

func axAttr(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: AnyObject?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func axString(_ element: AXUIElement, _ name: String) -> String? {
    guard let value = axAttr(element, name) else { return nil }
    if let s = value as? String { return s.isEmpty ? nil : s }
    if let n = value as? NSNumber { return n.stringValue }
    return nil
}

func axChildren(_ element: AXUIElement) -> [AXUIElement] {
    (axAttr(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

func axActions(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success, let list = names as? [String] else { return [] }
    return list
}

func axFrame(_ element: AXUIElement) -> CGRect? {
    guard let pos = axAttr(element, kAXPositionAttribute), let size = axAttr(element, kAXSizeAttribute),
          CFGetTypeID(pos) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var extent = CGSize.zero
    AXValueGetValue(pos as! AXValue, .cgPoint, &point)
    AXValueGetValue(size as! AXValue, .cgSize, &extent)
    return CGRect(origin: point, size: extent)
}

/// The window to observe: focused, then main, then the first window.
func targetWindow(_ app: AXUIElement) -> AXUIElement? {
    if let w = axAttr(app, kAXFocusedWindowAttribute), CFGetTypeID(w) == AXUIElementGetTypeID() { return (w as! AXUIElement) }
    if let w = axAttr(app, kAXMainWindowAttribute), CFGetTypeID(w) == AXUIElementGetTypeID() { return (w as! AXUIElement) }
    return (axAttr(app, kAXWindowsAttribute) as? [AXUIElement])?.first
}

func truncate(_ s: String, _ max: Int) -> String {
    let flat = s.replacingOccurrences(of: "\n", with: " ")
    return flat.count <= max ? flat : String(flat.prefix(max)) + "…"
}
