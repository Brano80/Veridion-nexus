# Production Deployment Guide

This guide explains how to deploy Veridion Nexus to a Hetzner Ubuntu 24.04 server.

## Prerequisites

- Ubuntu 24.04 server (Hetzner)
- Docker and Docker Compose installed
- Git access to the repository
- Domain configured (api.veridion-nexus.eu)

## Server Setup

### 1. Install Docker and Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose (plugin)
sudo apt install docker-compose-plugin -y

# Add user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone Repository

```bash
cd /opt
sudo git clone <repository-url> veridion-nexus
cd veridion-nexus
sudo chown -R $USER:$USER .
```

### 2b. Configure Git Authentication

Set up a GitHub personal access token so the server can pull code:

1. Go to https://github.com/settings/tokens
2. Generate new token (classic) with `repo` scope
3. Run: `git remote set-url origin https://YOUR_USERNAME:YOUR_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git`

After every git pull, re-run: `chmod +x deploy.sh`

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:YOUR_SECURE_PASSWORD@postgres:5432/veridion_api

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# JWT Secret (generate a secure random string)
JWT_SECRET=your-very-secure-jwt-secret-key-here

# Environment
RUST_ENV=production

# Postgres Password (for docker-compose)
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD

# CORS (adjust for your domain)
ALLOWED_ORIGINS=https://veridion-nexus.eu,https://www.veridion-nexus.eu
```

**Important:** Generate a secure JWT secret:
```bash
openssl rand -base64 32
```

### 4. Make Deploy Script Executable

```bash
chmod +x deploy.sh
```

## Deployment

### Initial Deployment

```bash
./deploy.sh
```

The script will:
1. Verify Docker is installed and running
2. Check all required files exist
3. Build Docker images for API and Dashboard
4. Start all services (Postgres, API, Dashboard)
5. Show service status

### Subsequent Deployments

The script is idempotent - you can run it multiple times safely:

```bash
./deploy.sh
```

It will:
- Stop existing containers
- Rebuild images with latest code
- Start fresh containers

### Manual Deployment Steps

If you prefer manual control:

```bash
# Build and start (with .env file)
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# View logs
docker compose -f docker-compose.prod.yml --env-file .env logs -f

# Stop services
docker compose -f docker-compose.prod.yml --env-file .env down

# Restart a specific service
docker compose -f docker-compose.prod.yml --env-file .env restart api
```

## Service Management

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml --env-file .env logs -f

# Specific service
docker compose -f docker-compose.prod.yml --env-file .env logs -f api
docker compose -f docker-compose.prod.yml --env-file .env logs -f dashboard
docker compose -f docker-compose.prod.yml --env-file .env logs -f postgres
```

### Check Status

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
```

### Stop Services

```bash
docker compose -f docker-compose.prod.yml --env-file .env down
```

### Update and Redeploy

```bash
# Pull latest code
git pull

# Redeploy
./deploy.sh
```

## Architecture

The deployment consists of four services:

1. **Postgres** (port 5432)
   - Database for API
   - Data persisted in `veridion_api_data` volume

2. **API** (port 8080)
   - Rust API built from `Dockerfile`
   - Multi-stage build: rust:1.88 → debian:bookworm-slim
   - Runs migrations automatically on startup

3. **Dashboard** (port 3000)
   - Next.js dashboard built from `Dockerfile.dashboard`
   - Built with node:20-alpine
   - Configured to call API at `https://api.veridion-nexus.eu`

4. **Landing Page** (port 3001)
   - Next.js landing page built from `Dockerfile.landing`
   - Configured with `NEXT_PUBLIC_DASHBOARD_URL=https://app.veridion-nexus.eu`

## Reverse Proxy Setup (Caddy)

For production, set up Caddy as a reverse proxy with automatic HTTPS:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:

```
api.veridion-nexus.eu {
    reverse_proxy localhost:8080
}

app.veridion-nexus.eu {
    reverse_proxy localhost:3000
}

veridion-nexus.eu {
    reverse_proxy localhost:3001
}

www.veridion-nexus.eu {
    reverse_proxy localhost:3001
}
```

Enable and restart:
```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
sudo systemctl status caddy
```

Caddy automatically handles SSL/TLS certificates via Let's Encrypt - no manual certificate setup needed!

## Troubleshooting

### Services won't start

1. Check Docker is running: `docker info`
2. Check logs: `docker compose -f docker-compose.prod.yml logs`
3. Verify environment variables in `.env`

### Database connection errors

1. Ensure Postgres is healthy: `docker compose -f docker-compose.prod.yml ps postgres`
2. Check `DATABASE_URL` matches docker-compose service name (`postgres:5432`)
3. Verify password matches in `.env` and `POSTGRES_PASSWORD`

### Build failures

1. Check Docker has enough resources: `docker system df`
2. Clear build cache: `docker builder prune`
3. Rebuild without cache: `docker compose -f docker-compose.prod.yml --env-file .env build --no-cache`

### Port conflicts

If ports 3000, 5432, or 8080 are in use:
1. Find process: `sudo lsof -i :8080`
2. Stop conflicting service or change ports in `docker-compose.prod.yml`

## Backup

### Database Backup

```bash
# Create backup
docker compose -f docker-compose.prod.yml --env-file .env exec postgres pg_dump -U postgres veridion_api > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres psql -U postgres veridion_api < backup.sql
```

### Volume Backup

```bash
# Backup volume
docker run --rm -v veridion_api_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup_$(date +%Y%m%d).tar.gz /data
```

## Monitoring

### Health Checks

- API: `curl http://localhost:8080/health`
- Dashboard: `curl http://localhost:3000`

### Resource Usage

```bash
docker stats
```

## Admin Password Reset

If you need to reset the admin user password:

1. **Generate a new bcrypt hash:**
   ```bash
   cd /opt/veridion-nexus
   cargo run --bin generate_hash
   # This will output a bcrypt hash for "Admin1234!"
   ```

2. **Update the password hash in the database:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec postgres psql -U postgres -d veridion_api -c "UPDATE users SET password_hash = 'YOUR_BCRYPT_HASH_HERE' WHERE username = 'admin';"
   ```

3. **Verify the update:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec postgres psql -U postgres -d veridion_api -c "SELECT username, email, LEFT(password_hash, 20) as hash_preview FROM users WHERE username = 'admin';"
   ```

4. **Test login:**
   - Go to `https://app.veridion-nexus.eu/login`
   - Use email: `admin@localhost`
   - Use password: `Admin1234!` (or whatever password you hashed)

**Note:** The `generate_hash` binary is available in the project root. If it's not available, you can create it by adding to `Cargo.toml`:
```toml
[[bin]]
name = "generate_hash"
path = "generate_hash.rs"
```

## Security Notes

- Change default Postgres password
- Use strong JWT_SECRET
- Keep Docker and system updated
- Configure firewall (UFW)
- Use SSL/TLS in production (handled automatically by Caddy)
- Regularly backup database
