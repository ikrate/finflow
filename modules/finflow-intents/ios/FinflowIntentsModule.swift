import ExpoModulesCore

public class FinflowIntentsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FinflowIntents")

    AsyncFunction("getRecords") { () -> [[String: Any]] in
        let fileManager = FileManager.default
        guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return []
        }
        let fileURL = documentsURL.appendingPathComponent("shortcut_records.json")
        if let data = try? Data(contentsOf: fileURL),
           let records = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return records
        }
        return []
    }

    AsyncFunction("clearRecords") { () -> Void in
        let fileManager = FileManager.default
        guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let fileURL = documentsURL.appendingPathComponent("shortcut_records.json")
        try? fileManager.removeItem(at: fileURL)
    }

    AsyncFunction("deleteRecord") { (id: String) -> Void in
        let fileManager = FileManager.default
        guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let fileURL = documentsURL.appendingPathComponent("shortcut_records.json")
        
        if let data = try? Data(contentsOf: fileURL),
           var records = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            records.removeAll { ($0["id"] as? String) == id }
            if let newData = try? JSONSerialization.data(withJSONObject: records, options: .prettyPrinted) {
                try? newData.write(to: fileURL, options: .atomic)
            }
        }
    }
  }
}
