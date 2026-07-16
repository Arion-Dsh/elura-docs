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

The login service issues a short-lived ticket with these claims. The Gateway
verifies issuer, audience, signature, expiry, and replay state before making the
identity available to a session.

## Session lifecycle

A session moves through transport, authentication, active, draining, and closed
states. The Gateway enforces an authentication deadline before allowing
application routes. Heartbeats maintain liveness, and idle sessions are closed
after `idle_timeout`.

Reconnect tickets let a client re-establish a session without replaying the
original login flow. Sequence numbers help the runtime reason about delivered
traffic around a disconnect. The exact client policy—retry timing, state
reconciliation, and UI behavior—belongs to the game client.

## Duplicate login

The online directory associates a player key with a Gateway/session lease.
Available policies include allowing a new session to replace an old lease or
kicking the existing session. Distributed `kick_existing` requires both a
shared `OnlineDirectory` and a `SessionControlTransport`; configuring only one
is rejected.

Use lease settings where:

```text
0 < renew_interval < lease_ttl
```

A typical generated distributed configuration uses a 45-second lease and a
15-second renewal interval.

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
