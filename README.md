# Nocturne Cinema Vault — Hostinger via GitHub & Production Deployment Guide

Nocturne Cinema Vault is a full-stack **Node.js (Express 4) + React 19 (Vite)** web application backed by embedded **SQLite (`better-sqlite3` in WAL mode)** at `${DATA_DIR}/gallery.sqlite` and **persistent disk thumbnail storage** at `${DATA_DIR}/uploads`.

---

## Quick Build & Runtime Summary

| Setting | Exact Value |
| :--- | :--- |
| **Node.js Version** | `22` LTS (`.nvmrc` = `22`, `package.json` `engines.node` = `>=20.0.0`) |
| **Install Command** | `npm ci` *(or `npm install`)* |
| **Build Command** | `npm run build` *(builds `dist/` client assets + bundles `server.js`)* |
| **Start Command** | `npm start` *(executes `node server.js`)* |
| **Alternative Entry File** | `server.js` *(ESM)* or `app.cjs` *(CommonJS / Phusion Passenger wrapper)* |
| **Network Binding** | `HOST=0.0.0.0`, dynamic `process.env.PORT` (defaults to `3000` locally) |
| **Health Check Endpoint** | `/api/health` |
| **Persistent Storage Path** | `DATA_DIR` *(defaults to `./data`; set outside Git folder in production)* |

---

## Hostinger Plan Compatibility Overview

Not all Hostinger plans support persistent Node.js servers. Choose the deployment path matching your active Hostinger plan:

| Hostinger Plan Tier | Node.js Support | GitHub Deployment Workflow | SQLite + Uploads Persistence |
| :--- | :--- | :--- | :--- |
| **Hostinger KVM VPS Hosting** *(Recommended)* | **Full Root Node.js 22 LTS + Native Build Tools** | GitHub clone + PM2 + Nginx SSL *(or Docker / Dokploy / CloudPanel)* | **100% Persistent** (`DATA_DIR=/var/lib/nocturne-vault/data` lives outside the Git folder and survives every redeploy) |
| **Hostinger Business Web Hosting / Cloud Hosting (hPanel Node.js Web App)** | **Managed Node.js 20/22 LTS App Slot** | hPanel **Websites -> Add Website -> Node.js Web App -> Import Git Repository** | **Requires Care**: Automated GitHub redeployments in containerized hPanel slots can replace the app directory. Set `DATA_DIR` to a persistent path outside the release checkout if available on your plan, and back up `gallery.sqlite` + `uploads/` before pushing updates |
| **Hostinger Single / Premium Shared Web Hosting** | **No Node.js Runtime** *(PHP / Static only)* | Cannot run `server.js` or `better-sqlite3` directly | Can only serve static `dist/` if paired with an external Node.js backend via `VITE_API_BASE_URL` + `CORS_ORIGIN` |

---

## Step-by-Step Guide: Deploying to Hostinger via GitHub

### Step 1: Download / Export the Project from Google AI Studio
1. In Google AI Studio, click the **Download App (ZIP)** button in the top toolbar to download the complete source archive to your computer *(or use **Save to GitHub** directly if enabled in your AI Studio toolbar)*.
2. Extract the downloaded ZIP to a clean local folder (for example, `nocturne-cinema-vault`).
3. Verify `.env.example`, `.gitignore`, `.nvmrc`, `package.json`, and `package-lock.json` are present in the root folder.

---

### Step 2: Create a Private GitHub Repository & Push Safely
1. Create a new **Private** repository on GitHub (for example, `https://github.com/<your-username>/nocturne-cinema-vault.git`) without initializing a README or `.gitignore`.
2. Open a terminal inside your extracted project folder and run:

```bash
git init
git branch -M main
git status
```

3. **Safety Check Before Committing**: Confirm `.gitignore` excludes `.env`, `data/`, `uploads/`, `*.sqlite*`, `node_modules/`, `dist/`, and `server.js`. Never commit real PINs, API keys, or production databases.
4. Stage, commit, and push to GitHub:

```bash
git add .
git commit -m "Initial production-ready Nocturne Cinema Vault release"
git remote add origin https://github.com/<your-username>/nocturne-cinema-vault.git
git push -u origin main
```

---

### Step 3: Deploy on Hostinger (Choose Your Plan Workflow)

#### Path A: Hostinger KVM VPS Hosting via GitHub *(Recommended for Production SQLite + Uploads)*
1. SSH into your Hostinger Ubuntu/Debian KVM VPS (`ssh root@<your-vps-ip>`).
2. Install system build tools (for `better-sqlite3`), Nginx, Certbot, Node.js 22 LTS, and PM2:

```bash
apt update && apt install -y git curl build-essential python3 nginx certbot python3-certbot-nginx sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

3. Create an isolated **persistent data directory outside the Git repository** so `git pull` / redeployments never touch your live database or uploaded thumbnails:

```bash
mkdir -p /var/lib/nocturne-vault/data/uploads
mkdir -p /var/www
```

4. Clone your GitHub repository (using a GitHub Deploy Key or Personal Access Token for private repos), install locked dependencies, and build:

```bash
git clone https://github.com/<your-username>/nocturne-cinema-vault.git /var/www/nocturne-vault
cd /var/www/nocturne-vault
npm ci
npm run build
```

5. Create `/var/www/nocturne-vault/.env` from `.env.example` (see **Step 6** below) with `DATA_DIR="/var/lib/nocturne-vault/data"`, then start with PM2:

```bash
cp .env.example .env
nano .env   # Set DATA_DIR="/var/lib/nocturne-vault/data", APP_URL, and optional INITIAL_ADMIN_PIN
chmod 600 .env

pm2 start npm --name "nocturne-vault" -- start
pm2 save
pm2 startup
```

*(Alternative Docker workflow on Hostinger VPS: `docker build -t nocturne-vault .` and mount `-v /var/lib/nocturne-vault/data:/app/data` with `-e DATA_DIR=/app/data`.)*

---

#### Path B: Hostinger Business / Cloud Hosting (hPanel Managed "Node.js Web App")
1. Sign in to **Hostinger hPanel** -> **Websites** -> **Add Website** -> select **Node.js Web App**.
2. Choose **Import Git Repository**, authorize your GitHub account, and select your `nocturne-cinema-vault` repository and `main` branch.
3. Configure the build and runtime settings in hPanel:
   - **Framework Preset**: `Express` or `Other`
   - **Node.js Version**: `22.x` *(or `20.x`)*
   - **Root Directory**: `./`
   - **Install Command**: `npm ci` *(or `npm install`)*
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start` *(or Entry File `server.js` / `app.cjs`)*
4. Add your production variables in the hPanel **Environment Variables** panel (see **Step 6**) before deploying.
5. Click **Deploy**. Hostinger will install dependencies, compile `dist/` and `server.js`, and bind your domain to the dynamic `process.env.PORT` injected by hPanel.
6. **Important Persistence Note for hPanel GitHub Auto-Deploys**: Because managed hPanel Node.js containers can replace the deployment directory on `git push`, configure `DATA_DIR` to a persistent directory outside the Git checkout path if your hPanel plan exposes persistent user home storage, or use **Hostinger KVM VPS (Path A)** for guaranteed non-ephemeral SQLite and `/uploads` persistence across automated GitHub pushes.

---

### Step 4: Node.js Version Selection
- **Target Version**: **Node.js 22 LTS** (pinned in `.nvmrc` as `22`).
- **Supported Range**: `>=20.0.0` (`package.json` `"engines"`), compatible with `better-sqlite3` prebuilt binaries on Linux x64/arm64.

---

### Step 5: Exact Build & Start Commands

```bash
# Install exact dependencies from package-lock.json
npm ci

# Build production React SPA (dist/ + bundled sample images) and bundle Express server (server.js)
npm run build

# Start compiled production server (reads PORT and HOST=0.0.0.0 automatically)
npm start
```

---

### Step 6: Configure Environment Variables Safely

Set these variables in **Hostinger hPanel -> Node.js -> Environment Variables** or inside `/var/www/nocturne-vault/.env` on a Hostinger VPS. Never commit `.env` to GitHub.

| Variable | Recommended Value on Hostinger | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables static `dist/` serving, security headers, and `Secure` session cookies. |
| `PORT` | *(Auto-set on hPanel)* or `3000` *(VPS)* | `server.js` automatically reads `process.env.PORT`. |
| `HOST` | `0.0.0.0` | Required so Hostinger's reverse proxy / container router reaches Express. |
| `DATA_DIR` | `/var/lib/nocturne-vault/data` *(VPS)* | Must point to persistent storage outside the Git checkout folder so redeployments never wipe `gallery.sqlite` or `uploads/`. |
| `TRUST_PROXY` | `1` | Trusts Hostinger LiteSpeed / Nginx SSL reverse proxy for client IP rate-limiting and `Secure` cookies. |
| `INITIAL_ADMIN_PIN` | Strong custom PIN *(first boot only)* | Used **only** when initializing an empty database for the first time (defaults to `20055` if omitted). Rotate in **Admin -> Admin Security** after login. |
| `ADSTERRA_POSTBACK_SECRET` | Random secret string *(optional)* | Required only if enabling Adsterra Server-to-Server Postback mode (`https://<your-domain>/api/public/adsterra/postback?subid={SUBID}&secret=<SECRET>`). |
| `APP_URL` | `https://<your-domain>` | Depends on your live Hostinger domain. |
| `VITE_API_BASE_URL` | `""` *(leave empty)* | Leave empty for single-server Hostinger deployment (uses same-origin `/api` and `/uploads`). |
| `CORS_ORIGIN` | `""` *(leave empty)* | Leave empty for same-origin deployment. Only list explicit `https://` origins if hosting frontend separately (`*` is blocked). |

---

### Step 7: Configure Domain & HTTPS / SSL
- **On Hostinger hPanel**: Attach your domain in **Websites -> Domains**, point your domain's `A` / `CNAME` records to Hostinger DNS, and verify **Free Lifetime SSL** is active under **Security -> SSL** (force HTTPS enabled).
- **On Hostinger KVM VPS (Nginx + Let's Encrypt)**: Point your domain `A` record to your VPS IPv4 address, create `/etc/nginx/sites-available/nocturne-vault` proxying to `http://127.0.0.1:3000` with `client_max_body_size 15M;` (allowing 10 MB admin thumbnail uploads), and enable HTTPS:

```nginx
server {
    server_name yourdomain.com www.yourdomain.com;
    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/nocturne-vault /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

### Step 8: Database, Uploaded Media & Safe Redeployments
- **Non-Destructive Startup**: On startup, `initializeDatabase()` runs versioned `CREATE TABLE IF NOT EXISTS` migrations (`schema_migrations`) and **never** overwrites existing `site_settings`, `admin_users`, `videos`, `ad_placements`, or `uploads/`. Even if sample videos were cleared by the admin, they are never re-seeded (`INITIAL_SAMPLE_SEED` audit guard).
- **Safe Update & Backup Procedure Before Redeploying (Hostinger VPS)**:

```bash
# 1. Back up live SQLite database (online WAL-safe backup) + uploaded thumbnails
mkdir -p /var/backups/nocturne-vault
STAMP=$(date +%Y%m%d-%H%M%S)
sqlite3 /var/lib/nocturne-vault/data/gallery.sqlite ".backup '/var/backups/nocturne-vault/gallery-${STAMP}.sqlite'"
tar -czf "/var/backups/nocturne-vault/uploads-${STAMP}.tar.gz" -C /var/lib/nocturne-vault/data uploads

# 2. Pull latest GitHub changes, rebuild, run non-destructive migrations, and reload
cd /var/www/nocturne-vault
git pull origin main
npm ci
npm run db:migrate
npm run build
pm2 reload nocturne-vault
```

---

### Step 9: Post-Deployment Verification Checklist
1. **Health Endpoint**: Open `https://<your-domain>/api/health` and confirm `{"status":"ok","database":"connected","uploadsWritable":true,...}`.
2. **Homepage & Responsive Cards**: Verify dark/gold styling, header navigation, announcement bar, search/category filter, and uniform 3-element video cards (thumbnail + title + Watch Now button) on desktop and mobile.
3. **Direct Route Refresh**: Visit `https://<your-domain>/watch/test` and refresh the browser to confirm SPA fallback returns the app cleanly without a 404.
4. **Admin Login & PIN Change**: Scroll to the footer, click the copyright text (`© ...`) to open **Management Access**, sign in, confirm the sticky admin navigation bar stays visible while scrolling, and change the initial PIN in **Admin Security**.
5. **Thumbnail Upload Persistence**: Upload a test thumbnail in **Video Manager**, save a published card, refresh the homepage, and confirm `/uploads/<file>` loads over HTTPS.
6. **Watch Now (`"ভিডিও আনলক করুন"`) & Download Flows**: Click **Watch Now**, verify the unlock modal opens, complete the sponsor step, and confirm the Telegram screening button activates.
7. **Adsterra Live Domain Approval**: Add `<your-domain>` under **Websites** in your Adsterra Publisher Dashboard, paste your Adsterra snippets/direct links in **Admin -> Ad Management**, and verify Native Banner slots keep video card heights uniform.

---

### Step 10: Safe Rollback Procedure
If a new GitHub commit introduces an issue, roll back the application code without touching `DATA_DIR` (`gallery.sqlite` and `uploads/`):

- **On Hostinger VPS**:
  ```bash
  cd /var/www/nocturne-vault
  git log --oneline -n 5
  git checkout <previous-working-commit-sha>
  npm ci
  npm run build
  pm2 reload nocturne-vault
  ```
- **On Hostinger hPanel Node.js Web App**: Revert the commit on your `main` branch (`git revert HEAD && git push origin main`) or redeploy the previous working commit from hPanel's Git deployment history.

---

## Other Supported Platforms (Preserved Compatibility)

- **cPanel ("Setup Node.js App" / Phusion Passenger)**: Upload project, set Startup File to `app.cjs`, run `npm install`, and restart (`app.cjs` auto-runs `npm run build` if `dist/` is missing).
- **Vercel (`vercel.json` + `api/gateway.js`) & Netlify (`netlify.toml` + `netlify/functions/gateway.mjs`)**: Builds static SPA via `npm run build:client` and proxies `/api/*` and `/uploads/*` to `BACKEND_URL`.
- **Docker (`Dockerfile`)**: Multi-stage Node 22 Bookworm image exposing port `3000` with persistent `/app/data` volume.
