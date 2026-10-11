import AppKit
import ApplicationServices
import Carbon.HIToolbox

/// Input actions. Each handler receives the target app, its latest snapshot, and request params.
/// Coordinates (`x`, `y`) are in screenshot pixels of the latest app state (window points when
/// no screenshot was taken).
enum Actions {
    typealias Handler = @MainActor (NSRunningApplication, Snapshot?, JSON) async throws -> Any

    static let handlers: [String: Handler] = [
        "click": click,
        "type_text": typeText,
        "press_key": pressKey,
        "scroll": scroll,
        "set_value": setValue,
    ]

    // MARK: click

    @MainActor
    static func click(_ app: NSRunningApplication, _ state: Snapshot?, _ params: JSON) async throws -> Any {
        let snap = try require(state)
        let button = (params["button"] as? String ?? "left").lowercased()
        let count = max(1, optionalInt(params, "clickCount") ?? 1)
        if let index = optionalInt(params, "elementIndex") {
            let element = try snap.element(index)
            if button == "left", count == 1, axActions(element).contains("AXPress"),
               AXUIElementPerformAction(element, "AXPress" as CFString) == .success {
                return ["performed": "AXPress", "elementIndex": index]
            }
            guard let frame = axFrame(element) else {
                throw HelperError("no_frame", "Element \(index) has no position to click.")
            }
            try await mouseClick(app, CGPoint(x: frame.midX, y: frame.midY), button: button, count: count)
            return ["performed": "mouse", "elementIndex": index]
        }
        let point = try snap.screenPoint(x: requireDouble(params, "x"), y: requireDouble(params, "y"))
        try await mouseClick(app, point, button: button, count: count)
        return ["performed": "mouse", "x": point.x, "y": point.y]
    }

    @MainActor
    static func mouseClick(_ app: NSRunningApplication, _ point: CGPoint, button: String, count: Int) async throws {
        try await activate(app)
        let (down, up, mouseButton): (CGEventType, CGEventType, CGMouseButton) = switch button {
        case "right": (.rightMouseDown, .rightMouseUp, .right)
        case "left": (.leftMouseDown, .leftMouseUp, .left)
        default: throw HelperError("invalid_params", "button must be left or right")
        }
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: mouseButton)?
            .post(tap: .cghidEventTap)
        for i in 1...count {
            for type in [down, up] {
                let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: mouseButton)
                event?.setIntegerValueField(.mouseEventClickState, value: Int64(i))
                event?.post(tap: .cghidEventTap)
            }
        }
    }

    // MARK: keyboard

    @MainActor
    static func typeText(_ app: NSRunningApplication, _ state: Snapshot?, _ params: JSON) async throws -> Any {
        let text = try string(params, "text")
        try await activate(app)
        let source = CGEventSource(stateID: .hidSystemState)
        // One event per character: apps that handle keys individually (e.g. Calculator) read
        // only the first character of a multi-character event.
        for (typed, character) in text.enumerated() {
            guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {
                throw HelperError("user_intervened", "Another app came to the front after \(typed) characters; typing stopped.")
            }
            let units = Array(String(character).utf16)
            for keyDown in [true, false] {
                let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: keyDown)
                event?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
                event?.post(tap: .cghidEventTap)
            }
            try await Task.sleep(nanoseconds: 4_000_000)
        }
        return ["typed": text.count]
    }

    @MainActor
    static func pressKey(_ app: NSRunningApplication, _ state: Snapshot?, _ params: JSON) async throws -> Any {
        let chord = try string(params, "key")
        let (keyCode, flags) = try parseChord(chord)
        try await activate(app)
        let source = CGEventSource(stateID: .hidSystemState)
        // Press modifiers as real keys, then the key, then release in reverse order.
        let modifiers = modifierKeys.filter { flags.contains($0.flag) }
        var held: CGEventFlags = []
        func post(_ code: CGKeyCode, down: Bool) {
            let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down)
            event?.flags = held
            event?.post(tap: .cghidEventTap)
        }
        for m in modifiers { held.insert(m.flag); post(m.code, down: true) }
        post(keyCode, down: true)
        post(keyCode, down: false)
        for m in modifiers.reversed() { held.remove(m.flag); post(m.code, down: false) }
        return ["pressed": chord]
    }

    // MARK: scroll

    @MainActor
    static func scroll(_ app: NSRunningApplication, _ state: Snapshot?, _ params: JSON) async throws -> Any {
        let snap = try require(state)
        let direction = try string(params, "direction").lowercased()
        let lines = Int32(max(1, optionalInt(params, "amount") ?? 5))
        let (dy, dx): (Int32, Int32) = switch direction {
        case "up": (lines, 0)
        case "down": (-lines, 0)
        case "left": (0, lines)
        case "right": (0, -lines)
        default: throw HelperError("invalid_params", "direction must be up, down, left, or right")
        }
        let point: CGPoint
        if let index = optionalInt(params, "elementIndex") {
            guard let frame = axFrame(try snap.element(index)) else {
                throw HelperError("no_frame", "Element \(index) has no position to scroll over.")
            }
            point = CGPoint(x: frame.midX, y: frame.midY)
        } else if let x = optionalDouble(params, "x"), let y = optionalDouble(params, "y") {
            point = try snap.screenPoint(x: x, y: y)
        } else {
            try snap.requireWindow()
            point = CGPoint(x: snap.windowFrame.midX, y: snap.windowFrame.midY)
        }
        try await activate(app)
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?
            .post(tap: .cghidEventTap)
        let event = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)
        event?.location = point
        event?.post(tap: .cghidEventTap)
        return ["scrolled": direction, "lines": lines]
    }

    // MARK: set_value

    @MainActor
    static func setValue(_ app: NSRunningApplication, _ state: Snapshot?, _ params: JSON) async throws -> Any {
        let snap = try require(state)
        let index = try requireInt(params, "elementIndex")
        guard let value = params["value"] as? String else { throw HelperError("invalid_params", "value is required") }
        let element = try snap.element(index)
        var settable = DarwinBoolean(false)
        guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else {
            throw HelperError("not_settable", "Element \(index) does not accept a value.")
        }
        let status = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFString)
        guard status == .success else { throw HelperError("ax_error", "Setting the value failed (AXError \(status.rawValue)).") }
        return ["set": index]
    }

    // MARK: helpers

    @MainActor
    /// Bring the app to the front and confirm it, so synthesized input cannot reach another app.
    static func activate(_ app: NSRunningApplication) async throws {
        for attempt in 0..<10 {
            if NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier { return }
            if attempt == 3, let url = app.bundleURL {
                // Cooperative activation may refuse a background caller; LaunchServices may not.
                let config = NSWorkspace.OpenConfiguration()
                config.activates = true
                _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: config)
            } else {
                app.activate()
            }
            try await Task.sleep(nanoseconds: 150_000_000)
        }
        throw HelperError("activation_failed", "Could not bring '\(app.localizedName ?? "the app")' to the front; no input was sent.")
    }

    static func require(_ state: Snapshot?) throws -> Snapshot {
        guard let state else { throw HelperError("no_state", "Call get_app_state for this app before clicking, scrolling, or setting values.") }
        return state
    }

    static func requireDouble(_ params: JSON, _ key: String) throws -> Double {
        guard let value = optionalDouble(params, key) else { throw HelperError("invalid_params", "\(key) is required") }
        return value
    }

    static func requireInt(_ params: JSON, _ key: String) throws -> Int {
        guard let value = optionalInt(params, key) else { throw HelperError("invalid_params", "\(key) is required") }
        return value
    }
}

// MARK: - Key chords

private let modifierNames: [String: CGEventFlags] = [
    "cmd": .maskCommand, "command": .maskCommand, "super": .maskCommand,
    "shift": .maskShift,
    "alt": .maskAlternate, "option": .maskAlternate, "opt": .maskAlternate,
    "ctrl": .maskControl, "control": .maskControl,
    "fn": .maskSecondaryFn,
]

private let namedKeys: [String: Int] = [
    "return": kVK_Return, "enter": kVK_Return, "tab": kVK_Tab, "space": kVK_Space,
    "escape": kVK_Escape, "esc": kVK_Escape, "backspace": kVK_Delete, "delete": kVK_Delete,
    "forwarddelete": kVK_ForwardDelete, "home": kVK_Home, "end": kVK_End,
    "pageup": kVK_PageUp, "pagedown": kVK_PageDown,
    "left": kVK_LeftArrow, "right": kVK_RightArrow, "up": kVK_UpArrow, "down": kVK_DownArrow,
    "f1": kVK_F1, "f2": kVK_F2, "f3": kVK_F3, "f4": kVK_F4, "f5": kVK_F5, "f6": kVK_F6,
    "f7": kVK_F7, "f8": kVK_F8, "f9": kVK_F9, "f10": kVK_F10, "f11": kVK_F11, "f12": kVK_F12,
]

private let characterKeys: [Character: Int] = [
    "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D, "e": kVK_ANSI_E, "f": kVK_ANSI_F,
    "g": kVK_ANSI_G, "h": kVK_ANSI_H, "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L,
    "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P, "q": kVK_ANSI_Q, "r": kVK_ANSI_R,
    "s": kVK_ANSI_S, "t": kVK_ANSI_T, "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X,
    "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
    "0": kVK_ANSI_0, "1": kVK_ANSI_1, "2": kVK_ANSI_2, "3": kVK_ANSI_3, "4": kVK_ANSI_4,
    "5": kVK_ANSI_5, "6": kVK_ANSI_6, "7": kVK_ANSI_7, "8": kVK_ANSI_8, "9": kVK_ANSI_9,
    "-": kVK_ANSI_Minus, "=": kVK_ANSI_Equal, "[": kVK_ANSI_LeftBracket, "]": kVK_ANSI_RightBracket,
    ";": kVK_ANSI_Semicolon, "'": kVK_ANSI_Quote, ",": kVK_ANSI_Comma, ".": kVK_ANSI_Period,
    "/": kVK_ANSI_Slash, "\\": kVK_ANSI_Backslash, "`": kVK_ANSI_Grave,
]

private let modifierKeys: [(flag: CGEventFlags, code: CGKeyCode)] = [
    (.maskCommand, CGKeyCode(kVK_Command)), (.maskShift, CGKeyCode(kVK_Shift)),
    (.maskAlternate, CGKeyCode(kVK_Option)), (.maskControl, CGKeyCode(kVK_Control)),
    (.maskSecondaryFn, CGKeyCode(kVK_Function)),
]

/// Parse `cmd+shift+a`-style chords (US key positions).
func parseChord(_ chord: String) throws -> (CGKeyCode, CGEventFlags) {
    let parts = chord.split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
    guard let keyName = parts.last, !keyName.isEmpty else { throw HelperError("invalid_key", "Empty key chord.") }
    var flags: CGEventFlags = []
    for name in parts.dropLast() {
        guard let flag = modifierNames[name] else { throw HelperError("invalid_key", "Unknown modifier '\(name)'.") }
        flags.insert(flag)
    }
    if let code = namedKeys[keyName] { return (CGKeyCode(code), flags) }
    if keyName.count == 1, let code = characterKeys[keyName.first!] { return (CGKeyCode(code), flags) }
    throw HelperError("invalid_key", "Unknown key '\(keyName)'.")
}
