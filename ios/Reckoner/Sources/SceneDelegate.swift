import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let controller = WebViewController()
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = UIColor(named: "LaunchBackground") ?? UIColor.systemBackground
        window.rootViewController = controller
        self.window = window
        window.makeKeyAndVisible()

        // the app was started by opening a sheet file
        if let url = connectionOptions.urlContexts.first?.url {
            controller.openFile(at: url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        (window?.rootViewController as? WebViewController)?.openFile(at: url)
    }
}
