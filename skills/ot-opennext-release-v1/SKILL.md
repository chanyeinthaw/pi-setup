---
name: ot-opennext-release-v1
description: Set up and verify branch-free AWS SST deployments with GitHub Actions OIDC, staging on main, and production from GitHub Releases.
disable-model-invocation: true
compatibility: Requires git, GitHub CLI, AWS CLI, Node.js, pnpm, SST, Prisma, and MariaDB.
---

# AWS SST release

Set up reusable CI/CD for an SST application:

```text
pull request -> existing CI only
merge to main -> migrate and deploy staging
GitHub Release -> migrate and deploy production
```

Production is branch-free. A release deploys its immutable tag instead of a deployment branch.

## Inputs

Before changing anything, derive these from the repository and authenticated tools. Ask only for values that cannot be discovered safely:

- GitHub repository and default branch
- AWS profile, account, and region
- SST application name and stage names
- staging and production URLs
- migration command and database names
- Aurora cluster connection limit
- desired stable/prerelease tag policy

Treat database resets, seeds, merges, releases, and production deployments as separate destructive or consequential actions. Obtain explicit user approval for each unless the invocation explicitly requests it.

## 1. Inspect

1. Read repository instructions.
2. Inspect:
   - `.github/workflows/`
   - `sst.config.*`
   - `package.json`
   - migration configuration
   - environment examples and deployment documentation
3. Run:

```bash
git remote -v
git branch --show-current
git status --short
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef,url
AWS_PROFILE=<profile> aws sts get-caller-identity
```

4. Identify existing deployment systems. Replace obsolete deployment workflows rather than leaving two systems active.
5. Inspect the SST infrastructure and application database adapter for VPC attachment, Aurora networking, Lambda concurrency, and pool settings.
6. Preserve the repository's CI checks. Do not add tests unless the user requests them.

Completion: repository, AWS account, stages, databases, URLs, migration command, current workflows, and current database networking and connection limits are known.

## 2. Configure application networking

Keep application Lambdas outside the VPC. Give Aurora public network access so the Lambdas and GitHub Actions can connect directly.

The SST infrastructure must have:

- no Lambda VPC attachment
- no NAT gateway
- no bastion host
- an Aurora DB subnet group using public subnets with internet gateway routes
- public accessibility enabled on Aurora instances
- a security group rule that permits MariaDB traffic on the configured port
- encrypted database connections and credentials stored in Secrets Manager or GitHub Environment secrets

A non-VPC Lambda has no stable egress IP. The Aurora security group therefore cannot restrict ingress to a fixed Lambda address. If direct public access requires broad ingress, call this out in the implementation and completion report. Keep the rule limited to the database port, require TLS, use separate least-privilege database users, and use strong rotated credentials.

Staging and production share one Aurora cluster but use separate databases. Never infer one stage's database name from the other.

Completion: Lambdas have no VPC configuration, the stack creates no NAT or bastion resources, and both deployment workflows can reach the public Aurora endpoint.

## 3. Configure database connection budget

Use small, on-demand MariaDB pools and cap Lambda concurrency:

| Stage | Pool size per Lambda | Reserved concurrency | Maximum pooled connections |
|---|---:|---:|---:|
| Staging | 2 | 3 | 6 |
| Production | 3 | 25 | 75 |
| **Total ceiling** | | | **81** |
| **Aurora reserve** | | | **~9** |

Configure the Prisma MariaDB adapter:

```ts
const connectionLimit = process.env.APP_ENV === 'production' ? 3 : 2

const adapter = new PrismaMariaDb({
  // ...
  connectionLimit,
  acquireTimeout: 5_000,
  idleTimeout: 60,
})
```

Configure Lambda reserved concurrency in SST:

```ts
concurrency: {
  reserved: stage === 'production' ? 25 : 3,
}
```

Set `APP_ENV` explicitly for each stage. Do not derive production behavior from an absent or loosely matched value.

Pools open connections on demand, so 81 is a ceiling rather than the normal connection count. Verify Aurora's effective connection limit leaves about 9 connections beyond this ceiling for migrations, administration, and database overhead. Include every Lambda function that creates this pool in the budget. If more functions use it, divide the same budget across them instead of silently increasing the ceiling.

Completion: pool limits, timeouts, stage environment, and reserved concurrency match the table, and the Aurora limit has enough reserve.

## 4. Configure AWS OIDC

Create the GitHub Actions OIDC provider if absent:

```text
https://token.actions.githubusercontent.com
Audience: sts.amazonaws.com
```

Create separate staging and production roles. Restrict each trust policy to the repository and matching GitHub Environment:

```text
repo:OWNER/REPOSITORY:environment:staging
repo:OWNER/REPOSITORY:environment:production
```

Use `sts:AssumeRoleWithWebIdentity` and audience `sts.amazonaws.com`.

SST often needs broad permissions because it manages IAM, Lambda, CloudFront, S3, Route 53, ACM, SQS, DynamoDB, SSM, CloudWatch, and networking resources. `AdministratorAccess` is acceptable for initial enablement when the user agrees; report it clearly and recommend later least-privilege tightening.

Never create permanent AWS access keys for GitHub Actions.

Completion: both roles exist, their trust subjects are exact, and required policies are attached.

## 5. Configure GitHub Environments

Create `staging` and `production` GitHub Environments. Configure environment variables:

```text
AWS_DEPLOY_ROLE_ARN
AWS_REGION
APP_ENV
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DEPLOY_URL
```

Configure this environment secret:

```text
DATABASE_PASSWORD
```

Prefer retrieving the password directly from AWS Secrets Manager. Do not print it. Do not store a full `DATABASE_URL`; construct it only inside the migration step and URL-encode the password.

Remove variables and secrets used only by the obsolete deployment system after verifying the new values.

Check deployment branch policies. `main` must be allowed for staging. Production tag patterns must match the release policy, commonly `v*`.

Completion: list variable names and secret names for both environments without revealing secret values.

## 6. Add database readiness probe

Aurora Serverless v2 at `0 ACU` wakes on connection. Add a small Node CLI such as `scripts/wait-for-database.mjs` that:

1. Requires `DATABASE_URL`.
2. Connects with `mysql2/promise` and a finite timeout.
3. Runs `SELECT 1`.
4. Closes every connection.
5. Retries with bounded attempts and delay.
6. Exits nonzero after the final failure.

The workflow sequence is:

```text
construct DATABASE_URL
-> SELECT 1 readiness loop
-> run migration once
-> SST deploy
-> HTTP smoke check
```

Do not retry the whole migration command to wake the database.

Ensure migration configuration loads `.env` only when `DATABASE_URL` is absent, so CI does not require a repository `.env` file.

Completion: readiness succeeds locally when tested against an approved database, and migration configuration accepts an injected URL.

## 7. Staging workflow

Create or replace `.github/workflows/staging.yml`.

Final trigger:

```yaml
on:
  push:
    branches:
      - main
```

Use:

```yaml
permissions:
  contents: read
  id-token: write
```

Use the `staging` GitHub Environment. In one serialized deployment job:

1. Check out the triggering commit.
2. Set up pnpm and the repository's Node version.
3. Authenticate with `aws-actions/configure-aws-credentials` and `AWS_DEPLOY_ROLE_ARN`.
4. Install with the frozen lockfile.
5. Construct `DATABASE_URL` from environment values.
6. Run the readiness probe.
7. Run the repository migration command.
8. Run `pnpm sst deploy --stage staging` or the repository equivalent.
9. Smoke-check `DEPLOY_URL` with redirects, timeout, and bounded retries.

Use staging concurrency. Cancellation is acceptable for superseded staging commits, but keep migration and deployment in one job.

### Temporary PR verification

Only when the user explicitly requests end-to-end testing before merge, temporarily add:

```yaml
pull_request:
  branches: [main]
  types: [opened, reopened, synchronize]
```

GitHub Environment protection evaluates PR runs as `refs/pull/<number>/merge`, not only the head branch. Temporarily allow the required PR merge ref in the staging Environment. Watch the run until green.

Before merge:

1. Remove the temporary `pull_request` trigger.
2. Update workflow tests.
3. Push and wait for normal PR CI to pass.
4. Remove temporary PR deployment branch policies after they are no longer needed.

Completion: the committed final workflow deploys staging only from pushes to `main`.

## 8. Production workflow

Create `.github/workflows/production.yml` triggered by:

```yaml
on:
  release:
    types: [published]
```

Use non-cancelling production concurrency and the `production` GitHub Environment.

Check out `github.event.release.tag_name`, validate it, then use the same readiness, migration, SST deployment, and smoke-check sequence for production.

Recommended accepted tags:

```text
vMAJOR.MINOR.PATCH
vMAJOR.MINOR.PATCH-PRERELEASE
```

Examples:

```text
v1.2.3
v0.0.0-rc.1
v0.0.0-blah-blah-blah
```

Use an existing repository tag validator when available. State whether GitHub prereleases deploy production; do not infer this silently.

Completion: the production workflow deploys an immutable release tag and has no production branch dependency.

## 9. Validate through a PR

Create a branch from current `origin/main`. If `main` changes, rebase before final push. Never force-push without `--force-with-lease`.

Run repository-required checks plus focused workflow tests. At minimum:

```bash
pnpm run formatcheck
pnpm run lint
pnpm run typecheck
git diff --check
```

Open a PR. Use:

```bash
gh pr checks <number> --watch --interval 10
```

When a check fails:

1. Read failed logs with `gh run view <run-id> --log-failed`.
2. If a job has no steps, inspect check-run annotations through `gh api` for Environment rejection details.
3. Fix, push, and keep watching until every required check is green.

Do not merge while a deployment or required check is pending or failed.

## 10. Merge and release

When explicitly requested:

1. Confirm final staging trigger is push-to-main only.
2. Squash-merge the PR and delete its branch.
3. Find the new `main` staging run and watch it to completion.
4. Confirm migration, SST deployment, and smoke check passed.
5. Create the requested GitHub Release from current `main`.
6. Find and watch the production release run to completion.
7. Report release URL, workflow URLs, deployed URLs, and results.

Do not create a release until the post-merge staging deployment is green.

## Database reset and seed guardrails

Database reset is never an implicit CI/CD setup step. If migration history changed and the user explicitly requests reset:

1. Verify exact database names.
2. Drop and recreate only those databases.
3. Apply committed migrations from scratch.
4. Verify migration count, table count, and user count.
5. Do not seed production.
6. Seed staging only after explicit instruction, and verify the target from `DATABASE_URL` before running the seed command.

Never print credentials. Never derive a production reset target from an unverified URL.

## Completion report

Report:

- AWS OIDC provider and role ARNs
- GitHub Environment variable and secret names
- workflow paths and triggers
- Aurora public-access configuration and the resulting ingress exposure
- confirmation that Lambdas use no VPC, NAT gateway, or bastion
- pool sizes, Lambda reserved concurrency, 81-connection ceiling, and Aurora reserve
- readiness and migration behavior
- PR and release URLs
- staging and production run results
- deployed URLs
- database reset/seed actions, if any
- remaining broad IAM permissions or temporary policies to clean up
