# VATECH Inventory App

Internal inventory tracking — search by SAP code, deduct usage, manage stock.

## Project Structure

```
inventory-app/
├── server.js          ← Node.js backend (API + file server)
├── package.json
├── render.yaml        ← Render.com deployment config
├── data/
│   └── inventory.csv  ← The database (human-readable, editable)
└── public/
    └── index.html     ← Frontend (vanilla JS, works on any device)
```

---

## Running Locally (office PC / testing)

### 1. Install Node.js
Download from https://nodejs.org (LTS version)

### 2. Install dependencies
```bash
cd inventory-app
npm install
```

### 3. Start the server
```bash
node server.js
```

The app will be at: **http://localhost:3001**

To make it accessible to others on your office network:
- Find your PC's local IP (run `ipconfig` on Windows → look for IPv4 Address)
- Other devices on the same WiFi/network can go to: `http://192.168.x.x:3001`

### Auto-start on Windows boot (optional)
1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a file called `start-inventory.bat` with this content:
```bat
@echo off
cd C:\path\to\inventory-app
node server.js
```
3. Place it in the Startup folder — the server will start automatically when Windows boots.

---

## Deploying to Render.com (recommended for always-online)

This makes the app accessible from anywhere, on any phone or computer.

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/inventory-app.git
git push -u origin main
```

### Step 2 — Create Render account
Go to https://render.com and sign up (free).

### Step 3 — Deploy
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo
3. Render will detect `render.yaml` automatically
4. Click **"Create Web Service"**
5. Wait ~2 minutes for deployment

### Step 4 — Access the app
Your app will be live at: `https://vatech-inventory.onrender.com`
Share this URL with all users — works on any phone or browser.

### ⚠️ Important: Persistent Disk (free tier limitation)
Render's free tier does NOT persist files between deploys/restarts — your CSV would reset.

**Fix:** Upgrade to the $7/month "Starter" plan and add a **Disk**:
1. In Render dashboard → your service → **Disks**
2. Add disk, mount path: `/data`
3. Update `CSV_PATH` in `server.js` to `/data/inventory.csv`
4. Upload your initial `inventory.csv` via Render Shell

Alternatively, use a free database like **Supabase** instead of CSV (ask for migration help if needed).

---

## Editing the CSV Manually

The `data/inventory.csv` file can be opened directly in Excel or any text editor.

Format:
```
sap_code,description,quantity
A0000236,ASSY-SWITCH UP/DOWN/9P L7600,15
A0000465,ASSY CHIN LASER MODULE,0
```

**Rules:**
- Do not change the header row
- SAP codes must be unique
- Quantity must be a whole number (no decimals)
- Save as CSV (not Excel format) if editing in Excel: File → Save As → CSV UTF-8

---

## Using the App

**Search:** Type a SAP code or any part of the description
**Deduct:** Click an item → adjust quantity → "Confirm Use"
**Admin panel:** Click "ADMIN" in the top right
  - Add Stock: add quantity to an existing item by SAP code
  - New Item: create a brand new inventory entry

---

## Notes

- Multiple users can use the app simultaneously — writes are locked to prevent conflicts
- The CSV is the single source of truth — always backed up on disk
- Low stock warning (orange) at ≤ 3 units; out of stock (red) at 0
