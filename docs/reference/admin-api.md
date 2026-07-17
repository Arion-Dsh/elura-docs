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
| `GET /elura/healthz` | No | `204` |
| `GET /elura/readyz` | No | `204`, or `503` plus reason |
| `GET /elura/version` | No | Version/component JSON |
| `GET /elura/metrics` | Protected | Prometheus text |
| `GET /elura/debug/stats` | Protected | Runtime stats JSON |
| `GET /elura/debug/backend` | Protected | Gateway protection JSON or `404` |
| `GET /elura/debug/routes` | Protected | World route JSON or `404` |

## Force logout

`POST /elura/admin/sessions/force-logout`

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

`POST /elura/admin/sessions/revoke-account-version`

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

`PUT /elura/admin/admission/user-bans`

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
DELETE /elura/admin/admission/user-bans/{region_id}/{realm_id}/{user_id}
```

## IP bans

`PUT /elura/admin/admission/ip-bans/{ip}`

```json
{
  "ttl_ms": 600000,
  "reason": "connection flood"
}
```

Remove it with `DELETE /elura/admin/admission/ip-bans/{ip}`.

## Maintenance mode

`PUT /elura/admin/admission/maintenance`

```json
{
  "ttl_ms": 900000,
  "reason": "database maintenance"
}
```

Clear it with `DELETE /elura/admin/admission/maintenance`.

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
