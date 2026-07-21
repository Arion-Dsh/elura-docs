# Concepts

Concept pages explain how Elura fits together and why its boundaries exist.
Read them when you need to choose an architecture or understand runtime
behavior; use [Guides](/guides/) for implementation steps.

## Start here

- [Architecture](./architecture) explains the Gateway, World, application, and
  infrastructure boundaries.
- [Realtime gameplay](../guides/realtime-gameplay) explains how simulation,
  AOI, replication, prediction, interpolation, and rewind compose.
- [Sessions and routing](./sessions-and-routing) follows authentication,
  reconnects, ownership, routing, and push delivery.
- [ELR2 protocol](./protocol) describes framing, message kinds, reserved routes,
  validation, and compatibility.

The same mental model applies to a local monolith, split processes, and a
distributed deployment. Only the infrastructure implementations change.
