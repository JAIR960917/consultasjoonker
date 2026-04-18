// Consulta CPF — modo MOCK (Serasa pluga aqui depois).
// Retorna nome/cpf/score determinístico (mesmo CPF = mesmo score) para UX consistente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOMES = [
  "Ana Paula Souza", "Carlos Eduardo Lima", "Mariana Ribeiro Alves",
  "João Pedro Martins", "Beatriz Carvalho Nogueira", "Rafael Almeida Pinto",
  "Larissa Mendes Rocha", "Gustavo Henrique Dias", "Fernanda Costa Vieira",
  "Bruno Oliveira Santos", "Patrícia Ferreira Gomes", "Diego Barbosa Cunha",
];

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function isValidCPF(cpf: string): boolean {
  const c = onlyDigits(cpf);
  if (c.length !== 11) return false;
  if (/^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const cpf = onlyDigits(body.cpf || "");

    if (!isValidCPF(cpf)) {
      return new Response(JSON.stringify({ error: "CPF inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mock determinístico
    const h = hash(cpf);
    const nome = NOMES[h % NOMES.length];
    // score 300..950
    const score = 300 + (h % 651);

    const result = {
      cpf,
      nome,
      score,
      data_nascimento: null,
      consultado_em: new Date().toISOString(),
      provider: "mock",
    };

    // Grava histórico
    await supabase.from("consultas").insert({
      user_id: userData.user.id,
      cpf,
      nome,
      score,
      status: "sucesso",
      raw: result,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("consulta-cpf error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
