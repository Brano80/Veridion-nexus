#!/bin/bash
chmod +x "$0"
# Production deployment script for Veridion Nexus
# Deploys Rust API and Next.js dashboard to Hetzner Ubuntu 24.04 server
# Location: /opt/veridion-nexus
# Usage: ./deploy.sh

set -e  # Exit on any error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to deployment directory
DEPLOY_DIR="/opt/veridion-nexus"
cd "$DEPLOY_DIR" || {
    echo -e "${RED}❌ Failed to cd to $DEPLOY_DIR${NC}"
    exit 1
}

echo -e "${GREEN}🚀 Starting Veridion Nexus deployment...${NC}"
echo ""

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker daemon is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if docker compose is available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose are available${NC}"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found in $DEPLOY_DIR${NC}"
    echo "   Create .env file with required environment variables:"
    echo "   - DATABASE_URL"
    echo "   - JWT_SECRET"
    echo "   - POSTGRES_PASSWORD"
    echo "   - NEXT_PUBLIC_API_URL"
    exit 1
fi

echo -e "${GREEN}✅ .env file found${NC}"
echo ""

# Pull latest code
echo -e "${YELLOW}📥 Pulling latest code from git...${NC}"
git pull || {
    echo -e "${RED}❌ Git pull failed${NC}"
    exit 1
}
echo ""

# Check if Rust/migration files changed
echo -e "${YELLOW}🔍 Checking for Rust/migration changes...${NC}"
RUST_FILES_CHANGED=false

# Check if any Rust source files, Cargo files, or migrations changed
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE "(\.rs$|Cargo\.toml|Cargo\.lock|migrations/)" || \
   git diff --name-only origin/main HEAD 2>/dev/null | grep -qE "(\.rs$|Cargo\.toml|Cargo\.lock|migrations/)"; then
    RUST_FILES_CHANGED=true
    echo -e "${GREEN}✅ Rust/migration files changed - will rebuild API${NC}"
else
    echo -e "${YELLOW}ℹ️  No Rust/migration changes detected - skipping API rebuild${NC}"
fi
echo ""

# Verify required files exist
echo -e "${YELLOW}📋 Verifying required files...${NC}"

REQUIRED_FILES=(
    "Dockerfile"
    "Dockerfile.dashboard"
    "Dockerfile.landing"
    "docker-compose.prod.yml"
    "Cargo.toml"
    "src/main.rs"
    "dashboard/package.json"
    "veridion-landing/package.json"
    "migrations"
)

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -e "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing required files:${NC}"
    printf '%s\n' "${MISSING_FILES[@]}"
    exit 1
fi

echo -e "${GREEN}✅ All required files present${NC}"
echo ""

# Build API only if Rust/migration files changed
if [ "$RUST_FILES_CHANGED" = true ]; then
    echo -e "${GREEN}🔨 Building API Docker image (Rust/migration changes detected)...${NC}"
    $COMPOSE_CMD -f docker-compose.prod.yml --env-file .env build --no-cache api || {
        echo -e "${RED}❌ API build failed${NC}"
        exit 1
    }
    echo ""
else
    echo -e "${YELLOW}⏭️  Skipping API build (no Rust/migration changes)${NC}"
    echo ""
fi

# Always rebuild dashboard with --no-cache
echo -e "${GREEN}🔨 Building Dashboard Docker image (always rebuilt)...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml --env-file .env build --no-cache dashboard || {
    echo -e "${RED}❌ Dashboard build failed${NC}"
    exit 1
}
echo ""

# Always rebuild landing with --no-cache
echo -e "${GREEN}🔨 Building Landing Docker image (always rebuilt)...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml --env-file .env build --no-cache landing || {
    echo -e "${RED}❌ Landing build failed${NC}"
    exit 1
}
echo ""

# Start services
echo -e "${GREEN}🚀 Starting services...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml --env-file .env up -d || {
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
}
echo ""

# Wait for services to start
echo -e "${GREEN}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Verify API health
echo -e "${YELLOW}🏥 Verifying API health...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
HEALTH_CHECK_PASSED=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost:8080/health > /dev/null 2>&1; then
        HEALTH_CHECK_PASSED=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - waiting for API..."
    sleep 2
done

if [ "$HEALTH_CHECK_PASSED" = true ]; then
    echo -e "${GREEN}✅ API health check passed${NC}"
else
    echo -e "${RED}❌ API health check failed after $MAX_RETRIES attempts${NC}"
    echo "   Check logs: $COMPOSE_CMD -f docker-compose.prod.yml --env-file .env logs api"
    exit 1
fi
echo ""

# Check service status
echo -e "${YELLOW}📊 Service status:${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml --env-file .env ps

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Services are running:"
echo "  - API: http://localhost:8080"
echo "  - Dashboard: http://localhost:3000"
echo "  - Landing: http://localhost:3001"
echo "  - Postgres: localhost:5432"
echo ""
echo "To view logs:"
echo "  $COMPOSE_CMD -f docker-compose.prod.yml --env-file .env logs -f"
echo ""
echo "To stop services:"
echo "  $COMPOSE_CMD -f docker-compose.prod.yml --env-file .env down"
echo ""
