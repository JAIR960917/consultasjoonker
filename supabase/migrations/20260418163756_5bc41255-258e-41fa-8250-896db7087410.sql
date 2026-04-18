ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS score_tiers jsonb NOT NULL DEFAULT '[
  {"min":0,"max":100,"entry_percent":100,"rate":0},
  {"min":101,"max":299,"entry_percent":35,"rate":4.0},
  {"min":300,"max":400,"entry_percent":30,"rate":3.5},
  {"min":401,"max":500,"entry_percent":25,"rate":3.0},
  {"min":501,"max":600,"entry_percent":20,"rate":2.5},
  {"min":601,"max":1000,"entry_percent":15,"rate":2.0}
]'::jsonb;

UPDATE public.settings
SET score_tiers = '[
  {"min":0,"max":100,"entry_percent":100,"rate":0},
  {"min":101,"max":299,"entry_percent":35,"rate":4.0},
  {"min":300,"max":400,"entry_percent":30,"rate":3.5},
  {"min":401,"max":500,"entry_percent":25,"rate":3.0},
  {"min":501,"max":600,"entry_percent":20,"rate":2.5},
  {"min":601,"max":1000,"entry_percent":15,"rate":2.0}
]'::jsonb
WHERE score_tiers IS NULL OR score_tiers = '[]'::jsonb;