# Conducting Core guidance

The Conducting Core is the protected sacrament-meeting workflow. It owns the minimum meeting lifecycle, ordered program items, speakers, hymns, prayers, basic business, preparation, At-the-Stand conducting, required conducting notes, basic rendering, immutable publication snapshots, and the minimum offline experience.

Core may consume Platform services and stable shared contracts. Core must not import optional modules or depend on their tables, routes, navigation, or enablement state.

Every optional enhancement needs a Core fallback. Keep canonical meeting and program-item IDs/order stable. Preserve current route behavior, ward isolation, audit boundaries, immutable snapshots, and offline context cleanup while introducing facades.
