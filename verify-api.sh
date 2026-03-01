#!/bin/bash

echo "Testing API..."
echo ""
echo "1. Testing GET /api/projects"
curl -s http://localhost:3001/api/projects | jq '.' 2>/dev/null || curl -s http://localhost:3001/api/projects

echo ""
echo ""
echo "2. Testing POST /api/projects"
RESULT=$(curl -s -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "id": "verify-'$(date +%s)'",
    "title": "Verification Project",
    "description": "Testing",
    "status": "not-started",
    "priority": "medium",
    "tags": [],
    "order": 0
  }')

echo "$RESULT" | jq '.' 2>/dev/null || echo "$RESULT"

if echo "$RESULT" | grep -q '"title"'; then
    echo ""
    echo "✅ SUCCESS: API is working correctly!"
else
    echo ""
    echo "❌ FAILED: API returned empty or error"
    echo "Make sure the server is restarted!"
fi
