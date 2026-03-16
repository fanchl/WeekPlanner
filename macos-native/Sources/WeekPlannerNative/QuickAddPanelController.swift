import AppKit

private final class QuickAddPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class QuickAddPanelController: NSObject, NSWindowDelegate, NSTextFieldDelegate {
    private let positionStoreKey = "WeekPlanner.quickAddPanelPositions"
    private let panelSize = NSSize(width: 640, height: 64)
    private let onSubmit: (String) -> Void

    private lazy var panel: QuickAddPanel = makePanel()
    private lazy var inputField: NSTextField = makeInputField()

    init(onSubmit: @escaping (String) -> Void) {
        self.onSubmit = onSubmit
        super.init()
    }

    func show() {
        guard let screen = currentMouseScreen() ?? NSScreen.main else { return }

        applyPosition(on: screen)
        inputField.stringValue = ""
        panel.orderFrontRegardless()

        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(inputField)
        inputField.selectText(nil)

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.panel.orderFrontRegardless()
            self.panel.makeKeyAndOrderFront(nil)
            self.panel.makeFirstResponder(self.inputField)
            self.inputField.selectText(nil)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            guard let self else { return }
            guard self.panel.isVisible, NSApp.keyWindow !== self.panel else { return }
            NSApp.activate(ignoringOtherApps: true)
            self.panel.orderFrontRegardless()
            self.panel.makeKeyAndOrderFront(nil)
            self.panel.makeFirstResponder(self.inputField)
            self.inputField.selectText(nil)
        }
    }

    func windowDidMove(_ notification: Notification) {
        persistCurrentPosition()
    }

    func windowDidResignKey(_ notification: Notification) {
        panel.orderOut(nil)
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            panel.orderOut(nil)
            return true
        }

        if commandSelector == #selector(NSResponder.insertNewline(_:)) {
            if textView.hasMarkedText() {
                return false
            }

            let trimmed = inputField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return true }
            onSubmit(trimmed)
            inputField.stringValue = ""
            panel.orderOut(nil)
            return true
        }

        return false
    }

    private func makePanel() -> QuickAddPanel {
        let panel = QuickAddPanel(
            contentRect: NSRect(origin: .zero, size: panelSize),
            styleMask: [.titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = false
        panel.worksWhenModal = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.backgroundColor = NSColor(calibratedRed: 0.17, green: 0.17, blue: 0.19, alpha: 1.0)
        panel.contentView = makeContentView()
        return panel
    }

    private func makeContentView() -> NSView {
        let root = NSView(frame: NSRect(origin: .zero, size: panelSize))
        root.wantsLayer = true
        root.layer?.cornerRadius = 22
        root.layer?.borderWidth = 1
        root.layer?.borderColor = NSColor.white.withAlphaComponent(0.08).cgColor
        root.layer?.backgroundColor = NSColor(calibratedRed: 0.16, green: 0.16, blue: 0.18, alpha: 0.97).cgColor
        root.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSTextField(labelWithString: "+")
        icon.font = NSFont.systemFont(ofSize: 16, weight: .semibold)
        icon.textColor = .white
        icon.alignment = .center
        icon.wantsLayer = true
        icon.layer?.cornerRadius = 12
        icon.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.08).cgColor
        icon.translatesAutoresizingMaskIntoConstraints = false

        inputField.translatesAutoresizingMaskIntoConstraints = false

        let targetLabel = NSTextField(labelWithString: "📥Inbox / 今天")
        targetLabel.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        targetLabel.textColor = NSColor.white.withAlphaComponent(0.5)
        targetLabel.translatesAutoresizingMaskIntoConstraints = false

        let divider = NSBox()
        divider.boxType = .custom
        divider.isTransparent = true
        divider.fillColor = NSColor.white.withAlphaComponent(0.08)
        divider.translatesAutoresizingMaskIntoConstraints = false

        let enterLabel = NSTextField(labelWithString: "Enter 保存")
        enterLabel.font = NSFont.systemFont(ofSize: 11, weight: .regular)
        enterLabel.textColor = NSColor.white.withAlphaComponent(0.5)
        enterLabel.translatesAutoresizingMaskIntoConstraints = false

        let escLabel = NSTextField(labelWithString: "Esc 关闭")
        escLabel.font = NSFont.systemFont(ofSize: 11, weight: .regular)
        escLabel.textColor = NSColor.white.withAlphaComponent(0.5)
        escLabel.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(icon)
        root.addSubview(inputField)
        root.addSubview(targetLabel)
        root.addSubview(divider)
        root.addSubview(enterLabel)
        root.addSubview(escLabel)

        NSLayoutConstraint.activate([
            root.widthAnchor.constraint(equalToConstant: panelSize.width),
            root.heightAnchor.constraint(equalToConstant: panelSize.height),

            icon.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            icon.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 24),
            icon.heightAnchor.constraint(equalToConstant: 24),

            inputField.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 12),
            inputField.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            inputField.trailingAnchor.constraint(lessThanOrEqualTo: targetLabel.leadingAnchor, constant: -16),

            escLabel.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            escLabel.centerYAnchor.constraint(equalTo: root.centerYAnchor),

            enterLabel.trailingAnchor.constraint(equalTo: escLabel.leadingAnchor, constant: -10),
            enterLabel.centerYAnchor.constraint(equalTo: root.centerYAnchor),

            divider.trailingAnchor.constraint(equalTo: enterLabel.leadingAnchor, constant: -10),
            divider.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            divider.widthAnchor.constraint(equalToConstant: 1),
            divider.heightAnchor.constraint(equalToConstant: 14),

            targetLabel.trailingAnchor.constraint(equalTo: divider.leadingAnchor, constant: -10),
            targetLabel.centerYAnchor.constraint(equalTo: root.centerYAnchor)
        ])

        return root
    }

    private func makeInputField() -> NSTextField {
        let field = NSTextField(string: "")
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = NSFont.systemFont(ofSize: 18, weight: .medium)
        field.textColor = .white
        field.placeholderString = "输入待办"
        field.delegate = self
        return field
    }

    private func currentMouseScreen() -> NSScreen? {
        let mouseLocation = NSEvent.mouseLocation
        return NSScreen.screens.first(where: { NSMouseInRect(mouseLocation, $0.frame, false) })
    }

    private func applyPosition(on screen: NSScreen) {
        let visibleFrame = screen.visibleFrame
        let storedPosition = loadStoredPositions()[screenIdentifier(for: screen)]

        let x: CGFloat
        let y: CGFloat

        if let storedPosition {
            x = visibleFrame.origin.x + min(max(storedPosition.offsetX, 0), max(0, visibleFrame.width - panelSize.width))
            y = visibleFrame.origin.y + min(max(storedPosition.offsetY, 0), max(0, visibleFrame.height - panelSize.height))
        } else {
            x = visibleFrame.origin.x + round((visibleFrame.width - panelSize.width) / 2)
            let topOffset = max(72.0, min(140.0, visibleFrame.height * 0.14))
            y = visibleFrame.maxY - topOffset - panelSize.height
        }

        panel.setFrame(NSRect(x: x, y: y, width: panelSize.width, height: panelSize.height), display: false)
    }

    private func persistCurrentPosition() {
        guard let screen = panel.screen else { return }
        let visibleFrame = screen.visibleFrame
        let frame = panel.frame

        var positions = loadStoredPositions()
        positions[screenIdentifier(for: screen)] = StoredPosition(
            offsetX: frame.origin.x - visibleFrame.origin.x,
            offsetY: frame.origin.y - visibleFrame.origin.y
        )
        saveStoredPositions(positions)
    }

    private func loadStoredPositions() -> [String: StoredPosition] {
        guard
            let data = UserDefaults.standard.data(forKey: positionStoreKey),
            let positions = try? JSONDecoder().decode([String: StoredPosition].self, from: data)
        else {
            return [:]
        }

        return positions
    }

    private func saveStoredPositions(_ positions: [String: StoredPosition]) {
        guard let data = try? JSONEncoder().encode(positions) else { return }
        UserDefaults.standard.set(data, forKey: positionStoreKey)
    }

    private func screenIdentifier(for screen: NSScreen) -> String {
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        if let number = screen.deviceDescription[key] as? NSNumber {
            return number.stringValue
        }
        return screen.localizedName
    }

    private struct StoredPosition: Codable {
        let offsetX: CGFloat
        let offsetY: CGFloat
    }
}
