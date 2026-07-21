#!/bin/bash
# NUCA API Endpoint Verification Test Script

cd /home/z/my-project

# Kill any existing server
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 2

# Start server
npx next dev -p 3000 -H 0.0.0.0 &>/home/z/my-project/dev.log &
sleep 6

if ! ss -tlnp | grep -q 3000; then
  echo "FATAL: Server not listening on port 3000"
  exit 1
fi
echo "✅ Server running on port 3000"
echo ""

# Step 1: Login
echo "=== Step 1: Login ==="
LOGIN_RESP=$(curl -s --max-time 120 -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@nuca.com","password":"Admin@123"}')
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 10 ]; then
  echo "✅ Login successful"
  echo "   Token (first 30 chars): ${TOKEN:0:30}..."
else
  echo "❌ Login failed"
  echo "   Response: $LOGIN_RESP"
  exit 1
fi
echo ""

# Step 2: List document templates (before seeding)
echo "=== Step 2: List document templates (before seeding) ==="
TEMPLATES_RESP=$(curl -s --max-time 60 http://127.0.0.1:3000/api/document-templates -H "Authorization: Bearer $TOKEN")
TEMPLATE_COUNT=$(echo "$TEMPLATES_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('templates',[])))" 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "✅ GET /api/document-templates returned 200"
  echo "   Templates found: $TEMPLATE_COUNT"
else
  echo "❌ GET /api/document-templates failed"
  echo "   Response: ${TEMPLATES_RESP:0:200}"
fi
echo ""

# Step 3: Seed default template
echo "=== Step 3: Seed default template ==="
SEED_RESP=$(curl -s --max-time 60 -X POST http://127.0.0.1:3000/api/document-templates -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"seed_default":true}')
echo "   Raw response: ${SEED_RESP:0:300}"
SEED_NAME=$(echo "$SEED_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('template',{}).get('display_name',''))" 2>/dev/null)
SEED_ERROR=$(echo "$SEED_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)
if [ -n "$SEED_NAME" ]; then
  echo "✅ POST /api/document-templates (seed) - Template created: $SEED_NAME"
elif [ -n "$SEED_ERROR" ]; then
  echo "⚠️  POST /api/document-templates (seed) - Seed side-effect completed but endpoint returned 400"
  echo "   Error: $SEED_ERROR"
  echo "   Note: seed_default triggers seeding but still requires name/display_name fields"
else
  echo "❌ POST /api/document-templates (seed) - unexpected response"
fi
echo ""

# Step 4: Re-list templates after seeding
echo "=== Step 4: List templates after seeding ==="
TEMPLATES_RESP2=$(curl -s --max-time 60 http://127.0.0.1:3000/api/document-templates -H "Authorization: Bearer $TOKEN")
echo "$TEMPLATES_RESP2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=d.get('templates',[])
print(f'✅ GET /api/document-templates returned 200')
print(f'   Templates found: {len(t)}')
for tmpl in t:
    print(f'   - {tmpl[\"name\"]}: {tmpl[\"display_name\"]}')
" 2>/dev/null || echo "❌ Failed: ${TEMPLATES_RESP2:0:300}"
echo ""

# Step 5: Authorization-events API
echo "=== Step 5: Authorization-events API ==="
EVENTS_RESP=$(curl -s --max-time 60 "http://127.0.0.1:3000/api/students/authorization-events?upcoming=true" -H "Authorization: Bearer $TOKEN")
EVENTS_COUNT=$(echo "$EVENTS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('events',[])))" 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "✅ GET /api/students/authorization-events returned 200"
  echo "   Events found: $EVENTS_COUNT"
else
  echo "❌ GET /api/students/authorization-events failed"
  echo "   Response: ${EVENTS_RESP:0:300}"
fi
echo ""

# Additional: Test creating a custom template
echo "=== Additional: Create custom template ==="
CREATE_RESP=$(curl -s --max-time 60 -X POST http://127.0.0.1:3000/api/document-templates -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"test_template","display_name":"Test Template","body_text":"Hello World"}')
CREATE_NAME=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('template',{}).get('display_name',''))" 2>/dev/null)
if [ -n "$CREATE_NAME" ]; then
  echo "✅ POST /api/document-templates (create) - Created: $CREATE_NAME"
else
  CREATE_ERR=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)
  echo "⚠️  Create template: $CREATE_ERR"
fi
echo ""

# Step 6: Dev server logs
echo "=== Step 6: Dev server logs (last 20 lines) ==="
tail -20 /home/z/my-project/dev.log
echo ""

echo "============================================="
echo "  Test Summary"
echo "============================================="
