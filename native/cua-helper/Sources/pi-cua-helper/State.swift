import AppKit
import ApplicationServices
import ScreenCaptureKit
import UniformTypeIdentifiers

/// Observation of one app window. Element indexes stay valid until the next observation.
final class Snapshot {
    let pid: pid_t
    let elements: [AXUIElement]
    /// Window frame in global screen points (top-left origin).
    let windowFrame: CGRect
    /// Screenshot pixels per window point; maps screenshot coordinates to screen points.
    let pixelsPerPoint: Double

    init(pid: pid_t, elements: [AXUIElement], windowFrame: CGRect, pixelsPerPoint: Double) {
        self.pid = pid
        self.elements = elements
        self.windowFrame = windowFrame
        self.pixelsPerPoint = pixelsPerPoint
    }

    func requireWindow() throws {
        if windowFrame == .zero { throw HelperError("window_not_found", "The latest app state has no window.") }
    }

    func element(_ index: Int) throws -> AXUIElement {
        guard index >= 0, index < elements.count else {
            throw HelperError("stale_element", "Element \(index) is not in the latest app state; call get_app_state again.")
        }
        return elements[index]
    }

    /// Convert a screenshot-pixel coordinate to a global screen point.
    func screenPoint(x: Double, y: Double) throws -> CGPoint {
        try requireWindow()
        guard x >= 0, y >= 0, x <= windowFrame.width * pixelsPerPoint, y <= windowFrame.height * pixelsPerPoint else {
            throw HelperError("out_of_window", "Coordinates (\(x), \(y)) are outside the app window.")
        }
        return CGPoint(x: windowFrame.minX + x / pixelsPerPoint, y: windowFrame.minY + y / pixelsPerPoint)
    }
}

private let interestingActions: [String: String] = [
    "AXPress": "press", "AXIncrement": "increment", "AXDecrement": "decrement",
    "AXShowMenu": "menu", "AXConfirm": "confirm", "AXCancel": "cancel", "AXPick": "pick",
]

/// Serialize the window's accessibility tree as indented, indexed lines.
func serializeTree(window: AXUIElement, maxNodes: Int, maxDepth: Int) -> (text: String, elements: [AXUIElement], truncated: Bool) {
    var lines: [String] = []
    var elements: [AXUIElement] = []
    var truncated = false

    func visit(_ element: AXUIElement, depth: Int) {
        if elements.count >= maxNodes { truncated = true; return }
        let index = elements.count
        elements.append(element)

        let role = axString(element, kAXRoleAttribute) ?? "AXUnknown"
        var parts = ["[\(index)] \(role.hasPrefix("AX") ? String(role.dropFirst(2)) : role)"]
        if let subrole = axString(element, kAXSubroleAttribute) { parts.append("(\(subrole.replacingOccurrences(of: "AX", with: "")))") }
        if let title = axString(element, kAXTitleAttribute) { parts.append("\"\(truncate(title, 80))\"") }
        if let value = axString(element, kAXValueAttribute) { parts.append("value=\"\(truncate(value, 120))\"") }
        if let desc = axString(element, kAXDescriptionAttribute) { parts.append("desc=\"\(truncate(desc, 80))\"") }
        if let help = axString(element, kAXHelpAttribute) { parts.append("help=\"\(truncate(help, 60))\"") }
        if let enabled = axAttr(element, kAXEnabledAttribute) as? Bool, !enabled { parts.append("disabled") }
        if let focused = axAttr(element, kAXFocusedAttribute) as? Bool, focused { parts.append("focused") }
        let actions = axActions(element).compactMap { interestingActions[$0] }
        if !actions.isEmpty { parts.append("actions=\(actions.joined(separator: ","))") }
        lines.append(String(repeating: "  ", count: depth) + parts.joined(separator: " "))

        guard depth < maxDepth else {
            if !axChildren(element).isEmpty { truncated = true }
            return
        }
        for child in axChildren(element) { visit(child, depth: depth + 1) }
    }

    visit(window, depth: 0)
    return (lines.joined(separator: "\n"), elements, truncated)
}

/// Capture the app window matching `frame` as a JPEG.
func captureWindow(pid: pid_t, frame: CGRect, maxWidth: Int) async throws -> (data: Data, width: Int, height: Int, pixelsPerPoint: Double) {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    let candidates = content.windows.filter { $0.owningApplication?.processID == pid && $0.windowLayer == 0 }
    guard let window = candidates.min(by: { distance($0.frame, frame) < distance($1.frame, frame) }) else {
        throw HelperError("window_not_found", "No on-screen window found for the app.")
    }
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let nativeScale = Double(filter.pointPixelScale)
    let nativeWidth = Double(window.frame.width) * nativeScale
    let scale = nativeWidth > Double(maxWidth) ? nativeScale * Double(maxWidth) / nativeWidth : nativeScale

    let config = SCStreamConfiguration()
    config.width = max(1, Int((Double(window.frame.width) * scale).rounded()))
    config.height = max(1, Int((Double(window.frame.height) * scale).rounded()))
    config.showsCursor = false
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

    let data = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw HelperError("encode_failed", "Could not create a JPEG encoder.")
    }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.7] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw HelperError("encode_failed", "Could not encode the screenshot.") }
    return (data as Data, image.width, image.height, Double(image.width) / Double(window.frame.width))
}

private func distance(_ a: CGRect, _ b: CGRect) -> Double {
    abs(a.minX - b.minX) + abs(a.minY - b.minY) + abs(a.width - b.width) + abs(a.height - b.height)
}
