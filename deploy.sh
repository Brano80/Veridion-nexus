#!/bin/bash
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

# Script directory (where deploy.sh is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

# Check if docker compose is available (try both 'docker compose' and 'docker-compose')
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

# Verify required files exist
echo -e "${YELLOW}📋 Verifying required files...${NC}"

REQUIRED_FILES=(
    "Dockerfile"
    "Dockerfile.dashboard"
    "docker-compose.prod.yml"
    "Cargo.toml"
    "src/main.rs"
    "dashboard/package.json"
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

# Check for .env file or environment variables
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found${NC}"
    echo "   Make sure required environment variables are set:"
    echo "   - DATABASE_URL"
    echo "   - JWT_SECRET"
    echo "   - POSTGRES_PASSWORD (optional, defaults to 'postgres')"
    echo ""
fi

# Stop existing containers if they exist (idempotent)
echo -e "${YELLOW}🛑 Stopping existing containers (if any)...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml down 2>/dev/null || true
echo ""

# Build and start services
echo -e "${GREEN}🔨 Building Docker images...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml build --no-cache

echo ""
echo -e "${GREEN}🚀 Starting services...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml up -d

echo ""
echo -e "${GREEN}⏳ Waiting for services to be healthy...${NC}"
sleep 5

# Check service status
echo ""
echo -e "${YELLOW}📊 Service status:${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml ps

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Services are running:"
echo "  - API: http://localhost:8080"
echo "  - Dashboard: http://localhost:3000"
echo "  - Postgres: localhost:5432"
echo ""
echo "To view logs:"
echo "  $COMPOSE_CMD -f docker-compose.prod.yml logs -f"
echo ""
echo "To stop services:"
echo "  $COMPOSE_CMD -f docker-compose.prod.yml down"
echo ""
