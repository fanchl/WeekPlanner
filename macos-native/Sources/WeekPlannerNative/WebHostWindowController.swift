import AppKit
import Foundation
import WebKit

@MainActor
final class WebHostWindowController: NSWindowController {
    private let bridge: DesktopBridge
    private let webView: WKWebView

    init(bridge: DesktopBridge) {
        self.bridge = bridge

        let userContentController = WKUserContentController()
        bridge.configure(userContentController)

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController

        self.webView = WKWebView(frame: .zero, configuration: configuration)
        self.webView.setValue(false, forKey: "drawsBackground")

        let window = NSWindow(
            contentRect: NSRect(x: 120, y: 80, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "WeekPlanner"
        window.minSize = NSSize(width: 1100, height: 760)
        window.isReleasedWhenClosed = false

        super.init(window: window)

        bridge.attach(webView: webView)
        window.contentViewController = makeContentViewController()
        loadPlanner()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func makeContentViewController() -> NSViewController {
        let contentViewController = NSViewController()
        let rootView = NSView()
        rootView.wantsLayer = true
        rootView.layer?.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.05, blue: 0.07, alpha: 1.0).cgColor
        rootView.translatesAutoresizingMaskIntoConstraints = false

        webView.translatesAutoresizingMaskIntoConstraints = false
        rootView.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            webView.topAnchor.constraint(equalTo: rootView.topAnchor),
            webView.bottomAnchor.constraint(equalTo: rootView.bottomAnchor)
        ])

        contentViewController.view = rootView
        return contentViewController
    }

    private func loadPlanner() {
        guard let indexURL = resolveIndexURL() else {
            webView.loadHTMLString(
                """
                <html>
                  <body style="margin:40px;font-family:-apple-system;background:#11131a;color:#f5f5f5;">
                    <h1>WeekPlanner</h1>
                    <p>未找到前端构建产物。</p>
                    <p>先在仓库根目录执行 <code>npm run build</code>，然后重新运行 <code>swift run</code>。</p>
                  </body>
                </html>
                """,
                baseURL: nil
            )
            return
        }

        let directoryURL = indexURL.deletingLastPathComponent()
        webView.loadFileURL(indexURL, allowingReadAccessTo: directoryURL)
    }

    private func resolveIndexURL() -> URL? {
        let fileManager = FileManager.default
        let currentDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath)
        let bundleResourceDirectory = Bundle.main.resourceURL?.appendingPathComponent("build", isDirectory: true)

        let candidateDirectories: [URL] = [
            bundleResourceDirectory,
            ProcessInfo.processInfo.environment["WEEKPLANNER_WEB_ROOT"].map(URL.init(fileURLWithPath:)),
            currentDirectory.appendingPathComponent("../build", isDirectory: true),
            currentDirectory.appendingPathComponent("build", isDirectory: true)
        ].compactMap { $0 }

        for directory in candidateDirectories {
            let indexURL = directory.appendingPathComponent("index.html")
            if fileManager.fileExists(atPath: indexURL.path) {
                return indexURL
            }
        }

        return nil
    }
}
