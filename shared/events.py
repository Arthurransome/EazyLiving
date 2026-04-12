"""Event bus — Observer pattern.

Services publish domain events; other services (or the gateway startup handler)
subscribe to them.  This keeps services decoupled: a service publishes
"lease.activated" without knowing who cares about it.

Usage
-----
    from shared.events import bus, Event

    # subscribe (typically at application startup)
    bus.subscribe("lease.activated", my_async_handler)

    # publish (inside a service method)
    await bus.publish(Event(name="lease.activated", payload={"lease_id": str(lease.lease_id)}))
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)

# A handler is an async callable that receives an Event.
Handler = Callable[["Event"], Awaitable[None]]


@dataclass
class Event:
    """Immutable domain event.

    Attributes
    ----------
    name:
        Dot-separated event name, e.g. ``"lease.activated"``.
    payload:
        Arbitrary data associated with the event (should be JSON-serialisable).
    """

    name: str
    payload: dict = field(default_factory=dict)


class EventBus:
    """Simple in-process async event bus (Observer pattern).

    Handlers registered with ``subscribe`` are called in registration order
    when a matching event is published.  Wildcard ``"*"`` handlers receive
    every event regardless of name.

    Handlers run concurrently via ``asyncio.gather`` so a slow handler does
    not block others.  Exceptions inside handlers are caught and logged so
    a failing handler never prevents other handlers from running.
    """

    def __init__(self) -> None:
        # name → list of handlers
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def subscribe(self, event_name: str, handler: Handler) -> None:
        """Register *handler* to be called when *event_name* is published.

        Use ``"*"`` as the event name to receive all events.
        """
        self._handlers[event_name].append(handler)
        logger.debug("EventBus: subscribed %s -> %s", event_name, handler.__name__)

    async def publish(self, event: Event) -> None:
        """Publish *event* and await all registered handlers concurrently."""
        specific = list(self._handlers.get(event.name, []))
        wildcard = list(self._handlers.get("*", []))
        all_handlers = specific + wildcard

        if not all_handlers:
            logger.debug("EventBus: no handlers for '%s'", event.name)
            return

        logger.debug(
            "EventBus: publishing '%s' to %d handler(s)", event.name, len(all_handlers)
        )

        results = await asyncio.gather(
            *[self._call(h, event) for h in all_handlers],
            return_exceptions=True,
        )
        for h, result in zip(all_handlers, results):
            if isinstance(result, Exception):
                logger.error(
                    "EventBus: handler '%s' raised %s: %s",
                    h.__name__,
                    type(result).__name__,
                    result,
                )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _call(handler: Handler, event: Event) -> None:
        await handler(event)


# ---------------------------------------------------------------------------
# Singleton bus — import and use throughout the application.
# ---------------------------------------------------------------------------
bus = EventBus()


# ---------------------------------------------------------------------------
# Built-in logging handler — registered at gateway startup.
# ---------------------------------------------------------------------------
async def log_event(event: Event) -> None:
    """Simple observer that logs every published event."""
    logger.info("Event: %s | payload=%s", event.name, event.payload)
