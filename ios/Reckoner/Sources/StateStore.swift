import Foundation

/// Keeps every sheet in one JSON file in the app's Application Support folder.
/// That folder is part of iPhone backups, and it survives installing a newer build over this one.
/// Once a day the previous file is set aside as a spare, which is used if the main file is ever unreadable.
final class StateStore {

    private let fileURL: URL
    private let spareURL: URL

    init() {
        let manager = FileManager.default
        let base = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? manager.temporaryDirectory
        let folder = base.appendingPathComponent("Reckoner", isDirectory: true)
        try? manager.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        fileURL = folder.appendingPathComponent("state.json", isDirectory: false)
        spareURL = folder.appendingPathComponent("state-previous.json", isDirectory: false)
    }

    /// The saved sheets, or nil on first launch.
    func load() -> Data? {
        if let data = readable(fileURL) { return data }
        return readable(spareURL)
    }

    /// Replaces the file in one step, so a crash mid-write cannot leave half a file behind.
    @discardableResult
    func save(_ json: String) -> Bool {
        guard json.count > 2, let data = json.data(using: .utf8) else { return false }
        setSpareAsideIfDue()
        do {
            try data.write(to: fileURL, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    var savedBytes: Int {
        let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey])
        return values?.fileSize ?? 0
    }

    /// The file's contents if it holds a JSON object, otherwise nil.
    private func readable(_ url: URL) -> Data? {
        guard let data = try? Data(contentsOf: url), !data.isEmpty else { return nil }
        guard let object = try? JSONSerialization.jsonObject(with: data, options: []), object is [String: Any] else { return nil }
        return data
    }

    private func setSpareAsideIfDue() {
        let manager = FileManager.default
        guard readable(fileURL) != nil else { return }
        if let attributes = try? manager.attributesOfItem(atPath: spareURL.path),
           let made = attributes[.modificationDate] as? Date,
           Date().timeIntervalSince(made) < 86_400 {
            return
        }
        try? manager.removeItem(at: spareURL)
        try? manager.copyItem(at: fileURL, to: spareURL)
        try? manager.setAttributes([.modificationDate: Date()], ofItemAtPath: spareURL.path)
    }
}
