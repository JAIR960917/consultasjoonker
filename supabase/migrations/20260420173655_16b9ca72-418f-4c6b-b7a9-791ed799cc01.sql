UPDATE public.vendas v
SET primeiro_vencimento = to_date(m[1], 'DD/MM/YYYY')
FROM (
  SELECT venda_id, (regexp_match(content, 'vencimento[^0-9]{0,40}(\d{2}/\d{2}/\d{4})', 'i')) AS m
  FROM public.contracts
  WHERE venda_id IS NOT NULL
) c
WHERE v.id = c.venda_id
  AND v.primeiro_vencimento IS NULL
  AND c.m IS NOT NULL;