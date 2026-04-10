# Local pgw-web Integration Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run pgw-web locally so the TW Go BFF proxies to real API responses instead of mock fixtures.

**Architecture:** A docker-compose.yml in the TW repo provides MySQL (master+replica) and Redis. pgw-db-migration seeds the database. pgw-web runs directly via npm. The Go BFF's proxy mode (`TW_PG_MOCK=false`) forwards requests to the local pgw-web Express server.

**Tech Stack:** Docker Compose, MySQL 8.0, Redis 7, Node.js (pgw-web), Go (TW BFF)

**Related repos (all on local disk):**

- TW: `/Users/shin/Desktop/projects/tw-pg-experiment`
- pgw-web: `/Users/shin/Desktop/projects/pgw-web`
- pgw-db-migration: `/Users/shin/Desktop/projects/pgw-db-migration`

---

## File Structure

| Action | File                           | Purpose                                                   |
| ------ | ------------------------------ | --------------------------------------------------------- |
| Create | `docker-compose.yml`           | MySQL master/replica + Redis containers                   |
| Create | `docker/mysql/master.cnf`      | MySQL master config (replication)                         |
| Create | `docker/mysql/slave.cnf`       | MySQL replica config                                      |
| Create | `docker/mysql/init-replica.sh` | Post-startup script to configure master-slave replication |
| Create | `pgw-web.env.example`          | Template .env for pgw-web (no 1Password)                  |
| Modify | `.env.example`                 | Add proxy-mode config comments                            |

---

### Task 1: Create MySQL config files

**Files:**

- Create: `docker/mysql/master.cnf`
- Create: `docker/mysql/slave.cnf`

- [ ] **Step 1: Create master.cnf**

```ini
[mysqld]
default_authentication_plugin=mysql_native_password
skip-host-cache
skip-name-resolve
datadir=/var/lib/mysql
socket=/var/run/mysqld/mysqld.sock
secure-file-priv=/var/lib/mysql-files
user=mysql
server-id=1
log_bin=1
binlog_format=ROW
binlog_do_db=pgdb
pid-file=/var/run/mysqld/mysqld.pid
general_log=1
general_log_file=/var/log/mysql/query.log
local-infile
[client]
socket=/var/run/mysqld/mysqld.sock
!includedir /etc/mysql/conf.d/
local-infile
```

- [ ] **Step 2: Create slave.cnf**

```ini
[mysqld]
default_authentication_plugin=mysql_native_password
skip-host-cache
skip-name-resolve
datadir=/var/lib/mysql
socket=/var/run/mysqld/mysqld.sock
secure-file-priv=/var/lib/mysql-files
user=mysql
server-id=2
log_bin=1
binlog_do_db=pgdb
pid-file=/var/run/mysqld/mysqld.pid
general_log=1
general_log_file=/var/log/mysql/query.log
[client]
socket=/var/run/mysqld/mysqld.sock
!includedir /etc/mysql/conf.d/
```

- [ ] **Step 3: Commit**

```bash
git add docker/mysql/master.cnf docker/mysql/slave.cnf
git commit -m "chore: add MySQL master/replica config files for local pgw-web"
```

---

### Task 2: Create docker-compose.yml

**Files:**

- Create: `docker-compose.yml`
- Create: `docker/mysql/init-replica.sh`

- [ ] **Step 1: Create the init-replica.sh script**

This script runs after both MySQL containers are healthy. It configures master-slave replication (matching what pgw-db-migration's `db-up.sh` does manually).

```bash
#!/bin/sh
set -e

PASSWORD=iloveida
PASSWORD_READER=iloveidaread
MASTER_HOST=mysql-master

echo "[1/4] Creating replication user on master..."
mysql -h "$MASTER_HOST" -u root -p"$PASSWORD" -e "
  CREATE USER IF NOT EXISTS 'mydb_slave_user'@'%' IDENTIFIED BY 'mydb_slave_pwd';
  GRANT REPLICATION SLAVE ON *.* TO 'mydb_slave_user'@'%';
  FLUSH PRIVILEGES;
"

echo "[2/4] Creating read-only user on replica..."
mysql -h mysql-replica -u root -p"$PASSWORD" -e "
  CREATE USER IF NOT EXISTS 'pg-local-read'@'%' IDENTIFIED BY '$PASSWORD_READER';
  GRANT SELECT ON *.* TO 'pg-local-read'@'%';
  FLUSH PRIVILEGES;
"

echo "[3/4] Getting master binary log position..."
MASTER_STATUS=$(mysql -h "$MASTER_HOST" -u root -p"$PASSWORD" -e "SHOW MASTER STATUS\G")
CURRENT_LOG=$(echo "$MASTER_STATUS" | grep "File:" | awk '{print $2}')
CURRENT_POS=$(echo "$MASTER_STATUS" | grep "Position:" | awk '{print $2}')
echo "  Log file: $CURRENT_LOG, Position: $CURRENT_POS"

echo "[4/4] Configuring replica to follow master..."
mysql -h mysql-replica -u root -p"$PASSWORD" -e "
  STOP REPLICA;
  RESET REPLICA;
  CHANGE REPLICATION SOURCE TO
    SOURCE_HOST='$MASTER_HOST',
    SOURCE_USER='mydb_slave_user',
    SOURCE_PASSWORD='mydb_slave_pwd',
    SOURCE_LOG_FILE='$CURRENT_LOG',
    SOURCE_LOG_POS=$CURRENT_POS;
  START REPLICA;
"

echo "[Done] Replication configured. Checking status..."
mysql -h mysql-replica -u root -p"$PASSWORD" -e "SHOW REPLICA STATUS\G" | grep -E "Replica_IO_Running|Replica_SQL_Running|Seconds_Behind"
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
# Infrastructure for local pgw-web development.
# Provides MySQL (master + replica) and Redis.
#
# Usage:
#   docker compose up -d          # start containers
#   docker compose down            # stop containers
#   docker compose down -v         # stop and wipe all data

services:
  mysql-master:
    image: mysql:8.0
    platform: linux/x86_64
    container_name: pgw-mysql-master
    ports:
      - '3306:3306'
    environment:
      MYSQL_DATABASE: pgdb
      MYSQL_USER: pg-local
      MYSQL_PASSWORD: iloveida
      MYSQL_ROOT_PASSWORD: iloveida
      TZ: Asia/Singapore
    volumes:
      - mysql_master_data:/var/lib/mysql
      - ./docker/mysql/master.cnf:/etc/my.cnf
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '-u', 'root', '-piloveida']
      interval: 5s
      timeout: 5s
      retries: 30

  mysql-replica:
    image: mysql:8.0
    platform: linux/x86_64
    container_name: pgw-mysql-replica
    ports:
      - '3307:3306'
    environment:
      MYSQL_DATABASE: pgdb
      MYSQL_USER: pg-local
      MYSQL_PASSWORD: iloveida
      MYSQL_ROOT_PASSWORD: iloveida
      TZ: Asia/Singapore
    volumes:
      - mysql_replica_data:/var/lib/mysql
      - ./docker/mysql/slave.cnf:/etc/my.cnf
    depends_on:
      mysql-master:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '-u', 'root', '-piloveida']
      interval: 5s
      timeout: 5s
      retries: 30

  mysql-init:
    image: mysql:8.0
    platform: linux/x86_64
    container_name: pgw-mysql-init
    depends_on:
      mysql-master:
        condition: service_healthy
      mysql-replica:
        condition: service_healthy
    volumes:
      - ./docker/mysql/init-replica.sh:/init-replica.sh
    entrypoint: ['sh', '/init-replica.sh']
    restart: 'no'

  redis:
    image: redis:7.0.15-alpine
    container_name: pgw-redis
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data

volumes:
  mysql_master_data:
  mysql_replica_data:
  redis_data:
```

- [ ] **Step 3: Test docker compose starts**

Run: `docker compose up -d`

Expected: All 4 services start. `mysql-init` runs the replication script and exits with code 0. Verify:

```bash
docker compose ps
docker compose logs mysql-init
```

You should see "Replication configured" and `Replica_IO_Running: Yes`, `Replica_SQL_Running: Yes` in the init logs.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker/mysql/init-replica.sh
git commit -m "chore: add docker-compose for MySQL and Redis (local pgw-web)"
```

---

### Task 3: Create pgw-web .env template

**Files:**

- Create: `pgw-web.env.example`

This file lives in the TW repo as a reference. The developer copies it to `pgw-web/.env`.

- [ ] **Step 1: Create pgw-web.env.example**

This provides all env vars pgw-web needs without 1Password. External services that aren't needed get empty/dummy values. Encryption keys get placeholder strings (they just need to be non-empty for the app to start).

```bash
NODE_ENV=local

PORT=3001
BASE_URL=http://localhost:3001

# --- Database ---
DB_USE_SECURE_TRANSPORT=false
DB_CA_CERT=
DB_DATABASE=pgdb
DB_DIALECT=mysql
DB_DEBUG_LOG=false
DB_LOCAL_WRITER_CONNECTION_CONFIG='{"username":"pg-local","password":"iloveida","host":"127.0.0.1","connectionEndpoint":"127.0.0.1","port":"3306"}'
DB_LOCAL_READER_CONNECTION_CONFIG='{"username":"pg-local-read","password":"iloveidaread","host":"127.0.0.1","connectionEndpoint":"127.0.0.1","port":"3307"}'

# --- Redis ---
REDIS_URL=redis://localhost:6379
REDIS_TLS_CONNECTION_ENABLED=false

# --- Auth bypass (all true for local dev) ---
SHOULD_BYPASS_SINGPASS=true
SHOULD_BYPASS_2FA=true
BYPASS_2FA_PIN=123456
SHOULD_BYPASS_MIMS=true
SHOULD_BYPASS_MOBILE_CHECKSUM=true
SHOULD_BYPASS_TP_AZURE_AD=true
SHOULD_BYPASS_SC_API=true
SHOULD_BYPASS_SCM_API=true

# --- Session ---
SESSION_MAX_AGE=86400000
SESSION_DURATION=86400000
SESSION_EXTEND_DURATION=86400000
MOBILE_ACCESS_TOKEN_EXPIRY=1440

# --- Encryption keys (dummy values for local dev) ---
ENCRYPTION_KEY=local-dev-encryption-key-min-32chars!!
STAFF_APP_ENCRYPTION_KEY=local-dev-staff-encryption-key-32c!
HQ_SESSION_ENCRYPTION_KEY=local-dev-hq-session-encrypt-32ch!
COOKIE_SESSION_KEY=local-dev-cookie-session-key-32char
HQ_COOKIE_SESSION_KEY=local-dev-hq-cookie-key-32characters

# --- Mobile tokens (dummy RSA — not used in web flow) ---
MOBILE_SESSION_TOKEN_PRIVATE_RSA_KEY=dummy
MOBILE_SESSION_TOKEN_PUBLIC_RSA_KEY=dummy
MOBILE_SESSION_TOKEN_REFRESH_TOKEN_HASH_KEY=dummy

# --- Rate limiting (generous for local dev) ---
SCHOOL_RATE_LIMIT_MAX_REQUESTS_IN_WINDOW=10000
SCHOOL_RATE_LIMIT_WINDOW_IN_MINS=1
HQ_RATE_LIMIT_MAX_REQUESTS_IN_WINDOW=10000
HQ_RATE_LIMIT_WINDOW_IN_MINS=1

# --- OTP ---
OTP_TOKEN_EXPIRES_IN_MINS=60
OTP_MAX_RETRIES=99

# --- Misc config ---
AWS_REGION=ap-southeast-1
RUNTIME_CONFIG_CACHE_EXPIRY_IN_MINS=60
VISIBLE_MONTHS=12
MAX_PAGE_TO_LOAD=100
SCHEDULE_POST_MAX_NUM_DAYS=30
COUNT_UNREAD_BATCH_SIZE=100
APPCONFIG_POLL_INTERVAL_IN_SECS=300

# --- Push notifications (disabled — no Firebase) ---
PUSH_NOTIFICATION_TYPE=service_account
PUSH_NOTIFICATION_PROJECT_ID=
PUSH_NOTIFICATION_PRIVATE_KEY_ID=
PUSH_NOTIFICATION_SERVER_KEY=
PUSH_NOTIFICATION_PRIVATE_KEY=
PUSH_NOTIFICATION_CLIENT_EMAIL=
PUSH_NOTIFICATION_CLIENT_ID=
PUSH_NOTIFICATION_AUTH_URI=
PUSH_NOTIFICATION_TOKEN_URI=
PUSH_NOTIFICATION_AUTH_PROVIDER_X509_CERT_URL=
PUSH_NOTIFICATION_CLIENT_X509_CERT_URL=

# --- External services (disabled/empty) ---
APIGW_BASE_URL=
APIGW_VPC_ENDPOINT=
SAFE_BROWSING_API_KEY=
GOOGLE_ANALYTICS_MEASUREMENT_ID=
GOOGLE_CALENDAR_API_KEY=
GOOGLE_CALENDAR_API_KEY_BACKEND=
PLATFORM_API_BUCKET=
NOTIFICATION_RECIPIENTS_BUCKET=
MOE_APIGW_BASE_URL=
MOE_APIGW_API_KEY=
HEYTALIA_API_URL=
HEYTALIA_API_KEY=
SENDBIRD_APP_ID=
SENDBIRD_API_TOKEN=
SCM_BE_BASE_URL=
SCM_ESTL_APP_TOKEN=
SCM_FE_BASE_URL=
TP_AZURE_AD_CLOUD_INSTANCE=
TP_AZURE_AD_TENANT_ID=
TP_AZURE_AD_CLIENT_ID=
TP_AZURE_AD_CLIENT_SECRET=

# --- File service (disabled — no S3) ---
FILE_UNSAFE_BUCKET=
IMAGE_DRAFT_BUCKET=
FILE_POSTED_BUCKET=
FILE_SCHOOL_LOGO_BUCKET=
FILE_BASE_URL=
FILE_S3_SCHOOL_LOGO_BASE_URL=
FILE_S3_READ_ONLY_ACCESS_ROLE=
FILE_ATTACHMENT_PRESIGN_URL_EXPIRY_IN_MINS=60
FILE_IMAGE_PRESIGN_URL_EXPIRY_IN_MINS=60
FILE_IMAGE_PRESIGN_URL_CACHE_ROUNDING_IN_MINS=5
FILE_S3_WRITE_ONLY_ACCESS_ROLE=
FILE_JWT_SECRET=local-dev-file-jwt-secret-32chars!!
FILE_UPLOAD_PRESIGN_URL_EXPIRY_IN_SEC=300
FILE_UPLOAD_SUCESS_VERIFICATION_TOKEN_EXPIRY_IN_SEC=300
FILE_SCAN_RESULT_CHECK_TOKEN_EXPIRY_IN_SEC=300
FILE_TOKEN_EXPIRY_IN_SEC=300
FILE_S3_WRITE_ONLY_ACCESS_ROLE_CREDENTIAL_MIN_CACHE_IN_MINS=30
FILE_UPLOAD_MAX_FILE_SIZE=10485760
RESCAN_POLLING_TIMEOUT_IN_SEC=60
RESIZED_IMAGE_BASE_URL=
RESIZED_IMAGE_DRAFT_URL=
RESIZED_IMAGE_REDIRECT_URL=
NATIVE_CHECKSUM_BUCKET=

# --- WOGAA (disabled) ---
WOGAA_CSP=
WOGAA_CSP_ASSETS=
WOGAA_SCRIPT=
WOGAA_CREATE_CG_FILE_UPLOAD_TID=
WOGAA_SEARCH_FILTER_ANN_CF_TID=
WOGAA_SCHEDULE_POST_ANN_CF_TID=

# --- E2E / debug ---
SHOULD_EXPOSE_TEST_SEED_API=false
E2E_SHOULD_BYPASS_2FA=true
E2E_SHOULD_BYPASS_EMAIL=true
RESIZE_IMAGE_ALLOWED_DIMENSIONS=
```

- [ ] **Step 2: Commit**

```bash
git add pgw-web.env.example
git commit -m "chore: add pgw-web .env template for local dev without 1Password"
```

---

### Task 4: Update TW .env.example with proxy-mode config

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Add proxy-mode comments to .env.example**

Add to the `# PG (Parents Gateway) integration` section:

```bash
# PG (Parents Gateway) integration
TW_PG_MOCK=true
# TW_PG_BASE_URL=https://pg.moe.edu.sg
# TW_PG_TIMEOUT_MS=10000
#
# To use local pgw-web instead of mocks:
# TW_PG_MOCK=false
# TW_PG_BASE_URL=http://localhost:3001
# TW_PG_TIMEOUT_MS=10000
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: document proxy-mode config in .env.example"
```

---

### Task 5: Smoke test the full stack

This task has no code to write — it validates that everything works end-to-end.

- [ ] **Step 1: Start infrastructure**

```bash
cd /Users/shin/Desktop/projects/tw-pg-experiment
docker compose up -d
```

Wait for `docker compose logs mysql-init` to show replication configured.

- [ ] **Step 2: Run pgw-db-migration**

```bash
cd /Users/shin/Desktop/projects/pgw-db-migration
cp .env.example .env
npm ci
npm run db:reset
```

Expected: DB created, ~285 migrations run, seed data inserted. Look for "All seeders executed successfully" at the end.

- [ ] **Step 3: Start pgw-web**

```bash
cd /Users/shin/Desktop/projects/pgw-web
cp /Users/shin/Desktop/projects/tw-pg-experiment/pgw-web.env.example .env
npm ci
npm start
```

Expected: Express server starts on port 3001. Look for log line: `Running express server on http://localhost:3001, port 3001`.

If the server fails to start, check the error output. Common issues:

- Redis not reachable → verify `docker compose ps` shows redis running
- DB connection refused → verify MySQL containers are healthy
- Missing env var → check which var is missing and add a sensible default to `pgw-web.env.example`

- [ ] **Step 4: Test pgw-web directly**

```bash
curl -s http://localhost:3001/api/configs | head -c 200
```

Expected: JSON response (may be empty object or config data — the important thing is a 200 response, not a connection error or 500).

- [ ] **Step 5: Configure TW for proxy mode**

Create/update `.env` in the TW repo:

```bash
TW_PG_MOCK=false
TW_PG_BASE_URL=http://localhost:3001
TW_PG_TIMEOUT_MS=10000
```

- [ ] **Step 6: Start TW and test end-to-end**

```bash
cd /Users/shin/Desktop/projects/tw-pg-experiment
pnpm dev
```

Open the browser, navigate to the posts page. Verify that the API responses come from pgw-web (real data from MySQL) instead of the mock fixtures.

Check the Go BFF logs — proxy requests should show `200` responses from upstream, not `502 pg_unavailable` errors.

- [ ] **Step 7: Commit any final adjustments**

If you needed to adjust `pgw-web.env.example` during smoke testing (missing vars, wrong defaults), commit those fixes:

```bash
git add pgw-web.env.example
git commit -m "fix: adjust pgw-web env template based on smoke test"
```
