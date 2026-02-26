#!/bin/bash

# ================================
# Cloudflare Tunnel Setup Helper
# ================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Cloudflare Tunnel Setup${NC}"
echo -e "${BLUE}================================${NC}\n"

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared is not installed${NC}"
    echo -e "${YELLOW}Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-applications/install-and-setup/installation/${NC}\n"
    exit 1
fi

echo -e "${GREEN}✅ cloudflared found${NC}\n"

# Step 1: Check if logged in
echo -e "${BLUE}Step 1: Check Cloudflare login...${NC}"
if [ ! -d "$HOME/.cloudflared" ] || [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo -e "${YELLOW}⚠️  Not logged in. Starting login...${NC}"
    cloudflared tunnel login
else
    echo -e "${GREEN}✅ Already logged in${NC}"
fi

echo ""

# Step 2: Check if tunnel exists
echo -e "${BLUE}Step 2: Check tunnel...${NC}"

TUNNEL_NAME="bot-server"
TUNNEL_ID=$(cloudflared tunnel list | grep -oP "(?<=$TUNNEL_NAME\s+)[a-f0-9\-]+(?=\s+)" || echo "")

if [ -z "$TUNNEL_ID" ]; then
    echo -e "${YELLOW}Creating tunnel: $TUNNEL_NAME${NC}"
    cloudflared tunnel create $TUNNEL_NAME
    TUNNEL_ID=$(cloudflared tunnel list | grep -oP "(?<=$TUNNEL_NAME\s+)[a-f0-9\-]+(?=\s+)" || echo "")
else
    echo -e "${GREEN}✅ Tunnel exists: $TUNNEL_NAME ($TUNNEL_ID)${NC}"
fi

echo ""

# Step 3: Get tunnel token
echo -e "${BLUE}Step 3: Get tunnel token...${NC}"

# Generate temporary config
TEMP_CONFIG="/tmp/config_temp.yml"
mkdir -p ~/.cloudflared
cat > "$TEMP_CONFIG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: bot.nasgun.cf
    service: http://localhost:3000
  - service: http_status:404
EOF

# Get token (cloudflared tunnel token <tunnel-id>)
TUNNEL_TOKEN=$(cloudflared tunnel token $TUNNEL_ID 2>/dev/null || echo "")

if [ -z "$TUNNEL_TOKEN" ]; then
    echo -e "${RED}❌ Failed to get tunnel token${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Token generated${NC}\n"

# Step 4: Update .env file
echo -e "${BLUE}Step 4: Update .env file...${NC}"

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    cp .env.example "$ENV_FILE"
    echo -e "${GREEN}✅ Created .env from .env.example${NC}"
fi

# Update CLOUDFLARE_TOKEN (using sed)
if grep -q "^CLOUDFLARE_TOKEN=" "$ENV_FILE"; then
    # Update existing
    sed -i.bak "s|^CLOUDFLARE_TOKEN=.*|CLOUDFLARE_TOKEN=$TUNNEL_TOKEN|" "$ENV_FILE"
    echo -e "${GREEN}✅ Updated CLOUDFLARE_TOKEN in .env${NC}"
else
    # Append new
    echo "CLOUDFLARE_TOKEN=$TUNNEL_TOKEN" >> "$ENV_FILE"
    echo -e "${GREEN}✅ Added CLOUDFLARE_TOKEN to .env${NC}"
fi

rm -f "$ENV_FILE.bak"

echo ""

# Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}\n"

echo -e "${BLUE}📋 Summary:${NC}"
echo "  Tunnel Name: $TUNNEL_NAME"
echo "  Tunnel ID: $TUNNEL_ID"
echo "  Config: ~/.cloudflared/$TUNNEL_ID.json"
echo ""

echo -e "${BLUE}🚀 Next steps:${NC}"
echo "  1. Review .env file (RECIPIENT_NUMBER, API_KEY, etc.)"
echo "  2. Run: docker-compose up -d"
echo "  3. Check logs: docker-compose logs -f"
echo ""

echo -e "${BLUE}🔗 Access:${NC}"
echo "  Public: https://bot-<account>.cfargotunnel.com"
echo "  Local: http://localhost:3000"
echo ""

echo -e "${YELLOW}⚠️  Important:${NC}"
echo "  - Keep CLOUDFLARE_TOKEN secret (stored in .env)"
echo "  - Don't commit .env to git"
echo "  - Monitor tunnel: cloudflared tunnel list"
echo ""
