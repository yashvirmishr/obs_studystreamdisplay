"""In-process event bus for the backend (ARCHITECTURE invariant 6).

Every event that flows through this backend is an envelope (see
``shared/event-schemas/event-envelope.v1.json``). Producers call
``publish``; WebSocket consumers (overlay / control sockets) hold an
``asyncio.Queue`` fed by the bus.

Design notes:
- Thread-safe publish() (any thread — e.g. sync SQLAlchemy context managers).
- Bounded queues; oldest message is dropped on overflow so a slow consumer
  can never backpressure the integrations.
- Channels are strings; "*" is a wildcard. One queue per subscription.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections import defaultdict
from typing import Any

logger = logging.getLogger("studystream2.events.bus")

MAX_QUEUE = 256

Channel = str
Envelope = dict[str, Any]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[Channel, set[asyncio.Queue[Envelope]]] = defaultdict(set)
        self._lock = threading.Lock()

    def subscribe(self, channel: Channel) -> "asyncio.Queue[Envelope]":
        """Return a fresh queue fed by `channel`. Caller must unsubscribe()."""
        q: asyncio.Queue[Envelope] = asyncio.Queue(maxsize=MAX_QUEUE)
        with self._lock:
            self._subscribers[channel].add(q)
        return q

    def unsubscribe(self, channel: Channel, q: "asyncio.Queue[Envelope]") -> None:
        with self._lock:
            subs = self._subscribers.get(channel)
            if subs:
                subs.discard(q)
                if not subs:
                    del self._subscribers[channel]

    def publish(self, channel: Channel, envelope: Envelope) -> int:
        """Fan `envelope` out to `channel` and the `*` wildcard. Returns the
        number of queues that accepted it."""
        delivered = 0
        with self._lock:
            targets = list(self._subscribers.get(channel, ())) + list(self._subscribers.get("*", ()))
        for q in targets:
            try:
                q.put_nowait(envelope)
                delivered += 1
            except asyncio.QueueFull:
                try:
                    q.get_nowait()           # drop oldest
                    q.put_nowait(envelope)    # newest wins
                    delivered += 1
                except asyncio.QueueEmpty:
                    pass
        return delivered


# Process-wide singleton. The rest of the backend imports `bus` and uses it;
# there is intentionally no class-level registry to swap at runtime.
bus = EventBus()
