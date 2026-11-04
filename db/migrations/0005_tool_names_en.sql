-- Nomes das tools do agent em inglês (buscar_artigos → search_articles etc.). Os nomes ficam gravados na trilha
-- dos runs, nas tentativas das passagens e na memória do Mastra (que o modelo relê como histórico).
-- Os seis nomes antigos são tokens únicos: nenhum texto de tela os contém.
CREATE FUNCTION pg_temp.nexo_tool_names_en(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(replace(replace(t,
    'buscar_meus_chamados', 'list_my_tickets'),
    'buscar_artigos', 'search_articles'),
    'ver_chamado', 'get_ticket'),
    'montar_rascunho', 'build_draft'),
    'oferecer_opcoes', 'offer_options'),
    'transferir_para_analista', 'transfer_to_analyst')
$$;--> statement-breakpoint
UPDATE "ai_agent_runs" SET "tool_calls" = pg_temp.nexo_tool_names_en("tool_calls"::text)::jsonb
  WHERE "tool_calls"::text ~ '(buscar_meus_chamados|buscar_artigos|ver_chamado|montar_rascunho|oferecer_opcoes|transferir_para_analista)';--> statement-breakpoint
UPDATE "handoffs" SET "attempts" = pg_temp.nexo_tool_names_en("attempts"::text)::jsonb
  WHERE "attempts"::text ~ '(buscar_meus_chamados|buscar_artigos|ver_chamado|montar_rascunho|oferecer_opcoes|transferir_para_analista)';--> statement-breakpoint
-- A memória do Mastra é criada em runtime: só existe num banco que já rodou o agent.
DO $$
BEGIN
  IF to_regclass('mastra.mastra_messages') IS NOT NULL THEN
    UPDATE mastra.mastra_messages SET content = pg_temp.nexo_tool_names_en(content)
      WHERE content ~ '(buscar_meus_chamados|buscar_artigos|ver_chamado|montar_rascunho|oferecer_opcoes|transferir_para_analista)';
  END IF;
END $$;
