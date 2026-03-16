import AppKit

@MainActor
enum AppMenuBuilder {
    static func makeMainMenu(appName: String) -> NSMenu {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())

        let hideItem = NSMenuItem(title: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        hideItem.keyEquivalentModifierMask = [.command]
        appMenu.addItem(hideItem)

        let hideOthersItem = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthersItem)

        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quitItem.keyEquivalentModifierMask = [.command]
        appMenu.addItem(quitItem)

        mainMenu.addItem(appMenuItem)
        mainMenu.setSubmenu(appMenu, for: appMenuItem)

        let fileMenuItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        let closeItem = NSMenuItem(title: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        closeItem.keyEquivalentModifierMask = [.command]
        fileMenu.addItem(closeItem)
        mainMenu.addItem(fileMenuItem)
        mainMenu.setSubmenu(fileMenu, for: fileMenuItem)

        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        let minimizeItem = NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        minimizeItem.keyEquivalentModifierMask = [.command]
        windowMenu.addItem(minimizeItem)
        let windowCloseItem = NSMenuItem(title: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowCloseItem.keyEquivalentModifierMask = [.command]
        windowMenu.addItem(windowCloseItem)
        windowMenu.addItem(NSMenuItem.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        mainMenu.addItem(windowMenuItem)
        mainMenu.setSubmenu(windowMenu, for: windowMenuItem)

        NSApp.windowsMenu = windowMenu
        return mainMenu
    }
}
