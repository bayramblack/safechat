# UnderNet Safe Chat — Ubuntu Server Deployment Guide

## License — MIT

UnderNet Safe Chat is open source under the [MIT license](./LICENSE). You can self-host, fork, and rebrand freely. See `README.md` for the project introduction and `DOCUMENTATION.md` for the full architecture and API reference.

---

Step-by-step guide for deploying UnderNet Safe Chat on a fresh Ubuntu 22.04+ server.

---

## Prerequisites

- Fresh Ubuntu 22.04 or 24.04 LTS server
- Root or sudo access
- A domain name pointed to the server's IP address (for HTTPS)
- At least 1 GB RAM, 10 GB disk space

---

## 1. System Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx
```

---

## 2. Node.js 24

Install Node.js via the NodeSource repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v24.x
```

Install pnpm globally:

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

---

## 3. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create a database and user:

```bash
sudo -u postgres psql <<SQL
CREATE USER undernet WITH PASSWORD 'your-secure-password-here';
CREATE DATABASE undernet OWNER undernet;
GRANT ALL PRIVILEGES ON DATABASE undernet TO undernet;
SQL
```

Verify the connection:

```bash
psql postgresql://undernet:your-secure-password-here@localhost:5432/undernet -c "SELECT 1;"
```

---

## 4. Application Setup

### Clone and install

```bash
sudo mkdir -p /opt/undernet
sudo chown $USER:$USER /opt/undernet
cd /opt/undernet
git clone <your-repository-url> .
pnpm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `.env` with production values:

```bash
PORT=3001
DATABASE_URL=postgresql://undernet:your-secure-password-here@localhost:5432/undernet
NODE_ENV=production

# Your domain (used by frontend and CORS)
CORS_ORIGINS=https://chat.yourdomain.com

# Generate VAPID keys (run once):
#   npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@yourdomain.com

# Object Storage (see "Configure file storage" section below)
GOOGLE_APPLICATION_CREDENTIALS=/opt/undernet/gcs-key.json
GCS_PROJECT_ID=your-gcp-project-id
PRIVATE_OBJECT_DIR=/your-bucket-name/undernet-uploads
PUBLIC_OBJECT_SEARCH_PATHS=/your-bucket-name/undernet-public
```

### Push database schema

```bash
# Load environment variables
set -a; source .env; set +a

pnpm --filter @workspace/db run push
```

### Build the application

```bash
pnpm run build
```

### Configure file storage

The application uses Google Cloud Storage for file uploads.

1. Create a GCS bucket and service account with Storage Object Admin permissions
2. Download the service account JSON key file to `/opt/undernet/gcs-key.json`
3. Set environment variables in `.env`:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/opt/undernet/gcs-key.json
   GCS_PROJECT_ID=your-gcp-project-id
   PRIVATE_OBJECT_DIR=/your-bucket-name/undernet-uploads
   PUBLIC_OBJECT_SEARCH_PATHS=/your-bucket-name/undernet-public
   ```

**Note:** To use a different backend (e.g., local filesystem or S3), replace the `ObjectStorageService` class methods in `artifacts/api-server/src/lib/objectStorage.ts`. The upload route in `upload.ts` uses multer memory storage and then uploads to the object store, so that class is the main integration point.

After configuring storage, verify uploads work:
```bash
curl -b /tmp/test-cookie.txt -X POST http://localhost:3001/api/upload \
  -F "file=@/path/to/test-image.jpg"
```

### Verify the build

```bash
set -a; source .env; set +a
node --enable-source-maps artifacts/api-server/dist/index.mjs
# Should print: Server listening on port 3001
# Ctrl+C to stop
```

---

## 5. PM2 Process Manager

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Create the PM2 ecosystem file:

```bash
cat > /opt/undernet/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'undernet',
    script: 'artifacts/api-server/dist/index.mjs',
    cwd: '/opt/undernet',
    node_args: '--enable-source-maps',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '/opt/undernet/.env',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/undernet/error.log',
    out_file: '/var/log/undernet/out.log',
    merge_logs: true,
  }]
};
EOF
```

Create log directory and start the app:

```bash
sudo mkdir -p /var/log/undernet
sudo chown $USER:$USER /var/log/undernet

# Load env vars and start
set -a; source .env; set +a
pm2 start ecosystem.config.cjs

# Verify it's running
pm2 status
pm2 logs undernet --lines 20

# Save PM2 process list and set up startup script
pm2 save
pm2 startup
# Run the command PM2 prints (sudo env PATH=... pm2 startup ...)
```

---

## 6. Nginx Reverse Proxy with WebSocket Support

First, create an HTTP-only Nginx configuration. Certbot will add the HTTPS server block automatically after obtaining the certificate.

**Prerequisites:** Your domain's DNS must be pointed to this server's IP address and port 80 must be reachable from the internet.

```bash
sudo tee /etc/nginx/sites-available/undernet << 'NGINX'
upstream undernet_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name chat.yourdomain.com;

    # File upload size limit (matches app's 25MB limit)
    client_max_body_size 30M;

    # API and general requests
    location /api/ {
        proxy_pass http://undernet_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket (Socket.io)
    location /api/socket.io/ {
        proxy_pass http://undernet_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long timeout for WebSocket connections
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Static frontend files (if serving frontend from the same server)
    # Uncomment and adjust the root path if you build a frontend
    # location / {
    #     root /opt/undernet/frontend/dist;
    #     try_files $uri $uri/ /index.html;
    #
    #     location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
    #         expires 30d;
    #         add_header Cache-Control "public, immutable";
    #     }
    #
    #     location = /sw.js {
    #         expires -1;
    #         add_header Cache-Control "no-cache, no-store, must-revalidate";
    #     }
    #
    #     location = /manifest.json {
    #         expires 1d;
    #         add_header Cache-Control "public";
    #     }
    # }
}
NGINX
```

Enable the site and verify:

```bash
sudo ln -sf /etc/nginx/sites-available/undernet /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Test that HTTP is working:

```bash
curl http://chat.yourdomain.com/api/healthz
# → {"status":"ok"}
```

---

## 7. HTTPS via Let's Encrypt

Obtain an SSL certificate and automatically configure Nginx for HTTPS:

```bash
sudo certbot --nginx -d chat.yourdomain.com
```

Certbot will automatically:
- Obtain the SSL certificate
- Add an HTTPS server block to the Nginx config with the certificate paths
- Add an HTTP-to-HTTPS redirect
- Set up auto-renewal via systemd timer

After Certbot completes, add security headers to the HTTPS server block. Edit `/etc/nginx/sites-available/undernet` and add inside the `server { listen 443 ... }` block that Certbot created:

```nginx
    # Security headers
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Then reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## 8. Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 9. Verify Deployment

```bash
# Health check
curl https://chat.yourdomain.com/api/healthz
# → {"status":"ok"}

# Check PM2 status
pm2 status

# Check logs
pm2 logs undernet --lines 50

# Check Nginx
sudo systemctl status nginx
```

---

## Common Operations

### Restart the application

```bash
pm2 restart undernet
```

### View logs

```bash
# Real-time logs
pm2 logs undernet

# Last 100 lines
pm2 logs undernet --lines 100

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Update the application

```bash
cd /opt/undernet

# Pull latest code
git pull origin main

# Install any new dependencies
pnpm install

# Push any schema changes
set -a; source .env; set +a
pnpm --filter @workspace/db run push

# Rebuild
pnpm run build

# Restart
pm2 restart undernet
```

### Database backup

```bash
# Create backup directory (first time only)
sudo mkdir -p /opt/backups && sudo chown $USER:$USER /opt/backups

# Backup
pg_dump -U undernet -h localhost undernet > /opt/backups/undernet_$(date +%Y%m%d_%H%M%S).sql

# Restore
psql -U undernet -h localhost undernet < /opt/backups/undernet_YYYYMMDD_HHMMSS.sql
```

### Check database

```bash
set -a; source .env; set +a
psql $DATABASE_URL -c "SELECT count(*) FROM users;"
psql $DATABASE_URL -c "SELECT count(*) FROM messages;"
```

### Rotate PM2 logs

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### Stop the application

```bash
pm2 stop undernet
```

### Remove from PM2

```bash
pm2 delete undernet
pm2 save
```

---

## Troubleshooting

### 502 Bad Gateway
- Check if the app is running: `pm2 status`
- Check app logs: `pm2 logs undernet --lines 50`
- Verify the PORT in `.env` matches the Nginx upstream port

### WebSocket not connecting
- Ensure the `/api/socket.io/` location block exists in Nginx config
- Verify `proxy_set_header Upgrade` and `Connection "upgrade"` headers are present
- Check that `CORS_ORIGINS` includes your domain with the correct protocol (https://)
- Test: `curl -i -N -H "Upgrade: websocket" -H "Connection: Upgrade" 'https://chat.yourdomain.com/api/socket.io/?EIO=4&transport=websocket'`

### SSL certificate issues
- Renew manually: `sudo certbot renew`
- Check certificate: `sudo certbot certificates`
- Verify Nginx config: `sudo nginx -t`

### Database connection refused
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify `DATABASE_URL` in `.env`
- Check pg_hba.conf allows local connections: `sudo cat /etc/postgresql/*/main/pg_hba.conf`

### Out of memory
- Check memory: `free -m`
- PM2 auto-restarts at 512MB (configurable in ecosystem.config.cjs)
- Consider increasing swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

### High CPU / slow queries
- Check PM2 metrics: `pm2 monit`
- Add database indexes if needed
- Consider increasing PostgreSQL `shared_buffers` and `work_mem` in `/etc/postgresql/*/main/postgresql.conf`

---

## Security Checklist

- [ ] `NODE_ENV=production` is set
- [ ] Strong, unique password for PostgreSQL
- [ ] HTTPS is enabled and forced
- [ ] `CORS_ORIGINS` is set to your specific domain only
- [ ] Firewall allows only SSH, HTTP, and HTTPS
- [ ] PostgreSQL only listens on localhost
- [ ] `.env` file has restricted permissions: `chmod 600 .env`
- [ ] VAPID keys are generated uniquely for your deployment
- [ ] Regular database backups are configured
- [ ] PM2 log rotation is enabled
- [ ] Server security updates are applied regularly: `sudo unattended-upgrades`
