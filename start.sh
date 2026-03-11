#!/bin/bash
set -euo pipefail

# Project Overviewer Startup Script (Mac/Linux)

echo "╔════════════════════════════════════════╗"
echo "║      Project Overviewer Startup       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed!"
    echo "   Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Node.js found: $(node --version)"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo ""
    echo "Installing dependencies..."
    npm install
    echo "Dependencies installed"
fi

# Load .env if present
if [ -f ".env" ]; then
    echo "Loading .env file..."
    set -a
    source .env
    set +a
fi

# Check for admin credentials
if [ -z "${ADMIN_USER:-}" ] || [ -z "${ADMIN_PASS:-}" ]; then
    echo ""
    echo "WARNING: ADMIN_USER and ADMIN_PASS not set."
    echo "Set them in .env or as environment variables to create the admin account."
    echo "Example: ADMIN_USER=admin ADMIN_PASS=YourSecurePassword123!"
    echo ""
fi

echo ""
echo "Starting Project Overviewer..."
echo ""

# Start the server
npm start