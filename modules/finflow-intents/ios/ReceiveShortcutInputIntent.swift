import AppIntents
import Foundation
import os.log

@available(iOS 16.0, *)
public struct ReceiveShortcutInputIntent: AppIntent {
    public static var title: LocalizedStringResource = "Send to FinFlow"
    public static var description = IntentDescription("Send information to FinFlow securely in the background.")

    @Parameter(title: "Text")
    public var text: String

    @Parameter(title: "Amount")
    public var amount: Double?

    @Parameter(title: "Category")
    public var category: String?

    @Parameter(title: "Timestamp")
    public var timestamp: Date?

    public init() {}

    public static var parameterSummary: some ParameterSummary {
        Summary("Send \(\\.$text) to My App") {
            \.$amount
            \.$category
            \.$timestamp
        }
    }

    public func perform() async throws -> some IntentResult {
        let id = UUID().uuidString
        let dateToSave = timestamp ?? Date()
        
        let record: [String: Any] = [
            "id": id,
            "text": text,
            "amount": amount as Any,
            "category": category as Any,
            "timestamp": ISO8601DateFormatter().string(from: dateToSave),
            "source": "shortcut"
        ]
        
        // Clean out NSNull or nil explicitly before JSON serialization
        var cleanRecord = [String: Any]()
        for (key, value) in record {
            if let v = value as? String { cleanRecord[key] = v }
            else if let v = value as? Double { cleanRecord[key] = v }
        }
        cleanRecord["source"] = "shortcut"
        cleanRecord["id"] = id
        cleanRecord["timestamp"] = ISO8601DateFormatter().string(from: dateToSave)

        try saveRecord(cleanRecord)
        
        return .result(dialog: "Saved successfully.")
    }
    
    private func saveRecord(_ record: [String: Any]) throws {
        let fileManager = FileManager.default
        guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw IntentError.documentsDirectoryNotFound
        }
        
        let fileURL = documentsURL.appendingPathComponent("shortcut_records.json")
        var records: [[String: Any]] = []
        
        if fileManager.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL),
               let existingRecords = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                records = existingRecords
            }
        }
        
        records.append(record)
        
        let newData = try JSONSerialization.data(withJSONObject: records, options: .prettyPrinted)
        try newData.write(to: fileURL, options: .atomic)
    }
}

@available(iOS 16.0, *)
public struct MyAppShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ReceiveShortcutInputIntent(),
            phrases: [
                "Send input to FinFlow",
                "Add to \(.applicationName)"
            ],
            shortTitle: "Send to FinFlow",
            systemImageName: "square.and.arrow.down"
        )
    }
}

enum IntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case documentsDirectoryNotFound

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .documentsDirectoryNotFound:
            return "Could not find documents directory."
        }
    }
}
