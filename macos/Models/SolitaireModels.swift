import Foundation

public enum StackState: String, Codable, CaseIterable {
    case active
    case pinned
    case deferred
    case archived
}

public struct SolitaireCard: Identifiable, Codable, Hashable {
    public let id: String
    public var title: String
    public var topic: String
    public var summary: String
    public var timestamp: Date
    public var state: StackState
    public var interactionCount: Int
    public var labels: [String]

    public init(
        id: String = UUID().uuidString,
        title: String,
        topic: String,
        summary: String,
        timestamp: Date = .now,
        state: StackState = .active,
        interactionCount: Int = 1,
        labels: [String] = []
    ) {
        self.id = id
        self.title = title
        self.topic = topic
        self.summary = summary
        self.timestamp = timestamp
        self.state = state
        self.interactionCount = interactionCount
        self.labels = labels
    }
}

public struct SolitaireStack: Identifiable, Codable, Hashable {
    public let id: String
    public var topic: String
    public var cards: [SolitaireCard]
    public var state: StackState

    public init(
        id: String = UUID().uuidString,
        topic: String,
        cards: [SolitaireCard],
        state: StackState = .active
    ) {
        self.id = id
        self.topic = topic
        self.cards = cards
        self.state = state
    }

    public var isComplete: Bool {
        state == .archived
    }
}
