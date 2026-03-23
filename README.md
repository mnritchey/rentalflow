# ⚡ RentalFlow — Audio/Video Equipment Rental Management

A self-hosted, Docker-deployable rental management system for AV equipment companies.

## Features

- **Equipment Catalog** — Models with manufacturer info, categories, weight, rental price, replacement value, images
- **Asset/Barcode Tracking** — Multiple barcodes per model, serial numbers, storage locations, condition tracking
- **Projects** — Create projects with client contacts, dates, venue info
- **Fast Scan Check In/Out** — Barcode scanner optimized UI with audio feedback (success/error beeps)
- **Conflict Resolution** — If an item is checked out elsewhere, prompts to transfer it in one click
- **Printable Receipt** — Professional PDF-style receipt with EULA, signature line, equipment list
- **Digital Signature** — Capture client signature on screen
- **Multi-user** — JWT authentication, multiple simultaneous users, admin/operator roles
- **Real-time** — WebSocket broadcasts so all open tabs update live

## Quick Start

### With Docker Compose (recommended)

```bash
# Clone or copy this folder, then:
docker compose up -d

# App available at http://localhost:3000
# Default login: admin / admin123
```

### Build from source

```bash
docker build -t rentalflow .
docker run -d \
  -p 3000:3000 \
  -v rentalflow_data:/data \
  -e JWT_SECRET=your-secret-here \
  --name rentalflow \
  rentalflow
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `rental-secret-change-in-prod` | **Change this in production!** |
| `DB_PATH` | `/data/rental.db` | SQLite database path |

## Data Persistence

All data is stored in a SQLite database and uploaded images at `/data` inside the container. Mount a volume there to persist data across restarts.

```bash
# Backup your data
docker run --rm -v rentalflow_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/rentalflow-backup.tar.gz /data
```

## Usage Guide

### 1. Initial Setup
- Log in with `admin` / `admin123` and **change the password** in Settings
- Go to Settings → set your company name and default EULA text
- Add storage locations (e.g. "Warehouse A", "Truck 1")
- Add manufacturers (e.g. "Chauvet", "Shure", "Panasonic")

### 2. Add Equipment
- Equipment → Add Model → fill in details
- On the model page, add individual assets with barcodes
- Use **Bulk Add** to paste many barcodes at once (one per line)

### 3. Create a Project
- Projects → New Project
- Assign a contact, dates, venue
- The default EULA from settings will be pre-filled (editable per project)

### 4. Check Out Equipment
- From a project, click **📷 Scan**
- Make sure mode is set to **Check Out**
- Scan barcodes with a USB barcode scanner (it types like a keyboard)
- A success beep plays for each successful scan, error beep for unknown barcodes
- If an item is already checked out to another project, a prompt appears to transfer it

### 5. Check In Equipment
- Same scan page, switch mode to **Check In**
- Scan barcodes to return items

### 6. Print Receipt
- On the project page, click **✍️ Sign** to capture client signature
- Click **🖨 Print Receipt** to open a print-ready document in a new tab
- The receipt includes equipment list with barcodes, replacement values, EULA, and signature

## Architecture

```
Dockerfile (single container)
├── Node.js / Express backend (port 3000)
│   ├── SQLite database (better-sqlite3)
│   ├── REST API (/api/*)
│   ├── WebSocket (/ws) for real-time updates
│   └── Serves built React frontend as static files
└── React frontend (built into /app/frontend)
```

## Default Credentials

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Admin |

**⚠️ Change the admin password and set a strong JWT_SECRET before exposing to the internet.**
