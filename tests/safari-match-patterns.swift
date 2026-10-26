// Run on macOS 15.4+ with Xcode: xcrun swift tests/safari-match-patterns.swift
import Foundation
import WebKit

let manifestURL = URL(fileURLWithPath: "src/manifest.json")
let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as! [String: Any]
let scripts = manifest["content_scripts"] as! [[String: Any]]
let dashboard = scripts.first { ($0["js"] as? [String])?.contains("./storage/display/filter.js") == true }!
let patterns = try (dashboard["matches"] as! [String]).map { try WKWebExtension.MatchPattern(string: $0) }
let root = "https://cms7.ict.nitech.ac.jp/moodle40a/"
for (url, expected) in [
    (root + "course/view.php?id=1", true),
    (root + "course/view.php?section=0&id=1", true),
    (root + "course/view.php?id=1#section-2", true),
    (root + "my/", true),
    (root + "mod/assign/view.php?id=1", false),
    (root + "login/index.php", false),
    ("https://example.org/moodle40a/course/view.php?id=1", false),
] {
    precondition(patterns.contains { $0.matches(URL(string: url)!) } == expected,
                 "Unexpected Safari dashboard match: \(url)")
}
print("PASS Safari/WebKit dashboard URL matching: course, query order, fragment, dashboard and exclusions")

let demoRoot = "https://duedle-35-184-191-167.sslip.io/moodle40a/"
for page in ["my/", "course/view.php?id=6"] {
    precondition(patterns.contains { $0.matches(URL(string: demoRoot + page)!) }, "Demo dashboard is not matched")
}
precondition(!patterns.contains { $0.matches(URL(string: "https://other.sslip.io/moodle40a/my/")!) }, "Unrelated demo hosts must not be matched")
print("PASS Safari/WebKit explicit demo hostname and unrelated-host exclusion")

for (script, page) in [
    ("./storage/cs_scrapeAssign.js", "mod/assign/view.php"),
    ("./qol/assign_files.js", "mod/assign/view.php"),
    ("./storage/cs_scrapeQuiz.js", "mod/quiz/view.php"),
    ("./storage/cs_scrapeQuizReview.js", "mod/quiz/review.php"),
    ("./theme/scorm.js", "mod/scorm/player.php"),
] {
    let entry = scripts.first { ($0["js"] as? [String])?.contains(script) == true }!
    let patterns = try (entry["matches"] as! [String]).map { try WKWebExtension.MatchPattern(string: $0) }
    for query in ["?id=1", "?attempt=2&cmid=1", "?section=0&id=1#content"] {
        precondition(patterns.contains { $0.matches(URL(string: root + page + query)!) },
                     "Safari did not load \(script) for \(page + query)")
    }
    for url in [root + "login/index.php", root + "course/view.php?id=1", "https://example.org/moodle40a/" + page + "?id=1"] {
        precondition(!patterns.contains { $0.matches(URL(string: url)!) }, "Unexpected detail script match: \(url)")
    }
}
print("PASS Safari/WebKit assignment, preview, quiz and review URL matching")
