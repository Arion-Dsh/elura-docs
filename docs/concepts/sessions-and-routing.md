# Sessions and routing

Elura separates an account identity from a live transport session and from the
World node that currently owns game work.

## Identity

An authenticated identity contains:

| Field | Purpose |
| --- | --- |
| `account_id` | Stable account principal |
| `region_id` | Geographic or infrastructure partition |
| `realm_id` | Game realm/server partition |
| `user_id` | Player or character principal |
| `generation` | Account version used for revocation |

The application login service authenticates credentials, resolves the account,
selects region and realm, and calls `TicketService::issue_login`. The resulting
login ticket is short-lived and single-use. Every ticket carries an explicit
`purpose` of `login` or `reconnect`; the Gateway verifies issuer, audience,
signature, purpose, lifetime, identity, and replay state before binding that
identity to a session.

`TicketService` has separate lifetimes for the two purposes. The generated
Gateway defaults are 60 seconds for `login_ttl` and 30 minutes for
`reconnect_ttl`. Both must be positive and no greater than one hour.

## Session lifecycle

A session moves through transport, authentication, active, draining, and closed
states. The Gateway enforces an authentication deadline before allowing
application routes. Heartbeats maintain liveness, and idle sessions are closed
after `idle_timeout`.

Ticket expiry does not close an already authenticated session. On every
successful authentication, the Gateway returns a fresh reconnect ticket and
its `expires_in_seconds` value. The client retains only that latest ticket.

While connected, the client renews near expiry by sending the current reconnect
ticket to route `3`. Renewal consumes the current ticket and returns its
replacement. After a disconnect, the client opens a new connection and sends
the latest reconnect ticket to authentication route `1`; successful
authentication consumes it and returns the next reconnect ticket.

If the reconnect ticket is unavailable or expired, the client asks the
application login service for a new login ticket using an application-owned
refresh session. Elura owns Gateway ticket validation and rotation. The upper
application owns refresh tokens, device sessions, credential reauthentication,
and the decision to show login UI. Sequence numbers help the runtime reason
about delivered traffic around a disconnect; retry timing, state reconciliation,
and UI behavior remain client policy.

## Login queue and capacity

The upper application owns login queue ordering, priority, queue tokens,
position and ETA, and client polling or notification. Queued clients should not
hold anonymous Gateway connections; the login service issues a short-lived
login ticket only after granting an authentication attempt.

Gateway enforces the final per-Region/per-Realm authenticated-Session limit by
atomically applying duplicate-login policy, checking capacity, and registering
the lease through `OnlineDirectory::acquire`. A full Realm returns retryable
`REALM_FULL` with `retry_after_ms` without consuming the login ticket. See the
[online presence API](/adapters/online#login-queue-and-realm-capacity).

## Duplicate login

The online directory associates a player key with Gateway/session leases.
`AllowMultiple` retains every Session, `RejectNew` rejects a new Session while
one is active, and `KickExisting` admits the new Session and closes the old one.
Distributed `KickExisting` requires both a shared `OnlineDirectory` and a
`SessionControlTransport`; configuring only one is rejected.

Use lease settings where:

```text
0 < renew_interval < lease_ttl
```

A typical generated distributed configuration uses a 45-second lease and a
15-second renewal interval.

## Presence and lifecycle observers

`OnlineDirectory` is the authoritative source for live Session leases.
`OnlineStatsReader` reports both authenticated Session count and player count
deduplicated by `user_id`. A complete Adapter implements `OnlineBackend`, the
automatic combination of both contracts.

Gateway also exposes `SessionObserver` with `Connected`, `Authenticated`, and
`Closed` transitions. `Closed` retains the authenticated identity, but it
describes one Session—not necessarily the player's final Session. Applications
should enqueue the event, query `user_sessions`, and mark the player offline
only when no live Session remains.

Observer delivery is process-local and best effort. A Gateway process that
terminates abruptly cannot emit `Closed`; leases still expire through TTL.
Durable application projections therefore need reconciliation against the
online directory. See the [online presence API](/adapters/online).

## Account generation

The identity generation supports revocation across active or reconnecting
sessions. An `AccountVersionStore` can hold a minimum accepted generation. An
operator can raise that value through the admin API, causing older identities
to be rejected or logged out according to the configured session path.

## World routing

Gateway routing keys include region, realm, and route. Discovery supplies a set
of live `WorldRouteTarget` values for each key; the Gateway maintains a private
connection pool to selected targets.

Route `0` is useful as a default target set. Applications may advertise more
specific route IDs when different World groups own different business domains.

## Ownership and sharding

For stateful workloads, an `OwnershipResolver` maps a player to a shard and an
assigned World instance. Ownership metadata contains a shard ID, World ID, and
epoch. The epoch prevents stale owners from accepting work after a rebalance.

Discovery answers “which instances can serve this route?” while ownership
answers “which instance currently owns this player’s state?” Keep those two
decisions distinct.
