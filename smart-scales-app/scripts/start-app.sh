#!/bin/bash

# Smart Scales Launcher Script
# This script starts the Next.js server and opens the app in your browser
# Auto-rebuilds if source files have changed since last build

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3000
URL="http://localhost:$PORT"

# Check if the server is already running
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Server already running on port $PORT"
    open "$URL"
    exit 0
fi

echo "Starting Smart Scales..."
echo "App directory: $APP_DIR"

cd "$APP_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Function to check if rebuild is needed
needs_rebuild() {
    # If no build exists, need to build
    if [ ! -d ".next" ]; then
        return 0
    fi

    # Get the build timestamp (using BUILD_ID file)
    BUILD_FILE=".next/BUILD_ID"
    if [ ! -f "$BUILD_FILE" ]; then
        return 0
    fi

    # Find any source files newer than the build
    # Check src/, prisma/, package.json, etc.
    NEWER_FILES=$(find src prisma package.json next.config.ts -newer "$BUILD_FILE" 2>/dev/null | head -1)

    if [ -n "$NEWER_FILES" ]; then
        return 0  # Needs rebuild
    fi

    return 1  # No rebuild needed
}

# Check if rebuild is needed
if needs_rebuild; then
    echo "Changes detected - rebuilding app..."
    npm run build
else
    echo "Build is up to date."
fi

# Start the server in the background
echo "Starting server on port $PORT..."
npm run start &
SERVER_PID=$!

# Wait for the server to be ready (check for HTTP 200)
echo "Waiting for server to start..."
SERVER_READY=false
for i in {1..60}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "302" ]; then
        echo "Server is ready! (HTTP $HTTP_CODE)"
        SERVER_READY=true
        # Give it a moment to fully initialize
        sleep 2
        break
    fi
    echo "  Waiting... ($i/60)"
    sleep 1
done

if [ "$SERVER_READY" = false ]; then
    echo "Warning: Server may not be fully ready, opening anyway..."
fi

# Open the browser
echo "Opening browser..."
open "$URL"

# Keep the script running to maintain the server
echo ""
echo "=========================================="
echo "  Smart Scales is running!"
echo "  URL: $URL"
echo "  Press Ctrl+C to stop the server."
echo "=========================================="
wait $SERVER_PID
