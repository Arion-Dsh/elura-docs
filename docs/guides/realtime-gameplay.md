# Realtime gameplay

Elura provides bounded, transport-independent primitives for authoritative
multiplayer simulation. They cover Tick synchronization, redundant input,
fixed-step timing, rooms, AOI, per-observer replication, client prediction and
interpolation, predicted entity matching, lag compensation, and reproducible
weak-network testing.

These primitives are building blocks rather than a prebuilt game. The
application defines movement, physics, abilities, AI, collision, damage,
serialization, and presentation.

::: tip Compile-tested examples
The snippets below are extracted from
[`examples/realtime-gameplay`](https://github.com/Arion-Dsh/elura/tree/main/examples/realtime-gameplay).
Run the complete walkthrough from a source checkout:

```bash
cargo run --manifest-path examples/realtime-gameplay/Cargo.toml
```
:::

The examples use these application-defined types:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MoveInput { dx: i32 }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PlayerState { x: i32 }

fn simulate(state: &mut PlayerState, input: &MoveInput) {
    state.x += input.dx.clamp(-1, 1);
}
```

## End-to-end path

```text
Client input
  └─ Tick sync + redundant input ─▶ Gateway ─▶ World / Scene
                                                └─ fixed simulation Tick
                                                   ├─ game rules
                                                   ├─ AOI visibility
                                                   ├─ lag history
                                                   └─ replication batches
                                                        ├─ Spawn / Despawn
                                                        ├─ Delta / Keyframe
                                                        └─ cumulative ACK

Client presentation
  ├─ local prediction + authoritative replay
  ├─ predicted-spawn matching
  └─ remote interpolation + adaptive jitter delay
```

Gateway and World are optional execution and networking hosts for these
primitives. `Room`, `AoiGrid`, `FixedStepClock`, netcode buffers, replication
streams, lag-compensation history, and `SimulatedLink` own no socket, Tokio task,
or persistence backend.

## Select the features

Enable only the parts used by the application:

```toml
[dependencies]
elura = { version = "0.2.7", features = [
  "room",
  "aoi",
  "simulation",
  "netcode",
  "replication",
  "lag-compensation",
] }
```

Enable `net-sim` in development and test configurations when adverse-network
simulation is required.

## Choose an execution host

| Shape | Use it when |
| --- | --- |
| Standalone primitives | A client, test, or custom executor owns timing and state |
| `SceneRuntime` | Multiple players mutate one match, map partition, or room and need one serial mailbox |
| World handler without a Scene | A command only mutates player-owned state and player-key serialization is sufficient |

Keep one logical match or map partition in one owning Scene. Store its room
state, simulation clock, AOI index, observer replication streams, and rewind
history together. Do not create a separate Scene for each primitive.

```rust
use elura::room::{Room, RoomConfig};

let mut room = Room::<_, u64, ()>::new("arena-1", RoomConfig::default())?;
room.join(1, ())?;
room.join(2, ())?;
room.set_ready(&1, true)?;
room.set_ready(&2, true)?;
room.start()?;
```

## Deliver inputs

On the client, `InputSender` assigns sequences, retains unacknowledged inputs,
and includes recent frames in later packets. On the server, keep one
`InputReceiver` per client stream. It validates target Tick bounds, accepts
reordered sequences, ignores redundant duplicates, and returns a cumulative
ACK.

Do not apply an input immediately in the network handler. Queue each newly
accepted input by target Tick and consume it from the authoritative fixed-step
simulation. This keeps network arrival timing out of deterministic game rules.

`TickSynchronizer` correlates probes and responses to estimate the current
server Tick from RTT and server processing time. It does not read a clock or
send packets by itself.

```rust
use std::time::Duration;
use elura::netcode::{
    InputReceiver, InputReceiverConfig, InputSender, InputSenderConfig,
    TickSyncConfig, TickSyncRequest, TickSyncResponse, TickSynchronizer,
};

let request = TickSyncRequest {
    sequence: 1,
    client_sent_at: Duration::ZERO,
};
let response = TickSyncResponse {
    sequence: request.sequence,
    client_sent_at: request.client_sent_at,
    server_received_at: Duration::from_millis(100),
    server_sent_at: Duration::from_millis(101),
    server_tick: 12,
};
let sample = response.sample(request, Duration::from_millis(202), 10.0)?;
let mut sync = TickSynchronizer::new(TickSyncConfig::default())?;
let target_tick = sync.observe(sample)?.recommended_input_tick;

let mut client = InputSender::new(InputSenderConfig::default())?;
client.record(target_tick, MoveInput { dx: 1 })?;
let _lost_packet = client.packet(target_tick);
client.record(target_tick + 1, MoveInput { dx: 1 })?;
let recovery_packet = client.packet(target_tick + 1);
assert_eq!(recovery_packet.inputs.len(), 2);

let mut server = InputReceiver::new(InputReceiverConfig::default())?;
let received = server.receive(target_tick + 1, recovery_packet)?;
client.acknowledge(received.acknowledgement)?;
let accepted_inputs = received.accepted;
```

## Advance the authoritative simulation

`FixedStepClock` converts elapsed wall time into a bounded number of deterministic
steps. It limits catch-up work and reports any remaining backlog. A Scene may
advance the clock from its tick hook; a standalone host may advance it from its
own loop.

During each simulation step, the application normally:

1. consumes accepted inputs for that Tick;
2. advances movement, physics, abilities, AI, and other game rules;
3. updates positions in `AoiGrid`;
4. records a compact collision/query snapshot for lag compensation;
5. builds the current visible state for each observer;
6. updates each observer's replication sender.

```rust
use std::{convert::Infallible, time::Duration};
use elura::simulation::{FixedStepClock, SimulationConfig};

let mut state = PlayerState { x: 0 };
let mut clock = FixedStepClock::new(SimulationConfig::default())?;
clock.advance::<Infallible, _>(Duration::from_millis(100), |step| {
    for frame in accepted_inputs
        .iter()
        .filter(|frame| u128::from(frame.target_tick) == step.tick)
    {
        simulate(&mut state, &frame.input);
    }
    Ok(())
})?;
```

## Turn AOI into replication

`AoiGrid` only computes visibility. It stores entity IDs and positions and
returns complete query results or `entered`/`left` deltas; it never sends
events.

Resolve visible IDs to application-owned `VersionedState` values and pass the
complete visible set to one `ReplicationSender` per observer. The sender
produces ordered:

- `Spawn` when an entity becomes visible;
- `Despawn` when it leaves visibility;
- `Update` when a delta can advance a known baseline;
- `Keyframe` when a full replacement is required.

`ReplicationReceiver` buffers reordered batches until gaps close, validates
entity versions, applies newly contiguous batches transactionally, and returns
a cumulative ACK. The application still chooses serialization, transport
routes, packet cadence, and the mapping between a connection and its observer
stream.

```rust
use std::collections::BTreeMap;
use elura::aoi::{AoiConfig, AoiGrid, Point2};
use elura::replication::{
    ReplicationConfig, ReplicationReceiver, ReplicationSender, VersionedState,
};

let mut aoi = AoiGrid::new(AoiConfig::default())?;
aoi.insert(1_u64, Point2::new(0.0, 0.0))?;
aoi.insert(2_u64, Point2::new(2.0, 0.0))?;
aoi.insert(3_u64, Point2::new(20.0, 0.0))?;

let make_state = |x| VersionedState {
    version: 1,
    prediction_key: None,
    state: PlayerState { x },
};
let states = BTreeMap::from([
    (1, make_state(0)),
    (2, make_state(2)),
    (3, make_state(20)),
]);

let mut visible = aoi.visible_to(&1, 5.0)?;
visible.push(1); // explicitly include the observer's own state
let desired = visible
    .into_iter()
    .filter_map(|id| states.get(&id).cloned().map(|state| (id, state)));

let config = ReplicationConfig::default();
let mut tx = ReplicationSender::<u64, PlayerState, i32>::new(config)?;
let mut rx = ReplicationReceiver::<u64, PlayerState, i32>::new(config)?;
tx.update(1, desired, |_, old, new| Some(new.state.x - old.state.x))?;

let applied = rx.receive(tx.packet(), |_, old, delta| {
    Some(PlayerState { x: old.x + delta })
})?;
tx.acknowledge(applied.acknowledgement)?;
assert!(rx.entity(&2).is_some());
assert!(rx.entity(&3).is_none());
```

## Predict and present on the client

`PredictionBuffer` records each local input and predicted state. When an
authoritative state arrives, reconciliation:

1. rejects a backwards authoritative Tick;
2. discards confirmed inputs;
3. restores the authoritative state;
4. replays later inputs through the application's deterministic simulation
   callback;
5. rewrites retained predicted states and returns the corrected current state.

`InterpolationBuffer` orders remote states, measures arrival jitter and late
sample pressure, adapts a bounded render delay, and returns the previous state,
next state, and blend factor. The application performs concrete position,
rotation, animation, or custom interpolation.

`PredictedEntityMatcher` associates a temporary client entity and
`PredictionKey` with an authoritative `Spawn`. Replication carries the optional
prediction key so the client can replace the temporary entity rather than
displaying a duplicate.

The generated C++, C#, and TypeScript SDKs implement the Gateway ELR2 protocol;
they do not provide an engine-specific prediction or interpolation runtime.
Non-Rust game clients must integrate equivalent client-side state and rendering
logic.

```rust
use std::time::Duration;
use elura::netcode::{
    InterpolationBuffer, InterpolationConfig, PredictedEntityConfig,
    PredictedEntityMatcher, PredictionBuffer, PredictionConfig,
    PredictionKeyGenerator,
};

// Restore the authoritative state and replay later local inputs.
let mut prediction = PredictionBuffer::new(PredictionConfig::default())?;
prediction.record(1, MoveInput { dx: 1 }, PlayerState { x: 1 })?;
prediction.record(2, MoveInput { dx: 1 }, PlayerState { x: 2 })?;
let corrected = prediction.reconcile(1, PlayerState { x: 0 }, |state, _, input| {
    simulate(state, input);
})?;
assert_eq!(corrected.corrected_state.x, 1);

// Sample two remote states; the application performs the actual blend.
let mut interpolation_config = InterpolationConfig::default();
interpolation_config.base_delay_ticks = 1.0;
interpolation_config.min_delay_ticks = 1.0;
interpolation_config.max_delay_ticks = 1.0;
let mut interpolation = InterpolationBuffer::new(interpolation_config)?;
interpolation.insert(10, PlayerState { x: 10 }, Duration::ZERO)?;
interpolation.insert(11, PlayerState { x: 20 }, Duration::from_millis(33))?;
let sample = interpolation.sample(11.5)?;
let rendered_x =
    sample.previous.x as f64
    + f64::from(sample.next.x - sample.previous.x) * sample.alpha;

// Replace a temporary local spawn when its authoritative spawn arrives.
let key = PredictionKeyGenerator::default().generate()?;
let mut matcher = PredictedEntityMatcher::new(PredictedEntityConfig::default())?;
matcher.register(key, -1_i64, 10)?;
let matched = matcher.resolve(key, 9001, 12)?.unwrap();
assert_eq!(matched.temporary_entity, -1);
assert_eq!(matched.authoritative_entity, 9001);
```

## Validate historical hits

`LagCompensationHistory` stores bounded immutable snapshots at strictly
increasing authoritative ticks. A rewind query validates future and maximum
rewind limits and lends the exact historical state to an application callback.

Store compact collision proxies rather than the complete World or player
aggregate. Run historical ray casts, overlap tests, or hit validation in the
callback, then apply validated damage to the live current Scene. Rewind queries
do not mutate the live state.

```rust
use elura::lag_compensation::{
    LagCompensationConfig, LagCompensationHistory,
};

let mut history = LagCompensationHistory::new(LagCompensationConfig::default())?;
history.record(1, PlayerState { x: 10 })?;
history.record(2, PlayerState { x: 20 })?;
history.record(3, PlayerState { x: 30 })?;

let historical_hit = history.with_rewind(2, |context, target| {
    context.rewind_ticks == 1 && target.x == 20
})?;
assert!(historical_hit);
```

## Test weak networks

`SimulatedLink` deterministically injects latency, jitter, loss, duplication,
reordering delay, bandwidth serialization, and queue pressure. The caller
supplies monotonic time and a fixed seed, so a failed scenario is reproducible.
It performs no real network I/O.

Test at least:

- one lost input packet recovered by redundancy;
- out-of-order replication held until its sequence gap closes;
- prediction correction after delayed authoritative state;
- remote interpolation under jitter and late packets;
- predicted spawn timeout and authoritative matching;
- lag-compensation requests at present, valid historical, expired, and future
  ticks;
- queue overflow and constrained bandwidth.

```rust
use std::time::Duration;
use elura::net_sim::{NetSimConfig, SendOutcome, SimulatedLink};

let mut config = NetSimConfig::default();
config.latency = Duration::from_millis(50);
let mut link = SimulatedLink::new(config)?;
link.send(Duration::ZERO, 128, "replication packet")?;
assert!(link.receive(Duration::from_millis(49))?.is_empty());
assert_eq!(link.receive(Duration::from_millis(50))?.len(), 1);

let mut loss = NetSimConfig::default();
loss.loss_rate = 1.0;
let mut lossy_link = SimulatedLink::new(loss)?;
assert_eq!(
    lossy_link.send(Duration::ZERO, 64, "input packet")?,
    SendOutcome::DroppedByLoss,
);
```

## Performance and ownership boundaries

- Prediction removes confirmed history in place and clones state only for
  replayed ticks. Keep predicted state compact.
- Interpolation and lag histories use bounded preallocated queues. Late
  interpolation insertion may shift buffered entries and should be exceptional.
- Replication reception stages only entities changed by newly contiguous
  batches; a rejected packet leaves the receiver unchanged without cloning the
  complete entity table.
- Replication sending compares the complete desired visible set for one
  observer. Partition large worlds through AOI and Scene ownership instead of
  creating one global observer stream.
- Capacities are hard memory and trust bounds. Size them from maximum replay,
  interpolation, reorder, entity, and rewind windows.

Elura does not provide game-specific movement, physics, hitboxes, skills,
inventory, quests, matchmaking, ranking, AI, map data, pathfinding, persistence
schemas, or client rendering. Those remain upper-application responsibilities.
