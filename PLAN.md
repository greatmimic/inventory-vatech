# VATECH Inventory — v2 Plan & Session Handoff

Working branch: `inventory-v2` (nothing committed yet)
Production Supabase project ref: `zuoqqbwzvessxepukqrb`

---

## 1. Start-of-session checklist

`.mcp.json` is already in the repo root. It is read **at session startup only**, so it
loads automatically in a new session — there is nothing to do mid-session.

### Connecting the two Supabase accounts

The inventory DB and the `travelyProject` DB live in **two separate Supabase logins**.
Order matters less than the logout between them.

1. New session in this project → approve `.mcp.json` when prompted
2. `/mcp` → sign in to **`supabase-inventory`** as the **inventory account**
   - Use a private/incognito window, or sign out of Supabase first
   - The OAuth flow silently reuses whatever Supabase session the browser already has
3. **Log out of Supabase in the browser**
4. Settings → Connectors → reconnect **Supabase** → sign in as the **Bluprint** account

Skipping step 3 grants the Bluprint connector to the inventory account. That is how this
failed the first time.

OAuth grants persist in Claude credentials, so this is a one-time setup — later sessions
come up already connected.

### Notes

- `supabase-inventory` is scoped `project_ref=zuoqqbwzvessxepukqrb&read_only=true`.
  Writes are blocked at the server, and account-level tools (`list_projects`, etc.) are
  disabled by the scoping.
- Settings → Connectors has no "Add custom connector" option on this plan — that is why
  this uses `.mcp.json` instead.
- **Developer role is not sufficient** for the Management API. An org invite would need
  Administrator, which also couples the two orgs' free-project quotas. Avoided.

### First two calls once connected

| Call | Answers |
|---|---|
| `get_advisors(type: "security")` | Which tables lack RLS policies — see §5 |
| `list_tables(verbose: true)` | Whether `inventory.quantity` is `numeric` or `text` |

---

## 2. Where the code stands

### Done — frontend ported to Vite + React

```
index.html  login.html          Vite MPA entry points
vite.config.js                  build + /api proxy to :3001
src/
  main.jsx  login.jsx  App.jsx
  api/client.js                 all 10 endpoints
  lib/format.js  lib/export.js
  hooks/useToast.jsx  useNoWheel.js
  components/  Header, SearchSection, ItemCard
  components/admin/  AdminPanel + 5 tabs, SapSearch, QtyField
  styles/global.css             838 lines, lifted intact from v1
legacy/                         original index.html + login.html, kept for diffing
```

`server.js` changed in exactly two ways: converted to ESM (Vite needs
`"type": "module"`), and it now serves `dist/` instead of `public/`. **No API routes were
touched.**

Two v1 problems fixed in the port:

- The duplicated filter/sort logic (`renderStockTable` + `getFilteredStock` each had their
  own copy) is now one `useMemo` in `StockListTab.jsx`, read by both the table and the
  download buttons.
- `SapSearch` was duplicated across two tabs via `dropId` string juggling. Now one
  component taking props.

### Verified

- Production build clean
- All five admin tabs mount and switch (confirmed in the DOM, not by screenshot)
- Login page matches the original
- Vite proxy reaches Express; unauthenticated `/api/items` returns 401, not a crash

### NOT verified — needs a login

Search, deduct, stock list data, trends, and **both download buttons** on both tabs.
All ported but untested.

### Gotchas worth remembering

- **`PORT` env var:** the preview harness exports `PORT=5173`, and `server.js` reads
  `process.env.PORT`. Express grabbed Vite's port and the proxy broke. Fixed with
  `cross-env PORT=3001` in `dev:api`. Will bite again on any host that sets `PORT`.
- **CSS depends on element IDs:** `#searchInput`, `#stockTable`, `#trendsTable`, `#toast`,
  `#adminPanel` are styled by ID, including the mobile rules that hide the description
  column. Dropping one silently unstyles that element. Worth converting to classes
  eventually, but not inside a port.

```bash
npm run dev
```

---

## 3. Testing rules — production is live

`inventory` has 506 rows, `usage_log` has 2003, and the app is **in daily use**. Do not
test mutating actions against it.

| Safe to test | Do NOT test against prod |
|---|---|
| Search, card expand | Confirm Use (deduct) |
| Stock List: filter, sort, summary | Add Stock |
| Trends: presets, date range, table | New Item |
| Both download buttons | ✕ delete on Trends |
| SAP autocomplete keyboard nav | |

The ✕ button runs `DELETE FROM usage_log WHERE sap_code = ...` — permanent, and it
destroys exactly the history feature #6 depends on.

### Dev database

**Branching is Pro-plan only** ($0.01344/branch/hour), so `create_branch` is unavailable.
The dev environment has to be a **second free project**.

- Free limit is 2 active projects per org; both orgs currently hold 1
- Put `vatech-inventory-dev` in the **inventory org** — keeps dev beside prod and leaves
  Bluprint's slot free
- Free projects pause after ~7 days idle; paused ones do not count against quota, so
  expect to resume it from the dashboard after a gap

**Status as of 2026-09-18: it does not exist, and local dev points at production.**

There is no `.env` file, and `server.js:11-12` falls back to the hardcoded prod ref
`zuoqqbwzvessxepukqrb`. So `npm run dev` is Vite :5173 → proxy → Express :3001 → **prod**.
Three things are missing, not one:

1. The `vatech-inventory-dev` project itself. (Unverifiable from here — `.mcp.json` pins
   `project_ref` to prod, which disables `list_projects`. Check the dashboard, and note a
   project created earlier may simply be paused.)
2. **Env loading.** `server.js` reads `process.env.SUPABASE_URL` correctly but nothing
   populates it — no `dotenv` dependency, no `--env-file`. Node is v24, so `--env-file`
   works natively with no new dependency:
   `cross-env PORT=3001 node --env-file=.env server.js`
3. **`.env` in `.gitignore`.** It currently lists only `node_modules` and `dist`. The repo
   is public until the Cloudflare migration, so this must land *before* the file exists.

This blocks the mutating half of phase 0: with dev pointed at prod there is currently no
way to test Confirm Use, Add Stock, New Item, or ✕ delete at all.

---

## 4. Schema as it exists today

```
inventory                          usage_log
  sap_code     text  (PK)          id           integer (PK)
  description  text                  sap_code     text
  quantity     text  <- confirmed    description  text
  type         text (IOX/EOX)        quantity     integer
                                     used_at      timestamptz
                                     used_by      text
```

Two things to fix during the phase-1 migration:

- **`inventory.quantity` is `text`.** Confirmed by `list_tables` on 2026-09-18 — not
  `numeric`, the worse of the two candidates. `usage_log.quantity` is `integer`. Text is
  wrong for a whole-unit count and it is why the frontend calls `parseInt()` on every
  quantity. Cast to `integer` in the phase-1 migration.
- **`usage_log.description` is denormalized** (copied at write time, not joined). For a
  ledger this is arguably correct — you want the description as it read at the time — but
  carry it into `stock_movements` deliberately, with a comment saying why.

---

## 5. Security finding — CONFIRMED, worse than first assessed

Resolved 2026-09-18 with reads only. The earlier note guessed "RLS is off or fully
permissive" and recorded writes as untested. Both questions are now answered.

**RLS is enabled, but neutered.** Each table carries exactly one policy:

```
"Allow all"  PERMISSIVE  roles={public}  cmd=ALL  qual=true  with_check=true
```

`cmd=ALL` with `with_check=true` covers INSERT, UPDATE and DELETE — not just reads.
`has_table_privilege` confirms `anon` holds SELECT, INSERT, UPDATE **and DELETE** on both
`inventory` and `usage_log`. **Writes are open.**

`get_advisors(type:"security")` does *not* catch this — it returned only a leaked-password
warning. The advisor flags *disabled* RLS, not RLS defeated by a permissive policy. Do not
treat a clean advisor run as evidence here.

**The exposure is live and public:**

- The repo is public — `api.github.com/repos/greatmimic/inventory-vatech` returns 200
  unauthenticated. Staying public until the Cloudflare migration (deliberate call).
- The key at `server.js:12` (`sb_publishable_gsEe31Aqu23tnpO9ysCLxA_Y_tKLBWJ`) matches the
  project's current publishable key, `disabled: false`. The legacy anon JWT is also still
  enabled. It entered history at commit `4e9255f`, so **rotation is the only way out** —
  going private later does not un-leak it, and public repos are scraped continuously.

Net: anyone who finds the repo can read all 506 parts and 2017 usage rows including
employee emails, and can run `DELETE FROM usage_log` — destroying the history #6 phase 2
depends on, far more thoroughly than the ✕ button §3 warns about.

Also unchanged: `SESSION_SECRET` has a committed fallback (`'vatech-inventory-dev-secret'`,
`server.js:13`), in that same public history. If unset in production, session cookies are
forgeable by anyone who read the repo.

### Remediation — order matters

Dropping the policy first takes production down, because `server.js` authenticates as
`anon`. One piece of good news: nothing in `src/`, `index.html` or `login.html` references
Supabase — the browser only calls `/api/*`, and `server.js` is the sole Supabase client.
So `anon` needs **no** access at all; it can be revoked outright rather than carefully
policed.

1. Move `server.js` to a secret key (`sb_secret_...`) via env var, uncommitted. Server-side
   only, bypasses RLS — keeps the app alive through step 2.
2. **Then** replace `Allow all` with deny-by-default and revoke the `anon` grants.
3. Rotate the exposed publishable key; disable the legacy anon JWT.
4. Set `SESSION_SECRET` in the environment.
5. Repo → private at the Cloudflare migration (phase 6, deferred by decision).

Steps 1–2 are no longer phase-1 housekeeping. With the repo staying public, they are the
only control standing between the open internet and a write to production.

---

## 6. The seven v2 requirements

### #5 first — it shapes #6 and the stats work

Replace `usage_log` with a single `stock_movements` table rather than adding a parallel
arrivals log.

```sql
stock_movements (
  id, sap_code,
  movement_type  'usage' | 'arrival' | 'adjustment' | 'return' | 'scrap',
  quantity       signed,
  occurred_at, recorded_by,
  ordered_at     nullable,   -- arrivals only -> this is what gives you lead time
  note
)
```

Every useful question is a net-change question, so two logs means a union on every query —
and it does not stop at two. Existing `usage_log` rows migrate in as
`movement_type='usage'`.

**Open question:** do you ever adjust stock after a physical count? That is `'adjustment'`,
and it is how shrinkage gets detected.

### #2 — Unit ↔ part mapping

```sql
units       (id, name, model_code)
unit_parts  (unit_id, sap_code, qty_per_unit)
```

Use a join table even if the data looks one-to-one — O-rings and filters are almost
certainly shared across units. **Add unit filtering, do not replace search**; users have
muscle memory for typing SAP codes.

**Open question:** is `qty_per_unit` meaningful? Useful for #6 only if you track how many
units are in service.

### #3 — Firmware / drivers / software

```sql
software_assets (
  id, unit_id,
  category    'firmware' | 'driver' | 'software' | 'utility',
  name, version, release_date, file_url, notes,
  is_current  boolean
)
```

Keep version history from day one — "what firmware was this on before the update broke it"
is a question you will get. **Put it on the unit detail view, not a sixth top-level tab**,
with a flat global search as a secondary path.

**Open question:** do you host the files, or only record version numbers? `file_url` only
matters for the former.

### #4 — Location map

**Store structured location codes as the source of truth**, whatever the file contains.
Codes survive a warehouse reorganization; pixel coordinates rot the moment a shelf moves
and you find out when a tech is standing in the wrong aisle. Render a schematic grid from
the codes, or overlay on an image later as a presentation layer.

Mini-window: hover a part row, popover shows the code with its cell highlighted in a small
grid.

**Open question:** does the file contain aisle/rack/shelf codes, or x/y coordinates on a
floor plan? If there is an image, it is needed too.

### #6 — Thresholds, in two phases

**Phase 1 — static.** Add `min_threshold` and `reorder_qty` to `inventory`, import the
current numbers, surface low-stock warnings. Immediate value, no algorithm.

**Phase 2 — suggestions**, after ~3 months of arrival data:

```
avg_daily_usage = usage in window / days in window
lead_time_days  = avg(occurred_at - ordered_at) across arrivals
safety_stock    = Z * sigma(daily usage) * sqrt(lead_time_days)
reorder_point   = (avg_daily_usage * lead_time_days) + safety_stock
```

Z = service level: 1.65 for 95%, 2.33 for 99%. Use 99% for parts that ground a unit.

Two rules to hold firmly:

- **Suggest, never auto-apply.** Show the computed value beside the current one with an
  accept button. One anomalous month otherwise ratchets reorder points up silently.
- **Guard against thin data.** A part used three times a year breaks the averaging; sigma
  is meaningless at n=3. Emit nothing below ~10 movements *and* 90 days — show
  "insufficient history" and leave it to judgment.

**Open question:** do parts share suppliers? If so lead time belongs on the supplier, and
you get usable estimates far sooner by pooling.

### #1 and #7 — one export engine, two consumers

Current exports emit an HTML table labelled `.xls`. That format cannot hold multiple
sheets, which is why the trends export stacks three sections into one grid with spacer
rows.

**Use ExcelJS** (SheetJS's free edition is weak on styling) behind a shared builder:

```js
buildWorkbook([
  { name: 'Usage by user',   columns, rows },
  { name: 'Totals & stock',  columns, rows },
  { name: 'Transaction log', columns, rows },
])
```

Every download button composes sheets; the monthly report (#1) is one more template on the
same builder. The three stacked sections become three real tabs.

**Open question on #1, the important one:** the monthly report is currently built by hand.
Does any column involve judgment or manual entry, or is all of it derivable from logged
data? If there is judgment in it, the generator should produce a pre-filled starting point
that is still edited — not pretend to be final.

---

## 7. Build order

| Phase | Work | Blocked by |
|---|---|---|
| 0 | **Verify the v2 port** — log in, exercise the read-only paths | credentials |
| 1 | `stock_movements` + migration, **arrivals logging**, units, thresholds, RLS, `SESSION_SECRET` | Excel files |
| 2 | Port remaining UI, unit filtering | phase 1 |
| 3 | Software panel, map + mini-window, stats dashboard | phase 2 |
| 4 | ExcelJS module, monthly report, multi-tab exports | phase 2 |
| 5 | Threshold suggestions | ~3 months of phase-1 data |
| 6 | Hono + Cloudflare Workers migration, stateless cookie auth | before deploy |

Two deliberate choices:

- **Arrivals logging sits in phase 1, ahead of the UI that shows it.** Production currently
  logs nothing on stock-add (`server.js:132`), so every day is lead-time data that cannot
  be backfilled, and phase 5 cannot start until the clock has been running.
- **The Workers migration is last** because deployment is not urgent. Vercel was ruled out:
  its Hobby plan is non-commercial only and explicitly counts a paid employee's work as
  commercial. Cloudflare Workers has no such restriction, 100k req/day free, and no
  cold-start spin-down. `express-session`'s in-memory store must become a stateless signed
  cookie for any serverless host — Supabase auth already returns a JWT that
  `server.js:59` currently discards.

---

## 8. Files still needed

| # | File | Must answer |
|---|---|---|
| 1 | Monthly usage report | Exact layout. Formatting-exact or content-only? Formulas or values? |
| 2 | Unit ↔ part numbers | Can one part belong to multiple units? |
| 3 | Firmware / drivers | What varies per unit vs globally. Version history or current only? |
| 4 | Part locations | Location codes, or x/y on a floor plan? Image needed if the latter |
| 6 | Current thresholds | Per-part only, or shared supplier/lead time? |
