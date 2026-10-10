// ============================================================================
// CONFIGURAÇÃO DO HUB
// Preencha depois de criar o projeto no Supabase (Project Settings > API).
// A "anon key" (ou "publishable key") pode ficar aqui: ela foi feita para o
// navegador. A segurança real está nas regras de RLS do schema.sql.
//
// Enquanto SUPABASE_URL estiver com o valor de exemplo, o hub abre em
// MODO DEMONSTRAÇÃO: dados fictícios, nada é salvo.
// ============================================================================
window.HUB_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",       // AJUSTE AQUI
  SUPABASE_ANON_KEY: "sb_publishable_SUBSTITUA_PELA_SUA_CHAVE", // AJUSTE AQUI
};
