// Edge Function: gerar-relatorio-diario
// Gera um relatório de boletos pagos POR EMPRESA.
// Regra: em dias úteis (ter-sex), pega pagamentos do dia anterior.
// Nas segundas-feiras, pega pagamentos de sábado + domingo (fim de semana).
// Pode ser chamado por cron (gera para todas as empresas ativas) ou manualmente
// (com empresa_id específico).

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

    const body = (await req.json().catch(() => ({}))) as {
      data_referencia?: string;
      data_inicio?: string;
      data_fim?: string;
      empresa_id?: string;
    };

    let dataInicio: string;
    let dataFim: string;
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

    // Busca empresas a processar
    let empresas: Array<{ id: string; nome: string }> = [];
    if (body.empresa_id) {
      const { data } = await admin
        .from("empresas").select("id, nome").eq("id", body.empresa_id).maybeSingle();
      if (data) empresas = [data];
    } else {
      const { data } = await admin
        .from("empresas").select("id, nome").eq("ativo", true);
      empresas = data ?? [];
    }

    // Se não houver empresas cadastradas, ainda gera 1 relatório "sem empresa"
    // (compatibilidade com dados antigos antes do multi-empresa).
    if (empresas.length === 0) {
      empresas = [{ id: "", nome: "(sem empresa)" }];
    }

    const inicioISO = `${dataInicio}T00:00:00-03:00`;
    const fimISO = `${dataFim}T23:59:59-03:00`;
    const relatoriosGerados: any[] = [];

    for (const empresa of empresas) {
      const empresaIdReal = empresa.id || null;

      // Busca parcelas pagas no intervalo, filtradas pela empresa
      let q = admin
        .from("parcelas")
        .select("id, numero_parcela, total_parcelas, valor, valor_pago, pago_em, venda_id, contrato_id, linha_digitavel, cora_invoice_id, empresa_id")
        .eq("status", "pago")
        .gte("pago_em", inicioISO)
        .lte("pago_em", fimISO);

      if (empresaIdReal) q = q.eq("empresa_id", empresaIdReal);
      else q = q.is("empresa_id", null);

      const { data: parcelas, error } = await q;
      if (error) throw error;

      const pagamentos: any[] = [];
      for (const p of parcelas ?? []) {
        let nome = "—";
        let cpf = "—";
        if (p.contrato_id) {
          const { data: c } = await admin
            .from("contracts").select("nome, cpf").eq("id", p.contrato_id).maybeSingle();
          if (c) { nome = c.nome; cpf = c.cpf; }
        } else if (p.venda_id) {
          const { data: v } = await admin
            .from("vendas").select("nome, cpf").eq("id", p.venda_id).maybeSingle();
          if (v) { nome = v.nome ?? "—"; cpf = v.cpf; }
        }

        pagamentos.push({
          nome, cpf,
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

      // Upsert por (data_referencia, empresa_id)
      const { data: rel, error: upErr } = await admin
        .from("relatorios_diarios")
        .upsert({
          data_referencia: dataRef,
          empresa_id: empresaIdReal,
          status: "pendente",
          total_pagamentos: pagamentos.length,
          valor_total: valorTotal,
          pagamentos,
        }, { onConflict: "data_referencia,empresa_id" })
        .select()
        .single();
      if (upErr) throw upErr;

      relatoriosGerados.push({ empresa: empresa.nome, relatorio: rel });
    }

    return json({
      ok: true,
      intervalo: { inicio: dataInicio, fim: dataFim },
      relatorios: relatoriosGerados,
    });
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

function calcularIntervaloAutomatico(): { inicio: string; fim: string } {
  const hojeSP = dataSP(new Date());
  const [y, m, d] = hojeSP.split("-").map(Number);
  const hojeUTC = new Date(Date.UTC(y, m - 1, d));
  const diaSemana = hojeUTC.getUTCDay();

  if (diaSemana === 1) {
    const sabado = new Date(hojeUTC);
    sabado.setUTCDate(sabado.getUTCDate() - 2);
    const domingo = new Date(hojeUTC);
    domingo.setUTCDate(domingo.getUTCDate() - 1);
    return {
      inicio: sabado.toISOString().slice(0, 10),
      fim: domingo.toISOString().slice(0, 10),
    };
  }

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
  return fmt.format(d);
}
