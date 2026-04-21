// Edge Function: gerar-relatorio-diario
// Gera o relatório de boletos pagos do dia anterior.
// Pode ser chamado por cron ou manualmente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Aceita data_referencia opcional via body (default: ontem em America/Sao_Paulo)
    const body = (await req.json().catch(() => ({}))) as { data_referencia?: string };
    const dataRef = body.data_referencia ?? ontemSP();

    const inicio = `${dataRef}T00:00:00-03:00`;
    const fim = `${dataRef}T23:59:59-03:00`;

    // Busca parcelas pagas no dia
    const { data: parcelas, error } = await admin
      .from("parcelas")
      .select("id, numero_parcela, total_parcelas, valor, valor_pago, pago_em, venda_id, contrato_id, linha_digitavel, cora_invoice_id")
      .eq("status", "pago")
      .gte("pago_em", inicio)
      .lte("pago_em", fim);

    if (error) throw error;

    // Enriquece com nome/cpf do cliente via contracts ou vendas
    const pagamentos: any[] = [];
    for (const p of parcelas ?? []) {
      let nome = "—";
      let cpf = "—";
      if (p.contrato_id) {
        const { data: c } = await admin
          .from("contracts")
          .select("nome, cpf")
          .eq("id", p.contrato_id)
          .maybeSingle();
        if (c) { nome = c.nome; cpf = c.cpf; }
      } else if (p.venda_id) {
        const { data: v } = await admin
          .from("vendas")
          .select("nome, cpf")
          .eq("id", p.venda_id)
          .maybeSingle();
        if (v) { nome = v.nome ?? "—"; cpf = v.cpf; }
      }

      pagamentos.push({
        nome,
        cpf,
        numero_parcela: p.numero_parcela,
        total_parcelas: p.total_parcelas,
        valor: Number(p.valor_pago ?? p.valor),
        pago_em: p.pago_em,
        venda_id: p.venda_id,
        contrato_id: p.contrato_id,
      });
    }

    pagamentos.sort((a, b) => (a.pago_em ?? "").localeCompare(b.pago_em ?? ""));
    const valorTotal = pagamentos.reduce((s, x) => s + Number(x.valor || 0), 0);

    // Upsert (1 por dia)
    const { data: rel, error: upErr } = await admin
      .from("relatorios_diarios")
      .upsert({
        data_referencia: dataRef,
        status: "pendente",
        total_pagamentos: pagamentos.length,
        valor_total: valorTotal,
        pagamentos,
      }, { onConflict: "data_referencia" })
      .select()
      .single();
    if (upErr) throw upErr;

    return json({ ok: true, relatorio: rel });
  } catch (err) {
    console.error("gerar-relatorio-diario error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Retorna a data de ontem em America/Sao_Paulo no formato YYYY-MM-DD
function ontemSP(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const hojeStr = fmt.format(new Date()); // YYYY-MM-DD
  const [y, m, d] = hojeStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
