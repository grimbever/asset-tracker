# Asset Tracker

A multi-tenant register for equipment, tools, trailers, dosing gear, and office IT. The name is a working title. Change it in `lib/config.ts` only.

Phone, tablet, and desktop share one Next.js app. Data, sign-in, files, and row-level security are Supabase. Hosting is Vercel.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no environment variables, the home page is a setup screen and the build still succeeds.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Environment

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. Whitespace, a missing `https://` on a `*.supabase.co` host, and a trailing `/rest/v1` are cleaned up. An invalid value shows the setup screen. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preferred key (`sb_publishable_...`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy anon key. Used when the publishable key is empty. |
| `NEXT_PUBLIC_SITE_URL` | Production site origin for auth emails. Empty in the browser uses the current origin. Leave it empty on Vercel previews. |
| `SUPABASE_SERVICE_ROLE_KEY` | Not read by this version. Do not expose it to the browser. |

Step-by-step setup for Supabase and Vercel is in [docs/setup.md](docs/setup.md). Paste `supabase/setup.sql` into the Supabase SQL Editor. You do not need the Supabase CLI.

## This version

Organizations, memberships, and invites. Every tenant table has `organization_id` and row-level security. Signup creates an organization and an Admin membership. Roles and permissions are rows, not hardcoded checks. Admin, Manager, Editor, Requester, Viewer, and Kiosk are seeded. Field Tech and Auditor are seeded inactive. Plan limits are stored and not enforced.

Assets have a type, type-specific fields, photos, a location, a parent/child kit, a status, and a history timeline. Changes are written to an append-only event log. Record ids are UUIDs the app sends, so a later sync engine does not have to renumber rows. There is no offline sync.

QR labels link to `/a/<tag>` and print in the browser for Avery sheets, Brother, Dymo, and Zebra roll sizes, plus a custom size.

On a phone: scan, open the asset, check out in a few taps, check in in one tap.

**Load sample equipment** adds a trailer, an impact driver, and a PAA dosing skid (with its feed pump).

Kiosk mode, consumables, work orders, and the approval screens are not built. Their tables are in the schema so those milestones do not have to redo tenancy.

## Data access

App screens talk to Supabase through `lib/data`. Asset changes go through database functions that write the event in the same transaction.
