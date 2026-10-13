// @ts-ignore Deno resuelve la importación remota al ejecutar la función.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const denoRuntime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

denoRuntime.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return responder(405, { error: "Metodo no permitido." });

  let body: { tarjetaIdentidad?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return responder(400, { error: "Solicitud invalida." });
  }

  const tarjetaIdentidad = typeof body.tarjetaIdentidad === "string" ? body.tarjetaIdentidad.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[0-9]{1,20}$/.test(tarjetaIdentidad) || password.length < 6 || password.length > 256) {
    return responder(401, { error: "Tarjeta de identidad o clave incorrectas." });
  }

  const supabaseUrl = denoRuntime.env.get("SUPABASE_URL");
  const anonKey = denoRuntime.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = denoRuntime.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return responder(500, { error: "El servicio de inicio de sesion no esta configurado." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: perfil, error: perfilError } = await adminClient
    .from("usuarios")
    .select("email")
    .eq("tarjeta_identidad", tarjetaIdentidad)
    .maybeSingle();

  if (perfilError) return responder(500, { error: "No se pudo validar el acceso." });
  if (!perfil?.email) return responder(401, { error: "Tarjeta de identidad o clave incorrectas." });

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email: perfil.email, password });
  if (error || !data.session) {
    return responder(401, { error: "Tarjeta de identidad o clave incorrectas." });
  }

  return responder(200, {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
});