# Deployment

Elura ships deployment scaffolds, not a universal production platform. Treat
the generated Docker and Kubernetes files as an application-owned baseline.

## Container image

The generated multi-stage Dockerfile builds all binaries with Rust 1.97 and
copies `gateway` and `world` into a small Debian runtime image. The runtime uses
a non-root user.

Build it from the generated application root:

```bash
docker build -t elura-game:dev .
```

For production, pin the base image by digest, add supply-chain scanning, and
publish an immutable application tag.

## Docker Compose

```bash
cp .env.example .env
# Replace every placeholder in .env.
docker compose -f deploy/docker-compose.yml up
```

Compose mounts the non-secret JSON configuration read-only. It publishes the
Gateway client/admin ports and the World admin port; the World command listener
remains on the Compose network.

## Kubernetes

The generated Kustomize base includes:

- a namespace;
- Gateway and World Deployments and Services;
- a headless World Service for DNS discovery;
- a ConfigMap with non-secret runtime JSON;
- readiness, startup, and liveness probes;
- resource requests and limits;
- restrictive container security contexts;
- NetworkPolicies and a Gateway PodDisruptionBudget.

Create a private overlay rather than editing secrets into the base:

```bash
cp deploy/kubernetes/secret.example.yaml /path/to/private-overlay/secret.yaml
# Replace every placeholder, reference the base and secret, then:
kubectl apply -k /path/to/private-overlay
```

Set the application image in the overlay. Do not commit the generated example
as a real `Secret`; base64 encoding is not encryption.

## Scaling

### Gateway

Before increasing replicas:

- inject a shared ticket replay store;
- decide how online leases and duplicate login should work;
- configure cross-Gateway push and session control if required;
- ensure ingress preserves WebSocket/TCP connection behavior;
- verify graceful termination exceeds the application’s drain window.

### World

Before increasing replicas:

- confirm discovery returns every ready instance and removes terminating ones;
- decide whether handlers are stateless or require ownership/sharding;
- ensure idempotency and persistence behavior remains correct across targets;
- validate connection pool and per-connection in-flight capacity;
- use a PodDisruptionBudget appropriate for the replica count.

## Networking and security

- Expose only the Gateway client listener publicly.
- Keep World and admin listeners on private networks.
- Require admin bearer authentication for non-loopback listeners.
- Protect Gateway-to-World traffic with internal tokens, network policy, and
TLS/mTLS as required by the threat model.
- Terminate public TLS at a trusted ingress or configure Gateway server TLS.
- If Proxy Protocol is enabled, trust only the load balancer CIDRs.

## Rollouts

ELR2 carries an explicit protocol version, but application protobuf changes
still require compatibility planning. Prefer additive fields, retain route IDs,
and deploy Worlds before Gateways when a Gateway will begin sending new command
shapes. Roll out clients last unless the old server path already accepts the
new behavior.
