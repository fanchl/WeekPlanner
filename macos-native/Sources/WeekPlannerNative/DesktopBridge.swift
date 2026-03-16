import AppKit
import Foundation
import UniformTypeIdentifiers
import WebKit

@MainActor
final class DesktopBridge: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    private enum MessageName {
        static let desktopBridge = "desktopBridge"
    }

    private static let injectedBridgeScript = """
    (() => {
      const handlers = window.webkit && window.webkit.messageHandlers;
      if (!handlers || !handlers.desktopBridge) {
        return;
      }

      const pending = new Map();
      const quickAddListeners = new Set();
      let nextRequestId = 1;

      const invoke = (type, payload) =>
        new Promise((resolve, reject) => {
          const requestId = nextRequestId++;
          pending.set(requestId, { resolve, reject });
          handlers.desktopBridge.postMessage({ type, requestId, payload: payload ?? null });
        });

      window.__desktopBridgeResolve = (requestId, payload) => {
        const entry = pending.get(requestId);
        if (!entry) return;
        pending.delete(requestId);
        entry.resolve(payload);
      };

      window.__desktopBridgeReject = (requestId, message) => {
        const entry = pending.get(requestId);
        if (!entry) return;
        pending.delete(requestId);
        entry.reject(new Error(message || "Native bridge error"));
      };

      window.desktopBridge = {
        isDesktop: true,
        openMarkdownFile: () => invoke("openMarkdownFile"),
        writeMarkdownFile: (filePath, content) => invoke("writeMarkdownFile", { filePath, content }),
        saveMarkdownAs: (defaultName, content) => invoke("saveMarkdownAs", { defaultName, content }),
        onQuickAdd: (callback) => {
          quickAddListeners.add(callback);
          return () => quickAddListeners.delete(callback);
        },
        __emitQuickAdd: (payload) => {
          quickAddListeners.forEach((listener) => {
            try {
              listener(payload);
            } catch (_error) {}
          });
        }
      };
    })();
    """

    weak var presentingWindow: NSWindow?

    private weak var webView: WKWebView?
    private var pendingQuickAddTexts: [String] = []
    private(set) var isReady = false

    func configure(_ userContentController: WKUserContentController) {
        let script = WKUserScript(
            source: Self.injectedBridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        userContentController.addUserScript(script)
        userContentController.add(self, name: MessageName.desktopBridge)
    }

    func attach(webView: WKWebView) {
        self.webView = webView
        webView.navigationDelegate = self
    }

    func emitQuickAdd(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if isReady {
            emitQuickAddImmediately(text: trimmed)
        } else {
            pendingQuickAddTexts.append(trimmed)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isReady = true
        flushPendingQuickAdds()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isReady = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isReady = false
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard
            message.name == MessageName.desktopBridge,
            let body = message.body as? [String: Any],
            let type = body["type"] as? String,
            let requestID = body["requestId"] as? Int
        else {
            return
        }

        let payload = body["payload"] as? [String: Any]

        switch type {
        case "openMarkdownFile":
            handleOpenMarkdownFile(requestID: requestID)
        case "writeMarkdownFile":
            handleWriteMarkdownFile(payload: payload, requestID: requestID)
        case "saveMarkdownAs":
            handleSaveMarkdownAs(payload: payload, requestID: requestID)
        default:
            reject(requestID: requestID, message: "Unsupported bridge call: \(type)")
        }
    }

    private func handleOpenMarkdownFile(requestID: Int) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText, .plainText]
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let url = panel.url else {
            resolve(requestID: requestID, payload: nil)
            return
        }

        do {
            let content = try String(contentsOf: url, encoding: .utf8)
            resolve(
                requestID: requestID,
                payload: [
                    "filePath": url.path,
                    "name": url.lastPathComponent,
                    "content": content
                ]
            )
        } catch {
            reject(requestID: requestID, message: "Failed to read markdown file: \(error.localizedDescription)")
        }
    }

    private func handleWriteMarkdownFile(payload: [String: Any]?, requestID: Int) {
        guard let filePath = payload?["filePath"] as? String else {
            reject(requestID: requestID, message: "Missing filePath")
            return
        }

        let content = payload?["content"] as? String ?? ""
        let url = URL(fileURLWithPath: filePath)

        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try content.write(to: url, atomically: true, encoding: .utf8)
            resolve(requestID: requestID, payload: ["ok": true])
        } catch {
            reject(requestID: requestID, message: "Failed to write markdown file: \(error.localizedDescription)")
        }
    }

    private func handleSaveMarkdownAs(payload: [String: Any]?, requestID: Int) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText, .plainText]
        panel.nameFieldStringValue = (payload?["defaultName"] as? String) ?? "weekplanner.md"

        guard panel.runModal() == .OK, let url = panel.url else {
            resolve(requestID: requestID, payload: nil)
            return
        }

        let content = payload?["content"] as? String ?? ""

        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try content.write(to: url, atomically: true, encoding: .utf8)
            resolve(
                requestID: requestID,
                payload: [
                    "filePath": url.path,
                    "name": url.lastPathComponent
                ]
            )
        } catch {
            reject(requestID: requestID, message: "Failed to save markdown file: \(error.localizedDescription)")
        }
    }

    private func flushPendingQuickAdds() {
        guard !pendingQuickAddTexts.isEmpty else { return }
        let texts = pendingQuickAddTexts
        pendingQuickAddTexts.removeAll()
        texts.forEach { emitQuickAddImmediately(text: $0) }
    }

    private func emitQuickAddImmediately(text: String) {
        guard let webView else {
            pendingQuickAddTexts.append(text)
            return
        }

        let payload = ["text": text]
        guard let payloadJSON = jsonLiteral(from: payload) else { return }

        let script = "window.desktopBridge && window.desktopBridge.__emitQuickAdd(\(payloadJSON));"
        webView.evaluateJavaScript(script)
    }

    private func resolve(requestID: Int, payload: Any?) {
        guard let webView else { return }
        let value = jsonLiteral(from: payload) ?? "null"
        let script = "window.__desktopBridgeResolve(\(requestID), \(value));"
        webView.evaluateJavaScript(script)
    }

    private func reject(requestID: Int, message: String) {
        guard let webView else { return }
        let escapedMessage = jsonLiteral(from: message) ?? "\"Native bridge error\""
        let script = "window.__desktopBridgeReject(\(requestID), \(escapedMessage));"
        webView.evaluateJavaScript(script)
    }

    private func jsonLiteral(from value: Any?) -> String? {
        guard let value else { return "null" }
        guard JSONSerialization.isValidJSONObject(value) || value is String || value is NSNumber || value is NSNull else {
            return nil
        }

        if let string = value as? String {
            guard let data = try? JSONSerialization.data(withJSONObject: [string], options: []) else { return nil }
            guard let json = String(data: data, encoding: .utf8) else { return nil }
            return String(json.dropFirst().dropLast())
        }

        if let number = value as? NSNumber {
            return number.stringValue
        }

        if value is NSNull {
            return "null"
        }

        guard let data = try? JSONSerialization.data(withJSONObject: value, options: []) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
