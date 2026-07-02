# Operations Tracking System

Two-app production tracking system for manufacturing plants KSB2, KSB6, KSB7.

- **Operator app** (port 5173) — tablet-optimised, logs setup and cycle time per job
- **Dashboard** (port 5174) — live grid of all running machines with progress bars and overdue alerts
- **API server** (port 3001) — Node.js/Express + PostgreSQL via Prisma

## Quick start (local dev)

### Prerequisites
- Node.js 22+
- PostgreSQL running, or Docker for the full stack

### 1. Install dependencies
```bash
npm install
```

### 2. Configure the server
```bash
cp server/.env.example server/.env
# Edit DATABASE_URL if your Postgres credentials differ
```

### 3. Run database migrations
```bash
cd server
npx prisma migrate dev --name init
```

### 4. Seed machines
```bash
npm run db:seed
# Edit server/scripts/seed-machines.ts to match your actual machine list
```

### 5. Import item master (optional)
```bash
npx tsx scripts/import-item-master.ts docs/sample-item-master.csv
```
See `docs/item-master-csv-format.md` for the full CSV spec.

### 6. Start everything
```bash
npm run dev
```

Opens:
- Operator app: http://localhost:5173
- Dashboard: http://localhost:5174
- API: http://localhost:3001

## Docker (full stack)

```bash
docker compose up --build
```

Then run migrations inside the server container:
```bash
docker compose exec server npx prisma migrate deploy
docker compose exec server npx tsx scripts/seed-machines.ts
```

## Repo structure

```
apps/operator/     Operator tablet app (React + Vite + Tailwind)
apps/dashboard/    Supervisor dashboard (React + Vite + Tailwind)
server/            Express API, Prisma schema, business logic
scripts/           Item master CSV import script
docs/              Specs, CSV format docs, sample data
```

## Design decisions

- **Machine-number-only auth**: There is no operator PIN or login. Physical access to the tablet is the authentication layer. Documented decision, not an oversight.
- **Toggle behavior**: Switching SETUP↔CYCLE while an activity is RUNNING or PAUSED auto-ends the current activity and starts the new type fresh.
- **5-second polling**: Dashboard polls `/api/activities/active` every 5 seconds. Progress bars animate client-side between polls using `open_interval_start` from the server. Socket.io is a drop-in upgrade if 5-second staleness proves too slow.
- **Elapsed time**: Computed from `ActivityInterval` rows — sum of closed durations plus open interval if any. Unit tested in `server/src/lib/elapsed.test.ts`.

## Running tests

```bash
npm test --workspace=server
```
