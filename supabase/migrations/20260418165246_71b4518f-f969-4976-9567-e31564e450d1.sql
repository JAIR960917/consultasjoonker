-- Adicionar entrada mínima e sugerida separadas em cada faixa de score
UPDATE public.settings
SET score_tiers = '[
  {"min":0,"max":100,"entry_suggested_percent":100,"entry_min_percent":100,"rate":0},
  {"min":101,"max":299,"entry_suggested_percent":40,"entry_min_percent":35,"rate":4.0},
  {"min":300,"max":400,"entry_suggested_percent":35,"entry_min_percent":30,"rate":3.5},
  {"min":401,"max":500,"entry_suggested_percent":30,"entry_min_percent":25,"rate":3.0},
  {"min":501,"max":600,"entry_suggested_percent":25,"entry_min_percent":20,"rate":2.5},
  {"min":601,"max":1000,"entry_suggested_percent":20,"entry_min_percent":15,"rate":2.0}
]'::jsonb;