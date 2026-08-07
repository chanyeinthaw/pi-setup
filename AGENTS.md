# Global instructions

These instructions has highest priority.

## Your boss

- My name is Chan.
- I may communicate in languages other than English, but the you MUST always respond in English.
- When I ask you to simplify your response, use ASD-STE100 Simplified Technical English.

## Pi

- Pi does not natively support subagents. If a skill or other instruction asks for subagent work, do it directly in the current session.
- Executor is code-mode MCP and API integration layer. Use it to discover and invoke configured integrations and their tools when those integrations are relevant to the task.

## Tailscale mesh and development hosts

The development machines are connected through a Tailscale mesh:

| Host      | Machine        | Primary user                                | Purpose                                                |
| --------- | -------------- | ------------------------------------------- | ------------------------------------------------------ |
| `silicon` | Linux server   | `chan` or `pinn`, depending on who connects | All development projects and shared services live here |
| `oxygen`  | Chan's MacBook | `chan`                                      | Chan's client development machine                      |
| `athena`  | Pinn's MacBook | `pinn`                                      | Pinn's client development machine                      |

- From `oxygen`, `ssh silicon` connects to `silicon` as `chan`.
- From `athena`, `ssh silicon` connects to `silicon` as `pinn`.
- Host aliases and SSH configuration resolve the correct user automatically.

Reverse access is user-specific on `silicon`:

- When operating as `chan` on `silicon`, `ssh oxygen` connects to Chan's MacBook.
- When operating as `pinn` on `silicon`, `ssh athena` connects to Pinn's MacBook.

> Chan's account can not SSH to `athena`, and Pinn's account can not SSH to `oxygen`. Prefer these host aliases rather than hard-coded Tailscale IP addresses.

## Shared development services

Shared development infrastructure runs from `/home/chan/Services`. It is for development and test data only. Prefer these services instead of starting duplicate MySQL, PostgreSQL, Redis, or MinIO instances when they fit the task.

| Service         | Endpoint                        | User/access key | Password/secret key | Default database |
| --------------- | ------------------------------- | --------------- | ------------------- | ---------------- |
| MySQL 8.4       | `mysql.app.si14.space:3306`       | `developer`     | `dev-mysql`         | `development`    |
| PostgreSQL 18.4 | `pg.app.si14.space:5432`          | `developer`     | `dev-postgres`      | `development`    |
| Redis 8         | `redis.app.si14.space:6379`       | —               | `dev-redis`         | —                |
| MinIO S3 API    | `https://minio-s3.app.si14.space` | `minioadmin`    | `minioadmin`        | —                |
| MinIO console   | `https://minio.app.si14.space`    | `minioadmin`    | `minioadmin`        | —                |

MySQL and PostgreSQL `developer` users have unrestricted development access to all current and future databases and can create databases.

Typical connection URLs:

```text
mysql://developer:dev-mysql@mysql.app.si14.space:3306/development
postgresql://developer:dev-postgres@pg.app.si14.space:5432/development
redis://:dev-redis@redis.app.si14.space:6379/0
```

For S3 clients and SDKs, always use `https://minio-s3.app.si14.space` as the endpoint. Use `https://minio.app.si14.space` only for the browser management console. The username and password above act as the S3 access key and secret key. Do not configure development clients to use a localhost MinIO endpoint because clients may run on other Tailscale-connected development machines.

Do not use these credentials in production or commit them to application files. Put connection URLs and credentials in ignored `.env` files or environment variables.

Service management: check `mise.toml` at `cd /home/chan/Services`

Friendly database/cache names and `.app.si14.space` endpoints are provided through the local/tailnet infrastructure. Test Tailscale Services with the actual protocol client rather than `tailscale ping`.

Do not delete anything under `/home/chan/Services/**/data/` unless the user explicitly requests destructive data removal and confirms it.
