import Foundation
import SQLite3

struct ChatRecord: Codable {
    let id: String
    let threadId: String?
    let conversationId: String?
    let subject: String?
    let text: String
    let sentAt: String
    let sender: String?
    let recipients: [String]
}

final class ChatDBCollector {
    private let sourcePath: String
    private let outputPath: String

    init(sourcePath: String = NSHomeDirectory() + "/Library/Messages/chat.db",
         outputPath: String = NSHomeDirectory() + "/Library/Application Support/PokeSolitaire/journal-snapshot.json") {
        self.sourcePath = sourcePath
        self.outputPath = outputPath
    }

    func run() throws {
        let records = try readMessages()
        try writeSnapshot(records)
    }

    private func readMessages() throws -> [ChatRecord] {
        var db: OpaquePointer?
        guard sqlite3_open(sourcePath, &db) == SQLITE_OK, let db else {
            throw NSError(domain: "ChatDBCollector", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to open chat.db"])
        }
        defer { sqlite3_close(db) }

        let sql = """
        SELECT
          message.ROWID,
          message.guid,
          chat.chat_identifier,
          message.text,
          message.date,
          handle.id,
          chat.display_name
        FROM message
        LEFT JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
        LEFT JOIN chat ON chat.ROWID = chat_message_join.chat_id
        LEFT JOIN handle ON handle.ROWID = message.handle_id
        ORDER BY message.date ASC
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw NSError(domain: "ChatDBCollector", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to query chat.db"])
        }
        defer { sqlite3_finalize(statement) }

        var records: [ChatRecord] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            let rowId = Int(sqlite3_column_int64(statement, 0))
            let guid = String(cString: sqlite3_column_text(statement, 1))
            let conversationId = sqlite3_column_text(statement, 2).map { String(cString: $0) }
            let text = sqlite3_column_text(statement, 3).map { String(cString: $0) } ?? ""
            let dateRaw = sqlite3_column_double(statement, 4)
            let sender = sqlite3_column_text(statement, 5).map { String(cString: $0) }
            let subject = sqlite3_column_text(statement, 6).map { String(cString: $0) }

            let sentAt = Date(timeIntervalSinceReferenceDate: dateRaw / 1_000_000_000)
            let record = ChatRecord(
                id: "\(rowId)-\(guid)",
                threadId: conversationId,
                conversationId: conversationId,
                subject: subject,
                text: text,
                sentAt: ISO8601DateFormatter().string(from: sentAt),
                sender: sender,
                recipients: []
            )
            records.append(record)
        }

        return records
    }

    private func writeSnapshot(_ records: [ChatRecord]) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(records)
        let url = URL(fileURLWithPath: outputPath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
    }
}

@main
struct CollectorMain {
    static func main() {
        do {
            try ChatDBCollector().run()
        } catch {
            fputs("\(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
}
