//
//  AppDelegate.swift
//  macOS (App)
//
//  Created by Macbook Pro on 2026/10/10.
//

import Cocoa
import WebKit

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Override point for customization after application launch.
    }

    @IBAction func openReviewDemo(_ sender: Any?) {
        let window = NSApp.mainWindow ?? NSApp.windows.first {
            $0.contentViewController is ViewController
        }
        guard let controller = window?.contentViewController as? ViewController,
              let resources = Bundle.main.resourceURL else { return }
        controller.webView.loadFileURL(resources.appendingPathComponent("demo/index.html"),
                                       allowingReadAccessTo: resources)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

}
