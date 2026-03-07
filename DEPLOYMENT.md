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
# Build and start
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop services
docker compose -f docker-compose.prod.yml down

# Restart a specific service
docker compose -f docker-compose.prod.yml restart api
```

## Service Management

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f dashboard
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Check Status

```bash
docker compose -f docker-compose.prod.yml ps
```

### Stop Services

```bash
docker compose -f docker-compose.prod.yml down
```

### Update and Redeploy

```bash
# Pull latest code
git pull

# Redeploy
./deploy.sh
```

## Architecture

The deployment consists of three services:

1. **Postgres** (port 5432)
   - Database for API
   - Data persisted in `veridion_api_data` volume

2. **API** (port 8080)
   - Rust API built from `Dockerfile`
   - Multi-stage build: rust:1.85 → debian:bookworm-slim
   - Runs migrations automatically on startup

3. **Dashboard** (port 3000)
   - Next.js dashboard built from `Dockerfile.dashboard`
   - Built with node:20-alpine
   - Configured to call API at `https://api.veridion-nexus.eu`

## Reverse Proxy Setup (Nginx)

For production, set up Nginx as a reverse proxy:

```nginx
# /etc/nginx/sites-available/veridion-nexus
server {
    listen 80;
    server_name api.veridion-nexus.eu;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name veridion-nexus.eu www.veridion-nexus.eu;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/veridion-nexus /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## SSL/TLS Setup (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.veridion-nexus.eu -d veridion-nexus.eu -d www.veridion-nexus.eu
```

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
3. Rebuild without cache: `docker compose -f docker-compose.prod.yml build --no-cache`

### Port conflicts

If ports 3000, 5432, or 8080 are in use:
1. Find process: `sudo lsof -i :8080`
2. Stop conflicting service or change ports in `docker-compose.prod.yml`

## Backup

### Database Backup

```bash
# Create backup
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres veridion_api > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres veridion_api < backup.sql
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

## Security Notes

- Change default Postgres password
- Use strong JWT_SECRET
- Keep Docker and system updated
- Configure firewall (UFW)
- Use SSL/TLS in production
- Regularly backup database
