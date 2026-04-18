// Edge Function: consulta-cpf
// Integração real com a Serasa Experian — Relatório Intermediário PF.
// Doc de referência: https://developer.serasaexperian.com.br/api/relatorio-intermediario-pf
//
// Fluxo:
//   1. OAuth2 client_credentials → access_token (cache em memória)
//   2. POST Relatório Intermediário PF com o CPF do consumidor
//   3. Extrai nome, score e lista de pendências (PEFIN/REFIN), persiste e devolve
//
// Variáveis de ambiente (Lovable Cloud Secrets):
//   - SERASA_CLIENT_ID
//   - SERASA_CLIENT_SECRET
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SERASA_BASE = "https://api.serasaexperian.com.br";
const TOKEN_URL = `${SERASA_BASE}/oauth2/v3/token`;
// Endpoint do Relatório Intermediário PF (Credit Bureau Reports / Consumer Information Report).
// Caso seu contrato use outro path, é só ajustar essa constante.
const REPORT_URL = `${SERASA_BASE}/credit-services/consumer-information-report/v1/reports`;

// ===== Cache de token em memória =====
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getSerasaToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.value;

  const clientId = Deno.env.get("SERASA_CLIENT_ID");
  const clientSecret = Deno.env.get("SERASA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais Serasa não configuradas no servidor");
  }

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error("Serasa token error", {
      status: resp.status,
      clientIdPrefix: clientId.substring(0, 6),
      clientIdLen: clientId.length,
      body: text.substring(0, 300),
    });
    throw new Error(`Falha ao obter token Serasa [${resp.status}]: ${text}`);
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Resposta Serasa sem access_token");

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: now + ttlMs };
  return data.access_token;
}

// ===== Tipos de retorno =====
export interface Pendencia {
  credor: string;
  valor: number;
  data: string | null;
  tipo: string;     // PEFIN, REFIN, etc.
  contrato?: string;
}

interface SerasaResult {
  nome: string;
  score: number;
  pendencias: Pendencia[];
  totalPendencias: number;
  somaPendencias: number;
  raw: unknown;
}

// ===== Chamada ao Relatório Intermediário PF =====
async function consultarSerasa(cpf: string): Promise<SerasaResult> {
  const token = await getSerasaToken();

  // Payload padrão Credit Bureau / Intermediário PF.
  // Algumas variações usam optionalFeatures ["INTERMEDIATE_PF"] ou ["CREDIT_REPORT_PF_INTERMEDIATE"].
  // Mandamos um payload abrangente para o produto resolver.
  const payload = {
    optionalFeatures: ["INTERMEDIATE_PF"],
    consumer: { documentNumber: cpf },
  };

  const resp = await fetch(REPORT_URL, {
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

  // Nome — tenta vários caminhos comuns
  const nome =
    pickPath(json, ["consumer", "name"]) ??
    pickPath(json, ["consumer", "fullName"]) ??
    pickPath(json, ["registration", "name"]) ??
    pickPath(json, ["registrationData", "name"]) ??
    pickPath(json, ["data", "name"]) ??
    "Cliente";

  // Score — tenta vários caminhos comuns
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

  // Pendências (PEFIN / REFIN / negativações)
  const pendencias = extrairPendencias(json);
  const somaPendencias = pendencias.reduce((acc, p) => acc + (p.valor || 0), 0);

  return {
    nome: String(nome),
    score,
    pendencias,
    totalPendencias: pendencias.length,
    somaPendencias,
    raw: json,
  };
}

function extrairPendencias(json: unknown): Pendencia[] {
  // Caminhos comuns onde a Serasa lista PEFIN/REFIN no Intermediário PF.
  const candidatos: unknown[] = [
    pickPath(json, ["pendencies"]),
    pickPath(json, ["pendingDebts"]),
    pickPath(json, ["pendingDebts", "debts"]),
    pickPath(json, ["debts"]),
    pickPath(json, ["negativeData", "pendencies"]),
    pickPath(json, ["negativeData", "debts"]),
    pickPath(json, ["pefin", "items"]),
    pickPath(json, ["refin", "items"]),
  ].filter(Array.isArray);

  const itens: Record<string, unknown>[] = [];
  for (const arr of candidatos) {
    for (const it of arr as unknown[]) {
      if (it && typeof it === "object") itens.push(it as Record<string, unknown>);
    }
  }

  return itens.map((it) => {
    const valor = pickFirstNumber(it, [
      ["value"], ["amount"], ["debtValue"], ["originalValue"], ["currentValue"],
    ]);
    const data = pickFirstString(it, [
      ["date"], ["occurrenceDate"], ["registerDate"], ["includeDate"], ["referenceDate"],
    ]);
    const credor = pickFirstString(it, [
      ["creditor"], ["creditorName"], ["companyName"], ["informant"], ["informantName"],
    ]) ?? "—";
    const tipo = pickFirstString(it, [
      ["type"], ["modality"], ["debtType"], ["nature"],
    ]) ?? "PENDÊNCIA";
    const contrato = pickFirstString(it, [
      ["contract"], ["contractNumber"], ["operationNumber"], ["reference"],
    ]);

    return { credor, valor: valor ?? 0, data, tipo: String(tipo).toUpperCase(), contrato };
  });
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

function pickFirstNumber(obj: Record<string, unknown>, paths: string[][]): number | null {
  for (const p of paths) {
    const v = pickPath(obj, p);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number.parseFloat(v.replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickFirstString(obj: Record<string, unknown>, paths: string[][]): string | null {
  for (const p of paths) {
    const v = pickPath(obj, p);
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number") return String(v);
  }
  return null;
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
    if (!authHeader) return jsonResp({ error: "Não autenticado" }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, "");

    // Usa service role para validar o token (compatível com chaves ES256)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("Auth error:", userErr);
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
      pendencias: serasa.pendencias,
      totalPendencias: serasa.totalPendencias,
      somaPendencias: serasa.somaPendencias,
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
