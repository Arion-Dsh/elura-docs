# Admin HTTP API

The admin API is private and should not be exposed through the public game
ingress. Unless noted otherwise, protected endpoints accept:

```http
Authorization: Bearer <admin-token>
```

If no token is configured on a loopback listener, protected endpoints are
accessible locally without a header. A non-loopback listener cannot start
without a token.

## Diagnostics

| Method and path | Auth | Response |
| --- | --- | --- |
| `GET /healthz` | No | `204` |
| `GET /readyz` | No | `204`, or `503` plus reason |
| `GET /version` | No | Version/component JSON |
| `GET /metrics` | Protected | Prometheus text |
| `GET /debug/stats` | Protected | Runtime stats JSON |
| `GET /debug/backend` | Protected | Gateway protection JSON or `404` |
| `GET /debug/routes` | Protected | World route JSON or `404` |

## Force logout

`POST /admin/sessions/force-logout`

```json
{
  "region_id": 1,
  "realm_id": 1,
  "user_id": 42,
  "reason": "operator request"
}
```

The response contains the delivery count:

```json
{ "delivered": 1 }
```

## Revoke account generation

`POST /admin/sessions/revoke-account-version`

```json
{
  "region_id": 1,
  "realm_id": 1,
  "user_id": 42,
  "minimum_generation": 8,
  "reason": "credentials rotated"
}
```

## User bans

Create or replace a timed ban:

`PUT /admin/admission/user-bans`

```json
{
  "region_id": 1,
  "realm_id": 1,
  "user_id": 42,
  "ttl_ms": 3600000,
  "reason": "abuse"
}
```

Remove it:

```text
DELETE /admin/admission/user-bans/{region_id}/{realm_id}/{user_id}
```

## IP bans

`PUT /admin/admission/ip-bans/{ip}`

```json
{
  "ttl_ms": 600000,
  "reason": "connection flood"
}
```

Remove it with `DELETE /admin/admission/ip-bans/{ip}`.

## Maintenance mode

`PUT /admin/admission/maintenance`

```json
{
  "ttl_ms": 900000,
  "reason": "database maintenance"
}
```

Clear it with `DELETE /admin/admission/maintenance`.

## Status codes

| Status | Meaning |
| --- | --- |
| `204` | Successful mutation with no body |
| `400` | Invalid JSON/configuration, including zero `ttl_ms` |
| `401` | Missing or invalid bearer token |
| `404` | Optional Gateway/admission capability is not attached |
| `503` | Dependency unavailable, timeout, or full queue |
| `500` | Other internal failure |

All mutation endpoints are operationally sensitive. Log the authenticated
operator and reason in the upper control plane; the runtime bearer token alone
does not provide user-level audit identity.
