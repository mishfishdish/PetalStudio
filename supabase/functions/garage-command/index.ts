import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const EXPECTED_KEY_HASH = "12be728091ac71b3959464314c131b4ee5ddc457a273b6e43e2c2625395ae883"
const GARAGE_TOPIC = "garage-a7b29738cd2d87496033bb48fc25c3ed033065b840399bee"

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://petalsstudioooooo.netlify.app",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
})

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })

  const suppliedKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!suppliedKey || await sha256(suppliedKey) !== EXPECTED_KEY_HASH) {
    return json({ error: "Incorrect access key" }, 401)
  }

  if (request.method === "GET") return json({ status: "ready", transport: "supabase-realtime" })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const body = await request.json().catch(() => ({}))
  if (body.action !== "pulse") return json({ error: "Unsupported command" }, 400)

  const projectUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!projectUrl || !serviceRoleKey) return json({ error: "Supabase environment is incomplete" }, 503)

  const command = { id: crypto.randomUUID(), action: "pulse", issuedAt: Date.now() }
  const response = await fetch(`${projectUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic: GARAGE_TOPIC, event: "pulse", payload: command, private: false }],
    }),
  })

  if (!response.ok) {
    console.error("Realtime broadcast failed", response.status, await response.text())
    return json({ error: "Could not deliver the garage command" }, 502)
  }

  return json({ ok: true, id: command.id }, 202)
})
