//
//  ViewController.swift
//  Shared (App)
//
//  Created by Macbook Pro on 2026/10/10.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "app.duedle.safari.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        self.webView.scrollView.isScrollEnabled = true
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                if let error = error {
                    let nativeError = error as NSError
                    NSLog("Duedle: extension state failed for %@: %@ (%ld), %@",
                          extensionBundleIdentifier, nativeError.domain, nativeError.code,
                          nativeError.localizedDescription)
                }
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }
            }
        }
#endif
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
#if os(macOS)
        guard message.body as? String == "open-preferences" else {
            return
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if let error = error {
                    self.showPreferencesError(error)
                    return
                }
                NSApp.terminate(self)
            }
        }
#endif
    }

#if os(macOS)
    private func showPreferencesError(_ error: Error) {
        let nativeError = error as NSError
        NSLog("Duedle: opening Safari extension settings failed for %@: %@ (%ld), %@",
              extensionBundleIdentifier, nativeError.domain, nativeError.code,
              nativeError.localizedDescription)

        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Safariの機能拡張設定を開けませんでした"
        alert.informativeText = "Safariを開き、「設定」→「機能拡張」でDuedleを選択してください。\n\n"
            + "エラー: \(nativeError.domain) (\(nativeError.code))\n"
            + nativeError.localizedDescription
        alert.addButton(withTitle: "閉じる")
        if let window = self.view.window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }
#endif

}
