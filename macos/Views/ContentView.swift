import SwiftUI

struct ContentView: View {
    @State private var selectedStackID: SolitaireStack.ID?

    private let stacks: [SolitaireStack] = [
        SolitaireStack(
            topic: "Travel receipts",
            cards: [
                SolitaireCard(title: "Delta confirmation", topic: "Travel receipts", summary: "Flight confirmation + seat swap note.", state: .active, interactionCount: 3, labels: ["flight", "receipt"]),
                SolitaireCard(title: "Hotel check-in", topic: "Travel receipts", summary: "Arrival details and room key timing.", state: .active, interactionCount: 2, labels: ["hotel"])
            ],
            state: .active
        ),
        SolitaireStack(
            topic: "Archived finance",
            cards: [
                SolitaireCard(title: "Expense thread", topic: "Archived finance", summary: "Receipt sync completed and tucked away.", state: .archived, interactionCount: 5, labels: ["finance", "done"])
            ],
            state: .archived
        )
    ]

    private var selectedStack: SolitaireStack? {
        if let selectedStackID {
            return stacks.first(where: { $0.id == selectedStackID })
        }
        return stacks.first
    }

    var body: some View {
        NavigationSplitView {
            List(stacks, selection: $selectedStackID) { stack in
                VStack(alignment: .leading, spacing: 4) {
                    Text(stack.topic)
                        .font(.headline)
                    Text("(stack.cards.count) cards")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            .navigationTitle("Solitaire")
        } detail: {
            if let selectedStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header(for: selectedStack)
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(selectedStack.cards) { card in
                                CardTileView(card: card)
                            }
                        }
                    }
                    .padding(24)
                }
            } else {
                ContentUnavailableView("No stack selected", systemImage: "rectangle.3.group", description: Text("Pick a topic and deal the cards."))
            }
        }
    }

    @ViewBuilder
    private func header(for stack: SolitaireStack) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(stack.topic)
                .font(.largeTitle.weight(.semibold))
            Text(stack.isComplete ? "Archived stack" : "Live stack — still in play")
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    ContentView()
}
