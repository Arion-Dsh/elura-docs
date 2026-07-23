# 实时游戏开发

Elura 提供一组有界、与传输无关的权威多人游戏原语，包括 Tick 对齐、输入冗余、
固定步长模拟、房间、AOI、按观察者状态同步、客户端预测与插值、预测实体匹配、
延迟补偿，以及可复现的弱网测试。

这些能力是构建模块，不是一套预制游戏。移动、物理、技能、AI、碰撞、伤害、
序列化和表现仍由应用实现。

::: tip 已通过编译测试的示例
下方代码片段提取自
[`examples/realtime-gameplay`](https://github.com/Arion-Dsh/elura/tree/main/examples/realtime-gameplay)。
在源码仓库中可直接运行完整流程：

```bash
cargo run --manifest-path examples/realtime-gameplay/Cargo.toml
```
:::

后续示例共用以下应用层类型：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MoveInput { dx: i32 }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PlayerState { x: i32 }

fn simulate(state: &mut PlayerState, input: &MoveInput) {
    state.x += input.dx.clamp(-1, 1);
}
```

## 端到端链路

```text
客户端输入
  └─ Tick 对齐 + 输入冗余 ─▶ Gateway ─▶ World / Scene
                                          └─ 固定模拟 Tick
                                             ├─ 游戏规则
                                             ├─ AOI 可见性
                                             ├─ 倒带历史
                                             └─ 状态同步批次
                                                  ├─ Spawn / Despawn
                                                  ├─ Delta / Keyframe
                                                  └─ 累计 ACK

客户端表现
  ├─ 本地预测 + 权威状态回放纠正
  ├─ 预测生成实体匹配
  └─ 远端实体插值 + 自适应抖动延迟
```

Gateway 与 World 只是这些原语可选的执行和网络宿主。`Room`、`AoiGrid`、
`FixedStepClock`、Netcode Buffer、Replication Stream、Lag compensation 历史和
`SimulatedLink` 本身都不持有 Socket、Tokio Task 或持久化 Backend。

## 选择 Feature

只启用应用实际需要的模块：

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

需要弱网模拟时，在开发和测试配置中额外启用 `net-sim`。

## 选择执行宿主

| 形态 | 适用情况 |
| --- | --- |
| 脱离运行时单独使用 | 客户端、测试或自定义 Executor 自行管理时间和状态 |
| `SceneRuntime` | 多个玩家共同修改一个比赛、地图分片或房间，需要一个串行邮箱 |
| 不使用 Scene 的 World Handler | 命令只修改玩家自有状态，玩家 Key 串行化已经足够 |

一个逻辑比赛或地图分片应只有一个所有者 Scene。把房间状态、模拟时钟、AOI 索引、
各观察者同步流和倒带历史放在一起；不要为每个原语分别创建 Scene。

```rust
use elura::room::{Room, RoomConfig};

let mut room = Room::<_, u64, ()>::new("arena-1", RoomConfig::default())?;
room.join(1, ())?;
room.join(2, ())?;
room.set_ready(&1, true)?;
room.set_ready(&2, true)?;
room.start()?;
```

## 投递输入

客户端的 `InputSender` 分配序列号、保留未确认输入，并在后续 Packet 中重复最近
输入。服务端为每条客户端输入流保存一个 `InputReceiver`；它负责检查目标 Tick
边界、接受乱序序列、忽略冗余重复输入，并返回累计 ACK。

不要在网络 Handler 中立刻执行输入。应按目标 Tick 暂存新接受的输入，再由权威
固定步长模拟消费，避免把网络到达时间带进确定性游戏规则。

`TickSynchronizer` 通过关联 Probe 和 Response，结合 RTT 与服务端处理时间估算
当前服务端 Tick。它本身不读取时钟，也不发送 Packet。

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

## 推进权威模拟

`FixedStepClock` 把经过的墙钟时间转换为数量有界的确定性 Step，限制单次追赶工作，
并报告剩余积压。Scene 可以从 Tick Hook 推进它；独立宿主也可以从自己的循环推进。

每个模拟 Step 中，应用通常按以下顺序执行：

1. 消费目标 Tick 对应的已接受输入；
2. 推进移动、物理、技能、AI 等游戏规则；
3. 更新 `AoiGrid` 中的实体位置；
4. 为延迟补偿记录精简的碰撞/查询快照；
5. 构建每个观察者当前可见的实体状态；
6. 更新每个观察者的 Replication Sender。

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

## 把 AOI 转换为状态同步

`AoiGrid` 只计算可见性。它保存实体 ID 和位置，返回完整查询结果或
`entered`/`left` 差集，从不直接发送事件。

应用把可见 ID 解析成自有的 `VersionedState`，再把完整可见集合交给每个观察者
独立的 `ReplicationSender`。Sender 会生成有序事件：

- 实体进入视野时生成 `Spawn`；
- 实体离开视野时生成 `Despawn`；
- 已知基线可用增量推进时生成 `Update`；
- 需要完整替换时生成 `Keyframe`。

`ReplicationReceiver` 会缓存乱序批次直到缺口补齐，检查实体版本，以事务方式应用
新连续批次并返回累计 ACK。序列化、传输路由、发包频率，以及连接与观察者同步流
之间的映射仍由应用决定。

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
visible.push(1); // 显式加入观察者自身状态
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

## 客户端预测与表现

`PredictionBuffer` 记录每个本地输入和预测状态。权威状态到达后，纠正过程会：

1. 拒绝倒退的权威 Tick；
2. 删除已经确认的输入；
3. 恢复权威状态；
4. 通过应用提供的确定性模拟回调重放后续输入；
5. 重写保留的预测状态，并返回纠正后的当前状态。

`InterpolationBuffer` 按 Tick 排列远端状态，测量到达抖动和迟到压力，自动调整有界
渲染延迟，并返回前一状态、后一状态和混合系数。具体位置、旋转、动画或自定义插值
由应用完成。

`PredictedEntityMatcher` 使用 `PredictionKey` 把客户端临时实体与权威 `Spawn`
关联起来。Replication 会携带可选 Prediction Key，客户端可以替换临时实体，而不是
显示两个实体。

生成的 C++、C# 和 TypeScript SDK 只实现 Gateway ELR2 协议，不包含引擎相关的预测
或插值运行时。非 Rust 客户端需要接入等价的客户端状态管理和表现逻辑。

```rust
use std::time::Duration;
use elura::netcode::{
    InterpolationBuffer, InterpolationConfig, PredictedEntityConfig,
    PredictedEntityMatcher, PredictionBuffer, PredictionConfig,
    PredictionKeyGenerator,
};

// 恢复权威状态并重放它之后的本地输入。
let mut prediction = PredictionBuffer::new(PredictionConfig::default())?;
prediction.record(1, MoveInput { dx: 1 }, PlayerState { x: 1 })?;
prediction.record(2, MoveInput { dx: 1 }, PlayerState { x: 2 })?;
let corrected = prediction.reconcile(1, PlayerState { x: 0 }, |state, _, input| {
    simulate(state, input);
})?;
assert_eq!(corrected.corrected_state.x, 1);

// 取得远端实体的前后状态，实际混合由应用执行。
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

// 权威 Spawn 到达后替换本地临时实体。
let key = PredictionKeyGenerator::default().generate()?;
let mut matcher = PredictedEntityMatcher::new(PredictedEntityConfig::default())?;
matcher.register(key, -1_i64, 10)?;
let matched = matcher.resolve(key, 9001, 12)?.unwrap();
assert_eq!(matched.temporary_entity, -1);
assert_eq!(matched.authoritative_entity, 9001);
```

## 历史命中判定

`LagCompensationHistory` 按严格递增的权威 Tick 保存有界只读快照。倒带查询会检查
未来 Tick 和最大回退窗口，并把精确 Tick 的历史状态借给应用回调。

应保存精简碰撞代理，而不是完整 World 或玩家聚合状态。在回调中执行历史射线、
重叠或命中检查，再把验证后的伤害应用到当前实时 Scene。倒带查询不会修改实时状态。

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

## 测试弱网

`SimulatedLink` 可以确定性注入延迟、抖动、丢包、重复、乱序延迟、带宽串行化和
队列压力。调用者提供单调时间和固定 Seed，因此失败场景可以复现；它不会执行真实
网络 I/O。

至少测试：

- 一个输入 Packet 丢失后由冗余输入恢复；
- 乱序同步批次等待序列缺口补齐；
- 延迟权威状态触发预测纠正；
- 抖动和迟到 Packet 下的远端插值；
- 预测实体超时与权威实体匹配；
- 当前、有效历史、过期和未来 Tick 的延迟补偿请求；
- 队列溢出与受限带宽。

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

## 性能与职责边界

- 预测纠正原地删除已确认历史，只为需要重放的 Tick 克隆状态，因此预测状态应保持
  精简。
- 插值和倒带历史使用有界预分配队列。正常最新状态写入不产生逐 Tick 树节点分配；
  迟到插入可能移动缓存条目，应当是少数情况。
- Replication Receiver 只暂存新连续批次实际修改的实体。Packet 被拒绝时，接收端
  状态保持不变，也不会复制整张实体表。
- Replication Sender 会比较一个观察者的完整期望可见集合。大型世界应通过 AOI 和
  Scene 所有权分区，不要创建包含全服实体的单一观察者同步流。
- 各项 Capacity 是内存与信任边界，应根据最大重放、插值、乱序、实体和倒带窗口
  设定。

Elura 不提供游戏特定的移动、物理、Hitbox、技能、背包、任务、匹配、排位、AI、
地图数据、寻路、持久化 Schema 或客户端渲染，这些仍属于上层应用。
