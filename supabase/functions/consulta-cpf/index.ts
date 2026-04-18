// Edge Function: consulta-cpf
// Integração real com a Serasa Experian (OFERTA PME V7 NV).
// Fluxo:
//   1. OAuth2 client_credentials → access_token (com cache em memória até expirar)
//   2. POST OFERTA PME V7 NV com o CPF do consumidor
//   3. Extrai nome + score, persiste em public.consultas, devolve ao cliente
//
// Variáveis de ambiente (já configuradas via Lovable Cloud Secrets):
//   - SERASA_CLIENT_ID
//   - SERASA_CLIENT_SECRET
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SERASA_BASE = "https://api.serasaexperian.com.br";
const TOKEN_URL = `${SERASA_BASE}/security/iam/v1/client-token`;
// Endpoint do produto OFERTA PME V7 NV (Business/Consumer Reports da Serasa).
// Caso seu contrato use outro path (vai estar na doc que a Serasa te enviou),
// basta ajustar a constante abaixo sem mexer no resto do código.
const OFERTA_PME_URL = `${SERASA_BASE}/credit-services/business-reports/v1/reports`;

// ===== Cache de token em memória (vive enquanto a função estiver "quente") =====
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getSerasaToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }

  const clientId = Deno.env.get("SERASA_CLIENT_ID");
  const clientSecret = Deno.env.get("SERASA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais Serasa não configuradas no servidor");
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Falha ao obter token Serasa [${resp.status}]: ${text}`);
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Resposta Serasa sem access_token");

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: now + ttlMs };
  return data.access_token;
}

// ===== Chamada ao OFERTA PME V7 NV =====
interface SerasaResult {
  nome: string;
  score: number;
  raw: unknown;
}

async function consultarSerasa(cpf: string): Promise<SerasaResult> {
  const token = await getSerasaToken();

  const payload = {
    optionalFeatures: ["OFERTA_PME_V7_NV"],
    consumer: { documentNumber: cpf },
  };

  const resp = await fetch(OFERTA_PME_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Serasa [${resp.status}]: ${text}`);

  const json = JSON.parse(text);

  // Extração resiliente — varia por contrato. Tenta vários caminhos.
  const nome =
    pickPath(json, ["consumer", "name"]) ??
    pickPath(json, ["consumer", "fullName"]) ??
    pickPath(json, ["registration", "name"]) ??
    pickPath(json, ["data", "name"]) ??
    "Cliente";

  const scoreRaw =
    pickPath(json, ["score", "value"]) ??
    pickPath(json, ["score", "score"]) ??
    pickPath(json, ["positiveScore", "score"]) ??
    pickPath(json, ["serasaScore", "value"]) ??
    pickPath(json, ["data", "score"]) ??
    null;

  const score = typeof scoreRaw === "number"
    ? scoreRaw
    : Number.parseInt(String(scoreRaw ?? "0"), 10);

  if (!Number.isFinite(score) || score <= 0) {
    throw new Error("Resposta Serasa sem score válido (verifique o caminho do JSON na doc do produto contratado)");
  }

  return { nome: String(nome), score, raw: json };
}

function pickPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else return undefined;
  }
  return cur;
}

// ===== Validação de CPF =====
function onlyDigits(s: string) { return (s || "").replace(/\D/g, ""); }
function isValidCPF(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp({ error: "Não autenticado" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResp({ error: "Sessão inválida" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const cpf = onlyDigits(body?.cpf ?? "");
    if (!isValidCPF(cpf)) return jsonResp({ error: "CPF inválido" }, 400);

    const serasa = await consultarSerasa(cpf);

    const { error: insertErr } = await supabase.from("consultas").insert({
      user_id: userData.user.id,
      cpf,
      nome: serasa.nome,
      score: serasa.score,
      status: "sucesso",
      raw: serasa.raw as never,
    });
    if (insertErr) console.error("Erro ao gravar consulta:", insertErr);

    return jsonResp({
      cpf,
      nome: serasa.nome,
      score: serasa.score,
      provider: "serasa",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("consulta-cpf error:", msg);
    return jsonResp({ error: msg }, 500);
  }
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
