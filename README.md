# NFA Passbook — Mobile Web Application

An offline-first Progressive Web App for National Food Authority procurement
officers and warehouse personnel: Farmer & Master Passbook registration, QR
code issuance and scanning, seasonal delivery quota tracking, and real-time
procurement analytics — all built per the NFA Passbook PRD.

Everything runs locally in the browser using **Dexie.js (IndexedDB)** as the
primary database. There is **no mock data** — every screen reads and writes
real records you create. Cloud sync to Google Sheets (via Google Apps Script)
is an optional, fully-working add-on layered on top of the offline database.

## 1. Running the app

Because the app uses IndexedDB and the device camera (for QR scanning), it
must be served over **HTTPS or `localhost`** — not opened directly as a
`file://` path, or the browser will block those APIs.

**Fastest way to try it locally:**
```bash
cd nfa-passbook
python3 -m http.server 8080
# then open http://localhost:8080 on your computer or phone (same Wi-Fi)
```

**To deploy for real field use**, upload the whole `nfa-passbook/` folder to
any static host, for example:
- GitHub Pages
- Netlify / Vercel (drag-and-drop deploy)
- Firebase Hosting
- Your agency's own web server

Once hosted over HTTPS, officers can open it on their phone and tap
"Add to Home Screen" to install it like a native app (it's a full PWA with
offline caching via `sw.js`).

## 2. First login

Default seeded Administrator account:
- **PIN: `123456`**

Log in, then immediately go to **Settings → Users** to add real accounts and
deactivate/replace the default one for security.

## 3. What's fully working out of the box (no backend needed)

- 6-digit PIN login (SHA-256 hashed locally), session stays active until Logout
- Register Individual Farmer / Master (Farmer Organization) passbooks with
  full validation, cascading Province → Municipality dropdowns (Region V /
  Bicol dataset embedded), auto-complete memory for names/barangays
- Automatic serial control number generation (`NFA{Region}-{Branch}{YY}-{FB|MB}-{seq}`)
- Automatic seasonal quota calculation (Hectarage × 100 bags, or Admin custom
  override), with automatic Summer/Main season detection and reset
- Professionally redesigned QR code ID cards (CR80 size) with a gradient
  header, type ribbon, watermark, and serial/validity footer — printable
  directly from any Passbook
- Live camera QR scanning with a real timeout + error message if the camera
  feed stalls (falls back to manual serial/RSBSA lookup either way)
- **Condensed scan-result screen**: scanning a Passbook shows only what's
  needed in the field — identity, seasonal balance, and full **delivery
  history** — with "View Full Passbook Details" one tap away
- Delivery recording with the 8 official Palay variety codes, live
  comma-formatted bag/kilo entry, auto net-bag-equivalent calculation, and
  seasonal balance validation (blocked for Warehouse Staff, Admin override
  with required audit comment if exceeded)
- **KG / MT unit toggle** (defaults to KG) available on the Dashboard and
  every Report, applied consistently to all weight figures
- Real-time dashboard: today's totals, season target progress, provincial
  breakdown, a medal-ranked **Top Warehouse leaderboard**, 14-day trend, top
  municipalities, latest transactions stream
- **Sortable, filterable reports**: every report table's columns are
  click-to-sort (ascending/descending); the Delivery Log additionally
  supports a From/To date-range filter; Warehouse Summary shows bags **and**
  net weight (KG/MT) for Today/Month/Season
- Admin: Warehouse management, User account management (roles: **Admin** /
  **Warehouse Staff**), Region/Branch/Target configuration, season override
- A genuinely **visible** sky banner beneath the header showing the sun/moon
  actually rising and setting along a real time-of-day arc, plus vivid
  season-specific colors and icons (☀️ sunny gradient for Summer Cropping
  Season, 🌩️ stormy gradient with rain + lightning for Main Cropping Season)
- Light/Dark theme toggle (device-local preference, never overwritten by sync)

## 4. Roles

- **Admin** — full access: all Settings tabs (General, Warehouses, Users,
  Sync & Backend), quota overrides, DB repair.
- **Warehouse Staff** — Dashboard, Passbooks, Scan, Reports, and a read-only
  General settings view. Sync & Backend, Warehouses, and Users management are
  hidden — syncing still happens automatically in the background regardless
  of role, it's just not user-configurable from a Staff account.

## 5. Optional: Google Sheets cloud sync

The app works completely offline without this. If configured, **syncing is
fully automatic** — no button required:
- Immediately after every local change (a few seconds' debounce)
- Every 45 seconds in the background
- Whenever the device regains connectivity

Branch-level settings an Admin configures (region, branch, procurement
target, bag weight, season override) are pushed to Google Sheets and pulled
automatically by every Warehouse Staff device, so everyone stays in sync
without manual steps. Device-only preferences (theme, and each device's own
backend URL) are deliberately never synced.

Setup:
2. **Extensions → Apps Script**, delete the placeholder code, and paste in
   the contents of `gas/Code.gs` from this project.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or your organization only)
4. Copy the deployed Web App URL.
5. In the NFA Passbook app: **Settings → Sync & Backend**, paste the URL and
   save.
6. Tap **Trigger Database Repair Routine** once (Admin only) — this
   auto-creates all sheet tabs, headers, and a default Admin row in your
   spreadsheet without ever deleting existing data.
7. Tap **Sync Now** any time, or let it sync automatically whenever the
   device regains connectivity.

**When you update `gas/Code.gs` in the future:** saving code in the Apps
Script editor does *not* update the live `/exec` Web App URL — you must
also go to **Deploy → Manage deployments → (edit icon) → Version: New
version → Deploy** or your changes never take effect for real users.

If a code change adds a capability the script hasn't used before (e.g. this
project's automatic vacuum trigger, which needs permission to create
time-based triggers), the deployed Web App will silently fail on that
specific action — calls to it come back as an HTML sign-in page instead of
JSON, which browsers report as a CORS error even though the real cause is
an unauthorized scope. Fix: open the Apps Script editor, pick any function
in the Run dropdown, click **Run**, and click through the "Authorization
required" prompt (Review permissions → Advanced → Go to project (unsafe) →
Allow). That one manual run grants the new permission to the whole project,
including the deployed Web App — no redeploy needed for that part.

The backend performs delta sync only (`last_updated > since`), and pushes
locally queued changes in a single batch — matching the PRD's sync engine
design exactly.

## 5. Project structure

```
nfa-passbook/
├── index.html            Entry point
├── manifest.json / sw.js  PWA install + offline caching
├── css/style.css          NFA brand design system (navy/gold/green), themes, motion
├── js/
│   ├── core.js            Shared router registry
│   ├── geo.js              Region V (Bicol) province/municipality dataset
│   ├── db.js                Dexie schema, seeding, quota engine, serial numbers
│   ├── sync.js              Delta sync client (talks to gas/Code.gs)
│   ├── qr.js                 QR generation + CR80 ID card / A4 report printing
│   ├── delivery.js           Delivery recording modal + quota validation
│   ├── auth.js               PIN login screen
│   ├── app.js                 App shell, router, theme & seasonal background engine
│   └── screens-*.js           Dashboard, Passbook list/form/detail, Scan, Reports, Settings
├── icons/                  PWA app icons
└── gas/Code.gs             Optional Google Apps Script cloud backend
```

## 6. Extending to other NFA regions

`js/geo.js` currently ships Region V (Bicol: Albay, Camarines Norte,
Camarines Sur, Catanduanes, Masbate, Sorsogon). To support another region,
add an entry to the `REGION_DATA` object with its provinces and
municipalities, then set the matching Region Code in **Settings → General**.
