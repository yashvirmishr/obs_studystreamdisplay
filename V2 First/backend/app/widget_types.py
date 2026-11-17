"""Canonical widget-type registry shared by Overlay Studio and the overlay.

Widget rows store the registry id in ``widgets.widget_type``; human-readable
labels ride in the placement config (``label``). Keeping the mapping in one
module stops the frontend from re-deriving ids by slugifying display labels —
which produced ids that never joined the registry (e.g. "YouTube Now Playing"
slugged to "youtube_now_playing" while the registry id is "now_playing").

Adding a widget type means adding it here first; the overlay renderer keys its
component selection off ``variant`` (placement config) so legacy rows keep
rendering even before they are re-saved with canonical ids.
"""

from __future__ import annotations

import re

#: registry id -> display label shown in the studio library
WIDGET_TYPES: dict[str, str] = {
    "study_timer": "Study Timer",
    "session_history": "Session History",
    "subject_task": "Subject & Task",
    "clock": "Clock",
    "goal_ring": "Daily Goal Ring",
    "now_playing": "YouTube Now Playing",
    "unified_chat": "Unified Chat",
    "live_activity": "Live Activity",
}

#: display label -> registry id
LABEL_TO_TYPE: dict[str, str] = {label: key for key, label in WIDGET_TYPES.items()}

# Ids previously produced by slugifying display labels in the studio; kept so
# layouts saved by the buggy mapper normalise cleanly on their next save.
_LEGACY_ALIASES: dict[str, str] = {
    "study_timer": "study_timer",
    "session_history": "session_history",
    "subject_task": "subject_task",
    "clock": "clock",
    "daily_goal_ring": "goal_ring",
    "youtube_now_playing": "now_playing",
    "unified_chat": "unified_chat",
    "live_activity": "live_activity",
}


def _slug(raw: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", raw.strip().lower()))


def canonical_widget_type(raw: str) -> str:
    """Map any incoming widget_type (registry id, label, or legacy slug) to the
    canonical registry id. Unknown values pass through slugified rather than
    being rejected — the overlay renders unknown types as generic chips, so a
    future widget type keeps rendering before the registry learns about it."""
    value = (raw or "").strip()
    if value in WIDGET_TYPES:
        return value
    key = _slug(value)
    if key in LABEL_TO_TYPE:
        return LABEL_TO_TYPE[key]
    return _LEGACY_ALIASES.get(key, key)
