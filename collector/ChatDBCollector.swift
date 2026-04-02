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
    private let storePath: String
    private let snapshotPath: String

    init(
        sourcePath: String = NSHomeDirectory() + "/Library/Messages/chat.db",
        storePath: String = NSHomeDirectory() + "/Library/Application Support/PokeSolitaire/journal.sqlite",
        snapshotPath: String = NSHomeDirectory() + "/Library/Application Support/PokeSolitaire/journal-snapshot.json"
    ) {
        self.sourcePath = sourcePath
        self.storePath = storePath
        self.snapshotPath = snapshotPath
    }

    func run() throws {
        let records = try readMessages()
        try writeSQLiteStore(records)
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

        let formatter = ISO8601DateFormatter()
        var records: [ChatRecord] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            let rowId = Int(sqlite3_column_int64(statement, 0))
            let guid = sqlite3_column_text(statement, 1).map { String(cString: $0) } ?? UUID().uuidString
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
                sentAt: formatter.string(from: sentAt),
                sender: sender,
                recipients: []
            )
            records.append(record)
        }

        return records
    }

    private func writeSQLiteStore(_ records: [ChatRecord]) throws {
        let directoryURL = URL(fileURLWithPath: storePath).deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

        var db: OpaquePointer?
        guard sqlite3_open(storePath, &db) == SQLITE_OK, let db else {
            throw NSError(domain: "ChatDBCollector", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to open local store"])
        }
        defer { sqlite3_close(db) }

        let schema = """
        CREATE TABLE IF NOT EXISTS journal_messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT,
          conversation_id TEXT,
          subject TEXT,
          text TEXT NOT NULL,
          sent_at TEXT NOT NULL,
          sender TEXT,
          recipients TEXT
        );
        DELETE FROM journal_messages;
        """

        if sqlite3_exec(db, schema, nil, nil, nil) != SQLITE_OK {
            throw NSError(domain: "ChatDBCollector", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unable to initialize local store"])
        }

        let insertSQL = """
        INSERT INTO journal_messages (id, thread_id, conversation_id, subject, text, sent_at, sender, recipients)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, insertSQL, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw NSError(domain: "ChatDBCollector", code: 5, userInfo: [NSLocalizedDescriptionKey: "Unable to prepare insert"])
        }
        defer { sqlite3_finalize(statement) }

        for record in records {
            sqlite3_bind_text(statement, 1, record.id, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 2, record.threadId ?? "", -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 3, record.conversationId ?? "", -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 4, record.subject ?? "", -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 5, record.text, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 6, record.sentAt, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 7, record.sender ?? "", -1, SQLITE_TRANSIENT)
            let recipients = (try? String(data: JSONEncoder().encode(record.recipients), encoding: .utf8)) ?? "[]"
            sqlite3_bind_text(statement, 8, recipients, -1, SQLITE_TRANSIENT)

            if sqlite3_step(statement) != SQLITE_DONE {
                throw NSError(domain: "ChatDBCollector", code: 6, userInfo: [NSLocalizedDescriptionKey: "Unable to insert journal message"])
            }
            sqlite3_reset(statement)
            sqlite3_clear_bindings(statement)
        }
    }

    private func writeSnapshot(_ records: [ChatRecord]) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(records)
        let url = URL(fileURLWithPath: snapshotPath)
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
