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
