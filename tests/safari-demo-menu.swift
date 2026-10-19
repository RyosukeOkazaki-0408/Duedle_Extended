import Cocoa
import WebKit

// Run in a test-only app bundle with the built app's resources and copied native sources.
@MainActor
final class MenuCheck: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    let host = ViewController()
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 760))
    let item: NSMenuItem
    var window: NSWindow!
    var phase = 0
    var errors: [String] = []

    init(storyboard: URL) throws {
        let document = try XMLDocument(contentsOf: storyboard)
        guard try document.nodes(forXPath: "//menu[@systemMenu='help']/items/menuItem").count == 1,
              try document.nodes(forXPath: "//action[@selector='showHelp:']").isEmpty else {
            throw NSError(domain: "MenuCheck", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unused Help item is still present"])
        }
        let nodes = try document.nodes(forXPath: "//menu[@systemMenu='help']/items/menuItem[@title='デモを試す']/connections/action")
        guard nodes.count == 1, let action = nodes.first as? XMLElement,
              let selector = action.attribute(forName: "selector")?.stringValue,
              let target = action.attribute(forName: "target")?.stringValue,
              try document.nodes(forXPath: "//customObject[@id='\(target)' and @customClass='AppDelegate']").count == 1 else {
            throw NSError(domain: "MenuCheck", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing Help menu connection"])
        }
        item = NSMenuItem(title: "デモを試す", action: NSSelectorFromString(selector), keyEquivalent: "")
        super.init()
        item.target = delegate
        host.webView = web
        host.view = NSView(frame: web.frame)
        window = NSWindow(contentViewController: host)
        web.configuration.userContentController.add(self, name: "audit")
        web.configuration.userContentController.addUserScript(WKUserScript(source: """
        addEventListener('error', e => webkit.messageHandlers.audit.postMessage(String(e.message)), true);
        addEventListener('unhandledrejection', e => webkit.messageHandlers.audit.postMessage(String(e.reason)));
        addEventListener('securitypolicyviolation', e => webkit.messageHandlers.audit.postMessage('CSP: ' + e.violatedDirective));
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web.navigationDelegate = self
    }

    func start() {
        let resources = Bundle.main.resourceURL!
        web.loadFileURL(resources.appendingPathComponent("Base.lproj/Main.html"), allowingReadAccessTo: resources)
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { self.fail("Timed out") }
        app.run()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        errors.append(String(describing: message.body))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                if phase == 0 || phase == 2 {
                    let hidden = try await web.evaluateJavaScript("show('mac'); document.querySelector('a[href*=\"demo/index\"]').getClientRects().length === 0") as? Bool
                    guard hidden == true else { fail("Mac landing page still shows Try demo"); return }
                    phase += 1
                    guard let action = item.action, app.sendAction(action, to: item.target, from: item) else {
                        fail("Native menu action was not delivered"); return
                    }
                    return
                }
                guard web.url?.lastPathComponent == "index.html" else { fail("Menu did not navigate to demo"); return }
                var count: Int?
                for _ in 0..<80 {
                    count = try await web.evaluateJavaScript("document.querySelectorAll('#display > .assign, #display > .quiz').length") as? Int
                    if count == 4 { break }
                    try await Task.sleep(nanoseconds: 100_000_000)
                }
                guard count == 4, errors.isEmpty else { fail("Demo initialization: \(errors)"); return }
                if phase == 1 {
                    phase = 2
                    _ = try await web.evaluateJavaScript("document.querySelector('#back').click()")
                } else {
                    print("PASS: native Help menu action opens demo; back and reopen work; Mac landing page hides Try demo")
                    exit(0)
                }
            } catch { fail(String(describing: error)) }
        }
    }

    func fail(_ message: String) {
        print("FAIL: \(message)")
        exit(1)
    }
}

@main
struct MenuRunner {
    @MainActor static func main() throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        guard CommandLine.arguments.count == 2 else { fatalError("Pass the copied Main.storyboard") }
        let check = try MenuCheck(storyboard: URL(fileURLWithPath: CommandLine.arguments[1]))
        check.start()
    }
}
