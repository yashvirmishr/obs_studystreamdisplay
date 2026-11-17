"""Event engine package.

The wire format for every event is the normalised envelope defined in
`shared/event-schemas/event-envelope.v1.json` (ARCHITECTURE invariant 6):
integration adapters convert provider payloads into envelopes, and widgets
only ever consume envelopes. These constants mirror that schema so Python
code never repeats the strings inline; keep them in sync with the schema
file, which is the source of truth.
"""

from __future__ import annotations

ENVELOPE_SCHEMA_VERSION: int = 1

#: Every legal `event_type` value in the v1 envelope.
EVENT_TYPES: frozenset[str] = frozenset(
    {
        "chat.message",
        "chat.deleted",
        "chat.moderation",
        "stream.follow",
        "stream.cheer",
        "stream.subscription",
        "stream.gift_subscription",
        "stream.raid",
        "stream.gift",
        "donation.tip",
        "study.session.started",
        "study.session.paused",
        "study.session.stopped",
        "media.now_playing.updated",
        "system.connection.changed",
        "system.test_event",
    }
)

#: Every legal `source` value in the v1 envelope.
EVENT_SOURCES: frozenset[str] = frozenset(
    {"twitch", "kick", "youtube", "streamelements", "study", "system", "test"}
)

#: Integration providers that can feed the event engine.
INTEGRATION_PROVIDERS: frozenset[str] = frozenset(
    {"twitch", "kick", "streamelements", "youtube"}
)

#: Lifecycle states of an `Integration` connection.
INTEGRATION_STATUSES: frozenset[str] = frozenset(
    {"disconnected", "connecting", "connected", "error"}
)

#: Lifecycle states of a `StudySession`.
STUDY_SESSION_STATES: frozenset[str] = frozenset({"idle", "running", "paused", "completed"})
