import UIKit
import WebKit

/// Passes the page's messages on without keeping the controller alive. The web view holds on to
/// its message handler, so handing it the controller itself would tie the two together for good.
private final class MessageRelay: NSObject, WKScriptMessageHandler {

    weak var target: WKScriptMessageHandler?

    init(target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// The whole interface is the web app in Web/index.html, shown edge to edge in a web view.
/// This controller gives it the things a web page cannot do for itself on an iPhone:
/// a file to keep the sheets in, the share sheet, haptics, and room for the keyboard.
final class WebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UIScrollViewDelegate {

    private let store = StateStore()
    private var webView: WKWebView!
    private var bottomConstraint: NSLayoutConstraint!

    private var pageReady = false
    private var pendingImport: (name: String, data: Data)?

    private var pageShown = false
    private var shownBy = "nothing yet"
    private var loadCount = 0
    private var loadStarted = Date()
    private var readyAfter: TimeInterval?
    private var sentInsets: UIEdgeInsets?

    private let selfTesting = ProcessInfo.processInfo.arguments.contains("-selftest")
    private var selfTestWritten = false

    private let lightTap = UIImpactFeedbackGenerator(style: .light)
    private let mediumTap = UIImpactFeedbackGenerator(style: .medium)
    private let selectionTick = UISelectionFeedbackGenerator()
    private let notice = UINotificationFeedbackGenerator()

    // MARK: - Set-up

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(named: "LaunchBackground") ?? UIColor.systemBackground

        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(MessageRelay(target: self), name: "reckoner")

        let web = WKWebView(frame: view.bounds, configuration: configuration)
        web.translatesAutoresizingMaskIntoConstraints = false
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = UIColor.clear
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false

        // The page lays itself out to fill the screen and scrolls its own lists,
        // so the web view as a whole must never scroll, bounce or leave gaps at the edges.
        let scroll = web.scrollView
        scroll.backgroundColor = UIColor.clear
        scroll.isScrollEnabled = false
        scroll.bounces = false
        scroll.showsVerticalScrollIndicator = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.delegate = self

        view.addSubview(web)
        bottomConstraint = web.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomConstraint
        ])
        webView = web

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillChangeFrame(_:)),
                           name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                           name: UIResponder.keyboardWillHideNotification, object: nil)

        loadApp()
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return .portrait
    }

    /// The web app's files travel in a folder called Web inside the app.
    private func bundledFile(_ name: String, _ fileExtension: String) -> URL? {
        return Bundle.main.url(forResource: name, withExtension: fileExtension, subdirectory: "Web")
            ?? Bundle.main.url(forResource: name, withExtension: fileExtension)
    }

    private func loadApp() {
        guard let page = bundledFile("index", "html") else {
            showProblem("The app's pages are missing from this build.")
            return
        }
        pageReady = false
        sentInsets = nil
        hidePageUntilReady()
        installBootScript()
        webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    }

    // MARK: - First appearance

    // The page stays out of sight until it has laid itself out with the right margins, and then
    // fades in over the launch colour. Normally it reports that it is ready while it loads. If it
    // has loaded without doing so, or will not load at all, it is shown anyway.

    private func hidePageUntilReady() {
        loadCount += 1
        loadStarted = Date()
        readyAfter = nil
        pageShown = false
        webView.alpha = 0
        showPageRegardless(after: 12, by: "long wait")
    }

    private func showPageRegardless(after seconds: TimeInterval, by cause: String) {
        let thisLoad = loadCount
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self = self, self.loadCount == thisLoad else { return }
            self.showPage(by: cause)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        showPageRegardless(after: 1, by: "loaded without ready")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showPage(by: "failed load")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showPage(by: "failed load")
    }

    private func showPage(by cause: String) {
        guard !pageShown else { return }
        pageShown = true
        shownBy = cause
        UIView.animate(withDuration: 0.2, delay: 0.05, options: [.curveEaseOut, .allowUserInteraction], animations: {
            self.webView.alpha = 1
        }, completion: nil)
    }

    /// Tells the page how much room the status bar and the home indicator need. The page could
    /// read this from CSS, but the web view only passes it on after the first drawing, which
    /// would show for a moment with everything a little too high.
    private func sendInsets(force: Bool = false, then done: (() -> Void)? = nil) {
        guard pageReady, isViewLoaded, bottomConstraint != nil else {
            done?()
            return
        }
        var insets = view.safeAreaInsets
        // the constant is minus the keyboard's height; above the keyboard there is no home indicator
        insets.bottom = max(0, insets.bottom + bottomConstraint.constant)
        if !force, let sent = sentInsets, sent.top == insets.top, sent.bottom == insets.bottom {
            done?()
            return
        }
        sentInsets = insets
        let script = "window.reckonerSetInsets && window.reckonerSetInsets(\(Double(insets.top)), \(Double(insets.bottom))); true;"
        webView.evaluateJavaScript(script) { _, _ in
            done?()
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        sendInsets()
    }

    /// Hands the saved sheets to the page before any of its own code runs.
    private func installBootScript() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        var fields = ["platform: \"ios\""]
        if let saved = store.load() {
            // base64 uses only letters, digits, + / and =, so it is safe inside the quotes
            fields.append("state: \"" + saved.base64EncodedString() + "\"")
        }
        let source = "window.__RECKONER_NATIVE__ = { " + fields.joined(separator: ", ") + " };"
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    private func showProblem(_ text: String) {
        let label = UILabel()
        label.text = text
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = UIColor.label
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32)
        ])
    }

    // MARK: - Messages from the page

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "reckoner",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }

        switch type {
        case "ready":
            pageReady = true
            readyAfter = Date().timeIntervalSince(loadStarted)
            sendInsets(force: true) { [weak self] in
                self?.showPage(by: "ready")
            }
            deliverPendingImport()
            if selfTesting { runSelfTest() }
        case "save":
            if let json = body["json"] as? String { store.save(json) }
        case "share":
            if let name = body["filename"] as? String, let base64 = body["base64"] as? String {
                share(filename: name, base64: base64)
            }
        case "haptic":
            playHaptic(body["style"] as? String ?? "light")
        case "theme":
            applyTheme(body["mode"] as? String ?? "system")
        case "selftest":
            writeSelfTest(body)
        default:
            break
        }
    }

    // MARK: - Sharing and opening files

    private func share(filename: String, base64: String) {
        guard presentedViewController == nil, let data = Data(base64Encoded: base64) else { return }
        var safeName = filename.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        if safeName.isEmpty { safeName = "Sheet" }

        let manager = FileManager.default
        let folder = manager.temporaryDirectory.appendingPathComponent("Shared", isDirectory: true)
        try? manager.removeItem(at: folder)
        try? manager.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        let fileURL = folder.appendingPathComponent(safeName, isDirectory: false)
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            return
        }

        let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 120, width: 1, height: 1)
        }
        present(sheet, animated: true, completion: nil)
    }

    /// Called when a sheet file is opened with Reckoner from Files, Mail or the share sheet.
    func openFile(at url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        // iOS hands over a private copy in an Inbox folder inside this app; once read it is ours to remove
        let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path
        let isInboxCopy = url.resolvingSymlinksInPath().path.hasPrefix(home)
            && url.pathComponents.contains(where: { $0 == "Inbox" || $0.hasSuffix("-Inbox") })
        defer {
            if scoped { url.stopAccessingSecurityScopedResource() }
            if isInboxCopy { try? FileManager.default.removeItem(at: url) }
        }
        guard let data = try? Data(contentsOf: url), !data.isEmpty, data.count < 20_000_000 else { return }
        pendingImport = (name: url.lastPathComponent, data: data)
        deliverPendingImport()
    }

    private func deliverPendingImport() {
        guard pageReady, let item = pendingImport else { return }
        pendingImport = nil
        let script = "window.reckonerImportFile && window.reckonerImportFile(" + javaScriptString(item.name)
            + ", \"" + item.data.base64EncodedString() + "\"); true;"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    /// A string written the way JavaScript expects it, quotes included.
    private func javaScriptString(_ text: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [text], options: []),
              let json = String(data: data, encoding: .utf8),
              json.count >= 2 else { return "\"\"" }
        return String(json.dropFirst().dropLast())
    }

    // MARK: - Feel and appearance

    private func playHaptic(_ style: String) {
        switch style {
        case "select":
            selectionTick.selectionChanged()
        case "medium":
            mediumTap.impactOccurred()
        case "success":
            notice.notificationOccurred(.success)
        case "warning":
            notice.notificationOccurred(.warning)
        default:
            lightTap.impactOccurred()
        }
    }

    /// Light, dark or system: the keyboard, status bar and share sheet follow the choice made in the app.
    private func applyTheme(_ mode: String) {
        let style: UIUserInterfaceStyle
        switch mode {
        case "light":
            style = .light
        case "dark":
            style = .dark
        default:
            style = .unspecified
        }
        overrideUserInterfaceStyle = style
        view.window?.overrideUserInterfaceStyle = style
    }

    // MARK: - Keyboard

    // When the keyboard is up, the web view ends where the keyboard begins, and the page
    // lays itself out in the space that is left. Nothing has to scroll out of the way.

    @objc private func keyboardWillChangeFrame(_ notification: Notification) {
        guard let value = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue else { return }
        let keyboard = view.convert(value.cgRectValue, from: nil)
        let covered = max(0, view.bounds.maxY - keyboard.minY)
        setKeyboardHeight(covered)
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        setKeyboardHeight(0)
    }

    private func setKeyboardHeight(_ height: CGFloat) {
        guard bottomConstraint != nil, bottomConstraint.constant != -height else { return }
        bottomConstraint.constant = -height
        view.layoutIfNeeded()
        webView.scrollView.contentOffset = CGPoint.zero
        sendInsets()
    }

    // MARK: - Web view housekeeping

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        // the web view sometimes scrolls itself to reveal a focused field; put it straight back
        if scrollView.contentOffset != CGPoint.zero {
            scrollView.contentOffset = CGPoint.zero
        }
    }

    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) {
        scrollView.pinchGestureRecognizer?.isEnabled = false
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS can stop the page's process to reclaim memory; start it again from the saved sheets
        loadApp()
    }

    // MARK: - Self-test (used by the cloud build, never in normal use)

    private func runSelfTest() {
        guard let file = bundledFile("selftest", "js"),
              let source = try? String(contentsOf: file, encoding: .utf8) else {
            writeSelfTest(["type": "selftest", "passed": 0, "failed": 1, "failures": ["selftest.js is missing from the app"]])
            return
        }
        webView.evaluateJavaScript(source + "\n;true;") { [weak self] _, error in
            guard let self = self, let error = error, !self.selfTestWritten else { return }
            self.writeSelfTest(["type": "selftest", "passed": 0, "failed": 1,
                                "failures": ["the self-test could not run: " + error.localizedDescription]])
        }
    }

    private func writeSelfTest(_ result: [String: Any]) {
        guard selfTesting else { return }
        var report = result
        report["stateFileBytes"] = store.savedBytes
        report["shownBy"] = shownBy
        if let seconds = readyAfter {
            report["readyAfter"] = (seconds * 100).rounded() / 100
        }
        report["systemVersion"] = UIDevice.current.systemVersion
        report["model"] = UIDevice.current.model
        guard JSONSerialization.isValidJSONObject(report),
              let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]),
              let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        try? data.write(to: folder.appendingPathComponent("selftest.json", isDirectory: false), options: .atomic)
        selfTestWritten = true
    }
}
