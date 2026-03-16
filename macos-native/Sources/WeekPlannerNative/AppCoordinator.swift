import AppKit

@MainActor
final class AppCoordinator {
    private let bridge = DesktopBridge()
    private lazy var hostWindowController = WebHostWindowController(bridge: bridge)
    private lazy var quickAddPanelController = QuickAddPanelController { [weak self] text in
        self?.bridge.emitQuickAdd(text: text)
    }
    private lazy var hotKeyManager = GlobalHotKeyManager { [weak self] in
        Task { @MainActor [weak self] in
            self?.showQuickAddPanel()
        }
    }

    func start() {
        showMainWindow()
        bridge.presentingWindow = hostWindowController.window
        hotKeyManager.register()
    }

    func showMainWindow() {
        hostWindowController.showWindow(nil)
        hostWindowController.window?.deminiaturize(nil)
        hostWindowController.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func showQuickAddPanel() {
        bridge.presentingWindow = hostWindowController.window
        quickAddPanelController.show()
    }
}
