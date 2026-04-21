// Edge Function: gerar-relatorio-diario
// Gera o relatório de boletos pagos.
// Regra: em dias úteis (ter-sex), pega pagamentos do dia anterior.
// Nas segundas-feiras, pega pagamentos de sábado + domingo (fim de semana).
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

    // Aceita data_referencia opcional via body. Se vier, gera SÓ aquele dia.
    // Se não vier, calcula automaticamente:
    //  - Segunda: agrupa sábado + domingo (data_referencia = domingo)
    //  - Demais dias: dia anterior
    const body = (await req.json().catch(() => ({}))) as {
      data_referencia?: string;
      data_inicio?: string;
      data_fim?: string;
    };

    let dataInicio: string;
    let dataFim: string; // data_referencia do registro (usada como chave única)
    let dataRef: string;

    if (body.data_inicio && body.data_fim) {
      dataInicio = body.data_inicio;
      dataFim = body.data_fim;
      dataRef = body.data_fim;
    } else if (body.data_referencia) {
      dataInicio = body.data_referencia;
      dataFim = body.data_referencia;
      dataRef = body.data_referencia;
    } else {
      const range = calcularIntervaloAutomatico();
      dataInicio = range.inicio;
      dataFim = range.fim;
      dataRef = range.fim;
    }

    const inicioISO = `${dataInicio}T00:00:00-03:00`;
    const fimISO = `${dataFim}T23:59:59-03:00`;

    // Busca parcelas pagas no intervalo
    const { data: parcelas, error } = await admin
      .from("parcelas")
      .select("id, numero_parcela, total_parcelas, valor, valor_pago, pago_em, venda_id, contrato_id, linha_digitavel, cora_invoice_id")
      .eq("status", "pago")
      .gte("pago_em", inicioISO)
      .lte("pago_em", fimISO);

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

    // Upsert (1 por data_referencia)
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

    return json({ ok: true, relatorio: rel, intervalo: { inicio: dataInicio, fim: dataFim } });
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

// Calcula intervalo automático em America/Sao_Paulo:
// - Segunda-feira: sábado 00:00 → domingo 23:59 (data_ref = domingo)
// - Demais dias: dia anterior (data_ref = ontem)
function calcularIntervaloAutomatico(): { inicio: string; fim: string } {
  const hojeSP = dataSP(new Date());
  const [y, m, d] = hojeSP.split("-").map(Number);
  // Date em UTC representando o dia "hoje" em SP
  const hojeUTC = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0=domingo, 1=segunda, ..., 6=sábado
  const diaSemana = hojeUTC.getUTCDay();

  if (diaSemana === 1) {
    // Segunda-feira: pega sábado + domingo
    const sabado = new Date(hojeUTC);
    sabado.setUTCDate(sabado.getUTCDate() - 2);
    const domingo = new Date(hojeUTC);
    domingo.setUTCDate(domingo.getUTCDate() - 1);
    return {
      inicio: sabado.toISOString().slice(0, 10),
      fim: domingo.toISOString().slice(0, 10),
    };
  }

  // Outros dias: dia anterior
  const ontem = new Date(hojeUTC);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const ymd = ontem.toISOString().slice(0, 10);
  return { inicio: ymd, fim: ymd };
}

function dataSP(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}
