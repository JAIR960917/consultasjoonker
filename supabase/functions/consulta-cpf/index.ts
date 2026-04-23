// Edge Function: consulta-cpf
// Integração real com a Serasa Experian — Relatório Básico PF.
// Doc: https://developer.serasaexperian.com.br/api/relatorio-basico-pf
//
// Fluxo:
//   1. POST /security/iam/v1/client-identities/login com Basic Auth (client_id:client_secret)
//      → access_token (cache em memória)
//   2. GET  /credit-services/person-information-report/v1/creditreport
//        ?reportName=PERFIL_DE_CREDITO_BASICO_PF&optionalFeatures=SCORE_POSITIVO
//      headers: Authorization: Bearer, X-Document-Id (CPF), X-Retailer-Document-Id (CNPJ)
//   3. Extrai nome, score e pendências, persiste e devolve
//
// Secrets necessários (Lovable Cloud):
//   - SERASA_CLIENT_ID
//   - SERASA_CLIENT_SECRET
//   - SERASA_RETAILER_CNPJ   (CNPJ da empresa consultante, somente dígitos ou formatado)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Ambiente: "uat" (homologação) ou "prod" (produção). Default: uat.
const SERASA_ENV = (Deno.env.get("SERASA_ENV") ?? "uat").toLowerCase();
const SERASA_BASE = SERASA_ENV === "prod"
  ? "https://api.serasaexperian.com.br"
  : "https://uat-api.serasaexperian.com.br";
const TOKEN_URL = `${SERASA_BASE}/security/iam/v1/client-identities/login`;
const REPORT_URL = `${SERASA_BASE}/credit-services/person-information-report/v1/creditreport`;

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

  const basic = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Length": "0",
    },
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
  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Serasa token: resposta não-JSON", { status: resp.status, body: text.substring(0, 500) });
    throw new Error(`Resposta Serasa inválida (não-JSON): ${text.substring(0, 200)}`);
  }
  if (!data.access_token) {
    console.error("Serasa token: sem access_token", {
      status: resp.status,
      env: SERASA_ENV,
      tokenUrl: TOKEN_URL,
      keys: Object.keys(data),
      body: text.substring(0, 500),
    });
    throw new Error(`Resposta Serasa sem access_token. Body: ${text.substring(0, 200)}`);
  }

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: now + ttlMs };
  return data.access_token;
}

// ===== Tipos de retorno =====
export interface Pendencia {
  credor: string;
  valor: number;
  data: string | null;
  tipo: string;
  contrato?: string;
}

interface SerasaResult {
  nome: string;
  score: number;
  pendencias: Pendencia[];
  totalPendencias: number;
  somaPendencias: number;
  raw: unknown;
  dataNascimento: string | null;
}

// ===== Chamada ao Relatório Básico PF =====
async function consultarSerasa(cpf: string): Promise<SerasaResult> {
  const token = await getSerasaToken();

  const retailerCnpj = onlyDigits(Deno.env.get("SERASA_RETAILER_CNPJ") ?? "");
  if (!retailerCnpj) {
    throw new Error("SERASA_RETAILER_CNPJ não configurado no servidor");
  }

  const url = new URL(REPORT_URL);
  url.searchParams.set("reportName", "PERFIL_DE_CREDITO_BASICO_PF");
  url.searchParams.append("optionalFeatures", "SCORE_POSITIVO");

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Document-Id": cpf,
      "X-Retailer-Document-Id": retailerCnpj,
    },
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error("Serasa report error", {
      status: resp.status,
      body: text.substring(0, 500),
    });
    throw new Error(`Serasa [${resp.status}]: ${text}`);
  }
  const json = JSON.parse(text);

  // Nome — tenta vários caminhos comuns no Básico PF
  const nome =
    pickPath(json, ["registrationData", "name"]) ??
    pickPath(json, ["registration", "name"]) ??
    pickPath(json, ["consumer", "name"]) ??
    pickPath(json, ["consumer", "fullName"]) ??
    pickPath(json, ["personRegistrationData", "name"]) ??
    pickPath(json, ["data", "name"]) ??
    "Cliente";

  // Data de nascimento — tenta vários caminhos
  const dataNascRaw =
    pickPath(json, ["registrationData", "birthDate"]) ??
    pickPath(json, ["registration", "birthDate"]) ??
    pickPath(json, ["consumer", "birthDate"]) ??
    pickPath(json, ["personRegistrationData", "birthDate"]) ??
    pickPath(json, ["data", "birthDate"]) ??
    null;

  // Score — Básico PF normalmente devolve em scoreCH/scoreModels com modelo HLRD
  const scoreRaw =
    pickPath(json, ["scoreCH", "score"]) ??
    pickPath(json, ["scoreCH", "value"]) ??
    pickFromArrayByKey(json, ["scoreModels"], "modelCode", "HLRD", ["score"]) ??
    pickFromArrayByKey(json, ["scoreModels"], "modelCode", "HLRD", ["value"]) ??
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
    console.error("Score não encontrado. Chaves no topo do JSON:", Object.keys(json ?? {}));
    throw new Error("Resposta Serasa sem score válido (verifique os caminhos do JSON na doc do produto)");
  }

  const pendencias = extrairPendencias(json);
  const somaPendencias = pendencias.reduce((acc, p) => acc + (p.valor || 0), 0);

  // Normaliza data de nascimento para formato YYYY-MM-DD
  let dataNascimento: string | null = null;
  if (dataNascRaw && typeof dataNascRaw === "string") {
    const s = dataNascRaw.trim();
    // Aceita formatos: YYYY-MM-DD, DD/MM/YYYY, ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      dataNascimento = s.substring(0, 10);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/");
      dataNascimento = `${y}-${m}-${d}`;
    }
  }

  return {
    nome: String(nome),
    score,
    pendencias,
    totalPendencias: pendencias.length,
    somaPendencias,
    raw: json,
    dataNascimento,
  };
}

function extrairPendencias(json: unknown): Pendencia[] {
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

// Busca em arrays do tipo [{ modelCode: "HLRD", score: 700 }, ...]
function pickFromArrayByKey(
  obj: unknown,
  arrPath: string[],
  matchKey: string,
  matchVal: string,
  valuePath: string[],
): unknown {
  const arr = pickPath(obj, arrPath);
  if (!Array.isArray(arr)) return undefined;
  const found = arr.find(
    (it) => it && typeof it === "object" && (it as Record<string, unknown>)[matchKey] === matchVal,
  );
  if (!found) return undefined;
  return pickPath(found, valuePath);
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

    const simulacao = body?.simulacao === true;

    let serasa: SerasaResult;
    let fromCache = false;

    if (simulacao) {
      const nomeSim = typeof body?.nome === "string" && body.nome.trim().length > 0
        ? body.nome.trim()
        : "Cliente Simulado";
      const scoreSim = Number.isFinite(body?.score) ? Math.max(0, Math.min(1000, Number(body.score))) : 850;
      serasa = {
        nome: nomeSim,
        score: scoreSim,
        pendencias: [],
        totalPendencias: 0,
        somaPendencias: 0,
        raw: { simulacao: true, dataNascimento: body?.dataNascimento ?? null },
        dataNascimento: body?.dataNascimento ?? null,
      } as SerasaResult;

      // Salva também simulações no cache para aparecerem em "Consultas Salvas"
      const { error: cacheSimErr } = await supabase
        .from("consultas_cache")
        .upsert({
          cpf,
          nome: serasa.nome,
          data_nascimento: serasa.dataNascimento,
          score: serasa.score,
          raw: serasa.raw as never,
          pendencias: serasa.pendencias as never,
          total_pendencias: serasa.totalPendencias,
          soma_pendencias: serasa.somaPendencias,
          consultado_em: new Date().toISOString(),
          expira_em: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "cpf" });
      if (cacheSimErr) console.error("Erro ao salvar cache (simulação):", cacheSimErr);
    } else {
      // 1) Tenta buscar do cache (válido por 3 meses)
      const { data: cached } = await supabase
        .from("consultas_cache")
        .select("*")
        .eq("cpf", cpf)
        .gt("expira_em", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        fromCache = true;
        serasa = {
          nome: cached.nome ?? "Cliente",
          score: cached.score ?? 0,
          pendencias: (cached.pendencias as Pendencia[]) ?? [],
          totalPendencias: cached.total_pendencias ?? 0,
          somaPendencias: Number(cached.soma_pendencias ?? 0),
          raw: cached.raw,
          dataNascimento: cached.data_nascimento,
        };
      } else {
        // 2) Cache miss → consulta Serasa
        serasa = await consultarSerasa(cpf);

        // 3) Salva/atualiza cache (upsert por CPF)
        const { error: cacheErr } = await supabase
          .from("consultas_cache")
          .upsert({
            cpf,
            nome: serasa.nome,
            data_nascimento: serasa.dataNascimento,
            score: serasa.score,
            raw: serasa.raw as never,
            pendencias: serasa.pendencias as never,
            total_pendencias: serasa.totalPendencias,
            soma_pendencias: serasa.somaPendencias,
            consultado_em: new Date().toISOString(),
            expira_em: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          }, { onConflict: "cpf" });
        if (cacheErr) console.error("Erro ao salvar cache:", cacheErr);
      }
    }

    const { error: insertErr } = await supabase.from("consultas").insert({
      user_id: userData.user.id,
      cpf,
      nome: serasa.nome,
      score: serasa.score,
      status: simulacao ? "simulacao" : (fromCache ? "cache" : "sucesso"),
      raw: serasa.raw as never,
    });
    if (insertErr) console.error("Erro ao gravar consulta:", insertErr);

    return jsonResp({
      cpf,
      nome: serasa.nome,
      score: serasa.score,
      dataNascimento: serasa.dataNascimento,
      pendencias: serasa.pendencias,
      totalPendencias: serasa.totalPendencias,
      somaPendencias: serasa.somaPendencias,
      provider: simulacao ? "simulacao" : (fromCache ? "cache" : "serasa"),
      fromCache,
      simulacao,
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
