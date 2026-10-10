// ============================================================================
// HUB DO MESTRADO: aplicativo
// Vanilla JS, sem build. Dados no Supabase (ou em memória, no modo
// demonstração). Regras de cálculo em nucleo.js.
//
// Segurança: todo dado do usuário inserido em HTML passa por esc().
// ============================================================================
(function () {
  "use strict";
  const N = window.Nucleo;
  const CFG = window.HUB_CONFIG || {};
  const DEMO = !CFG.SUPABASE_URL || /SEU-PROJETO/.test(CFG.SUPABASE_URL) || !window.supabase;

  // --------------------------------------------------------------------------
  // Utilidades
  // --------------------------------------------------------------------------
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = N.escHTML;
  const HOJE = () => N.hoje();
  const DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
  const DIAS_CURTO = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const hm = (t) => (t ? String(t).slice(0, 5) : "");
  const fmtD = (s) => s ? N.parse(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "";
  const fmtDia = (s) => s ? DIAS[N.diaSemana(s)] + ", " + fmtD(s) : "";
  const fmtLongo = (s) => s ? N.parse(s).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const fmtH = (min) => { min = Math.round(min || 0); const h = Math.floor(min / 60), m = min % 60; return h ? h + "h" + (m ? N.pad(m) : "") : m + "min"; };
  const num = (n) => (Number(n) || 0).toLocaleString("pt-BR");
  const plural = (n, s, p) => n + " " + (n === 1 ? s : p);
  function rel(s) {
    if (!s) return "";
    const n = N.diasEntre(HOJE(), s);
    if (n === 0) return "hoje";
    if (n === 1) return "amanhã";
    if (n === -1) return "ontem";
    return n > 0 ? "em " + n + " dias" : "há " + -n + " dias";
  }
  function prazoPill(p, feito) {
    if (!p) return "";
    if (feito) return '<span class="pill ok">' + esc(fmtD(p)) + "</span>";
    const n = N.diasEntre(HOJE(), p);
    if (n < 0) return '<span class="pill danger">atrasado ' + -n + "d</span>";
    if (n === 0) return '<span class="pill danger">hoje</span>';
    if (n === 1) return '<span class="pill warn">amanhã</span>';
    if (n <= 7) return '<span class="pill warn">em ' + n + " dias</span>";
    return '<span class="pill">' + esc(fmtD(p)) + "</span>";
  }
  function bar(v, max, cls) {
    const p = max > 0 ? Math.min(100, Math.round((v / max) * 100)) : 0;
    return '<div class="bar ' + (cls || "") + '" role="progressbar" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + p + '%"></i></div>';
  }
  const tamanho = (b) => !b ? "" : b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  const nomeSeguro = (n) => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
  const tituloDoArquivo = (n) => String(n).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const ehPDF = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const empty = (txt, botao) => '<div class="empty">' + txt + (botao ? "<div>" + botao + "</div>" : "") + "</div>";
  const icon = {
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  };

  let toastT;
  function toast(m, ms) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms || 3600); }
  function msgErro(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || "");
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    if (/JWT|expired|refresh token/i.test(m)) return "Sua sessão expirou. Entre novamente.";
    if (/mime|not supported|invalid_mime/i.test(m)) return "Tipo de arquivo não aceito. Use PDF, Word, ODT, EPUB ou PowerPoint.";
    if (/size|too large|exceeded/i.test(m)) return "Arquivo maior que o limite de 50 MB.";
    if (/row-level security|violates/i.test(m)) return "O servidor recusou a alteração. Entre novamente e tente de novo.";
    return "Não foi possível concluir: " + m;
  }
  const falha = (e) => { console.error(e); toast(msgErro(e), 6000); };

  // --------------------------------------------------------------------------
  // Camada de dados
  // --------------------------------------------------------------------------
  const TABELAS = ["disciplinas", "leituras", "citacoes", "tarefas", "materiais", "capitulos", "marcos", "reunioes", "blocos", "sessoes"];

  function apiSupabase() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    let uid = null;
    const ok = (r) => { if (r.error) throw r.error; return r.data; };
    async function tudo(t) {
      const out = []; let i = 0;
      for (;;) {
        const d = ok(await sb.from(t).select("*").order("created_at", { ascending: true }).range(i, i + 999));
        out.push(...d); if (d.length < 1000) return out; i += 1000;
      }
    }
    return {
      demo: false,
      async sessao() { const { data } = await sb.auth.getSession(); uid = data.session ? data.session.user.id : null; return data.session; },
      aoMudarSessao(fn) { sb.auth.onAuthStateChange((ev, s) => { uid = s ? s.user.id : null; fn(ev, s); }); },
      async enviarLink(email) { ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } })); },
      async verificarCodigo(email, token) { ok(await sb.auth.verifyOtp({ email, token, type: "email" })); },
      sair() { return sb.auth.signOut(); },
      async carregar() {
        const res = await Promise.all(TABELAS.map(tudo));
        const out = {}; TABELAS.forEach((t, i) => (out[t] = res[i]));
        out.profile = ok(await sb.from("profiles").select("*").eq("id", uid).maybeSingle());
        out.dissertacao = ok(await sb.from("dissertacao").select("*").maybeSingle());
        return out;
      },
      async inserir(t, row) { return ok(await sb.from(t).insert(row).select().single()); },
      async atualizar(t, id, patch) { return ok(await sb.from(t).update(patch).eq("id", id).select().single()); },
      async apagar(t, id) { ok(await sb.from(t).delete().eq("id", id)); },
      async salvarDissertacao(row) { return ok(await sb.from("dissertacao").upsert(Object.assign({}, row, { user_id: uid })).select().single()); },
      async salvarPerfil(patch) { return ok(await sb.from("profiles").update(patch).eq("id", uid).select().single()); },
      async enviar(file, pasta) {
        const path = uid + "/" + pasta + "/" + uuid() + "-" + nomeSeguro(file.name);
        ok(await sb.storage.from("arquivos").upload(path, file, { contentType: file.type || undefined, upsert: false }));
        return path;
      },
      async linkArquivo(path) { return ok(await sb.storage.from("arquivos").createSignedUrl(path, 3600)).signedUrl; },
      async apagarArquivo(path) { ok(await sb.storage.from("arquivos").remove([path])); },
    };
  }

  function apiDemo() {
    const db = dadosDemo();
    const blobs = new Map();
    const agora = () => new Date().toISOString();
    return {
      demo: true,
      async sessao() { return { user: { email: "demonstracao@exemplo.com" } }; },
      aoMudarSessao() {},
      async enviarLink() {}, async verificarCodigo() {}, sair() { toast("No modo demonstração não há conta para sair."); },
      async carregar() { return JSON.parse(JSON.stringify(db)); },
      async inserir(t, row) { const r = Object.assign({ id: uuid(), created_at: agora() }, row); db[t].push(r); return JSON.parse(JSON.stringify(r)); },
      async atualizar(t, id, patch) { const r = db[t].find((x) => x.id === id); Object.assign(r, patch); return JSON.parse(JSON.stringify(r)); },
      async apagar(t, id) {
        db[t] = db[t].filter((x) => x.id !== id);
        if (t === "leituras") db.citacoes = db.citacoes.filter((c) => c.leitura_id !== id);
      },
      async salvarDissertacao(row) { db.dissertacao = Object.assign({}, db.dissertacao, row); return db.dissertacao; },
      async salvarPerfil(patch) { Object.assign(db.profile, patch); return db.profile; },
      async enviar(file, pasta) { const p = "demo/" + pasta + "/" + uuid() + "-" + nomeSeguro(file.name); blobs.set(p, URL.createObjectURL(file)); return p; },
      async linkArquivo(path) { if (blobs.has(path)) return blobs.get(path); throw new Error("Arquivo de exemplo: não há PDF real no modo demonstração."); },
      async apagarArquivo(path) { blobs.delete(path); },
    };
  }

  let api = null; // criado em iniciar(), depois que tudo foi definido

  // --------------------------------------------------------------------------
  // Estado
  // --------------------------------------------------------------------------
  const S = { carregado: false, sessao: null, profile: null, dissertacao: null };
  TABELAS.forEach((t) => (S[t] = []));
  const UI = {
    leitStatus: "abertas", leitDest: "", leitQ: "",
    citQ: "", citDest: "",
    tarFiltro: "abertas", tarDest: "",
    menu: false, confirmar: null, salvoCampo: null,
  };
  let rota = { v: "inicio", id: null };
  let erroLogin = "", loginEmail = "", loginEnviado = false, loginOcupado = false;
  let instalar = null;

  async function recarregar() {
    try {
      const d = await api.carregar();
      TABELAS.forEach((t) => (S[t] = d[t] || []));
      S.profile = d.profile || { meta_horas_semana: 15 };
      S.dissertacao = d.dissertacao || null;
      S.carregado = true;
    } catch (e) { falha(e); }
    render();
  }
  const achar = (t, id) => S[t].find((x) => x.id === id);
  async function criar(t, row) {
    try { const r = await api.inserir(t, row); S[t].push(r); render(); return r; }
    catch (e) { falha(e); return null; }
  }
  async function alterar(t, id, patch) {
    const antes = achar(t, id); if (!antes) return null;
    Object.assign(antes, patch); render();
    try { const r = await api.atualizar(t, id, patch); Object.assign(antes, r); return r; }
    catch (e) { falha(e); await recarregar(); return null; }
  }
  async function excluir(t, id) {
    const row = achar(t, id); if (!row) return;
    try {
      await api.apagar(t, id);
      if (row.arquivo_path) { try { await api.apagarArquivo(row.arquivo_path); } catch (e) { console.warn(e); } }
      if (t === "disciplinas") { await recarregar(); return; }
      S[t] = S[t].filter((x) => x.id !== id);
      if (t === "leituras") S.citacoes = S.citacoes.filter((c) => c.leitura_id !== id);
      render(); toast("Excluído.");
    } catch (e) { falha(e); }
  }

  // --------------------------------------------------------------------------
  // Derivados (tudo calculado na hora)
  // --------------------------------------------------------------------------
  const disc = (id) => achar("disciplinas", id);
  const discsAtivas = () => S.disciplinas.filter((d) => d.ativa !== false).sort((a, b) => String(a.nome).localeCompare(b.nome));
  const destNome = (r) => r.para_dissertacao ? "Dissertação" : (disc(r.disciplina_id) || {}).nome || "";
  const destCor = (r) => r.para_dissertacao ? "var(--primary)" : (disc(r.disciplina_id) || {}).cor || "var(--muted)";
  const destTag = (r) => destNome(r) ? '<span class="tag"><span class="dot" style="background:' + esc(destCor(r)) + '"></span>' + esc(destNome(r)) + "</span>" : "";
  const destValor = (r) => r.para_dissertacao ? "diss" : r.disciplina_id || "";
  const casaDestino = (r, v) => !v || (v === "diss" ? r.para_dissertacao : r.disciplina_id === v);
  const lida = (l) => l.status === "Lido" || l.status === "Fichado";
  const ritmo = (l) => N.ritmoLeitura(l.paginas_total, l.paginas_lidas, l.prazo, HOJE());
  const proxAula = (d) => N.proximaAula(d, HOJE(), new Date());
  const minutosSemana = () => { const ini = N.inicioSemana(HOJE()); return S.sessoes.filter((s) => s.data >= ini).reduce((a, s) => a + (s.minutos || 0), 0); };
  const metaSemana = () => Number((S.profile || {}).meta_horas_semana) || 0;
  const tarefasAbertas = () => S.tarefas.filter((t) => !t.concluida);
  function progressoDiss() {
    const w = S.capitulos.reduce((a, c) => a + (c.palavras || 0), 0);
    const m = S.capitulos.reduce((a, c) => a + (c.meta_palavras || 0), 0);
    return { w, m, p: m ? Math.round((w / m) * 100) : 0 };
  }
  const proximoMarco = () => S.marcos.filter((m) => !m.concluido && m.data && m.data >= HOJE()).sort((a, b) => a.data.localeCompare(b.data))[0];

  // --------------------------------------------------------------------------
  // Rotas
  // --------------------------------------------------------------------------
  const NAV = [["inicio", "Início"], ["disciplinas", "Disciplinas"], ["leituras", "Leituras"], ["citacoes", "Citações"], ["tarefas", "Tarefas"], ["dissertacao", "Dissertação"], ["rotina", "Rotina"]];
  function lerHash() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    const [v, id] = h.split("/");
    if (VIEWS[v]) rota = { v, id: id || null };
  }
  function ir(v, id) {
    rota = { v, id: id || null }; UI.menu = false; UI.confirmar = null;
    try { history.pushState(null, "", "#" + v + (id ? "/" + id : "")); } catch (e) { /* sem histórico neste ambiente */ }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", () => { lerHash(); render(); });

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  function render() {
    const a = document.activeElement, aid = a && a.id;
    let sel = null; try { sel = a && a.selectionStart; } catch (e) { sel = null; }
    let html;
    if (!DEMO && !S.sessao) html = vLogin();
    else if (!S.carregado) html = '<div class="loading">Carregando seus dados…</div>';
    else html = casca((VIEWS[rota.v] || vInicio)());
    $("#root").innerHTML = html;
    if (aid) {
      const el = document.getElementById(aid);
      if (el && el !== document.activeElement) { el.focus(); try { if (sel != null && el.setSelectionRange) el.setSelectionRange(sel, sel); } catch (e) { /* campo sem cursor */ } }
    }
  }

  function vLogin() {
    const topo = '<span class="sig">§</span><div><h1>Hub do Mestrado</h1><p class="muted" style="margin-top:6px">Disciplinas, leituras, fichamentos e dissertação em um só lugar.</p></div>';
    const erro = erroLogin ? '<p class="err">' + esc(erroLogin) + "</p>" : "";
    if (!loginEnviado) {
      return '<div class="login"><form class="login-card" data-form="login">' + topo +
        '<div class="f"><label for="login-email">Seu e-mail</label><input type="email" id="login-email" required autocomplete="email" value="' + esc(loginEmail) + '" placeholder="nome@gmail.com"></div>' +
        '<button class="btn primary" style="padding:11px"' + (loginOcupado ? " disabled" : "") + ">" + (loginOcupado ? "Enviando…" : "Receber link de acesso") + "</button>" + erro +
        '<p class="xs muted">Sem senha: você recebe um link no e-mail. Acesso restrito; cada pessoa vê apenas os próprios dados.</p></form></div>';
    }
    return '<div class="login"><form class="login-card" data-form="codigo">' + topo +
      '<p>Enviamos um e-mail para <b>' + esc(loginEmail) + '</b>. Abra o link para entrar.</p>' +
      '<div class="f"><label for="login-codigo">Ou digite o código do e-mail</label><input type="text" id="login-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="código"></div>' +
      '<button class="btn primary" style="padding:11px"' + (loginOcupado ? " disabled" : "") + ">Entrar com o código</button>" + erro +
      '<p class="xs muted">No aplicativo instalado no iPhone, use o código: o link abre no Safari, fora do app. Não chegou? Veja o spam ou <a href="#" data-act="loginVoltar">use outro e-mail</a>.</p></form></div>';
  }

  function casca(conteudo) {
    const email = S.sessao && S.sessao.user ? S.sessao.user.email : "";
    const nome = (S.profile && S.profile.full_name) || email;
    const ini = String(nome || "?").trim().charAt(0).toUpperCase();
    const navAtual = { disciplina: "disciplinas", leitura: "leituras" }[rota.v] || rota.v;
    return (DEMO ? '<div class="demo-bar">Modo demonstração: dados fictícios, nada é salvo. Configure o Supabase (veja o GUIA.md) para usar de verdade.</div>' : "") +
      '<header class="topbar"><div class="topbar-in">' +
      '<button class="brand" data-act="nav" data-v="inicio" aria-label="Início"><span class="sig">§</span><b>Mestrado</b></button>' +
      '<nav class="nav" aria-label="Seções">' + NAV.map(([k, l]) => '<button data-act="nav" data-v="' + k + '"' + (navAtual === k ? ' aria-current="page"' : "") + ">" + l + "</button>").join("") + "</nav>" +
      '<div class="top-actions"><button class="btn primary" data-act="depositar">' + icon.up + '<span class="lbl">Depositar textos</span></button>' +
      '<button class="avatar" data-act="menu" aria-label="Menu da conta" aria-expanded="' + UI.menu + '">' + esc(ini) + "</button></div>" +
      (UI.menu ? '<div class="menu"><div class="who">' + esc(nome) + (email && email !== nome ? "<br>" + esc(email) : "") + "</div>" +
        (!ehStandalone() ? '<button data-act="instalar">Instalar como aplicativo</button>' : "") +
        '<button data-act="editarMeta">Meta semanal de estudo</button>' +
        '<button data-act="sair">Sair</button></div>' : "") +
      "</div></header>" +
      '<main class="page">' + conteudo + "</main>";
  }

  // ---------------------------- INÍCIO --------------------------------------
  function itensAgenda(de, ate) {
    const it = [];
    discsAtivas().forEach((d) => N.aulasEntre(d, de, ate).forEach((dt) => it.push({ d: dt, k: "Aula", v: esc(d.nome) + (d.hora_inicio ? ' <span class="muted mono xs">' + hm(d.hora_inicio) + "</span>" : ""), act: 'data-act="nav" data-v="disciplina" data-id="' + esc(d.id) + '"', ord: hm(d.hora_inicio) || "99" })));
    S.leituras.filter((l) => l.prazo && !lida(l) && l.prazo >= de && l.prazo <= ate).forEach((l) => {
      const r = ritmo(l);
      it.push({ d: l.prazo, k: "Ler", v: esc(l.titulo) + (r.restante ? ' <span class="muted xs">faltam ' + r.restante + " p.</span>" : ""), act: 'data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"', ord: "50" });
    });
    S.tarefas.filter((t) => !t.concluida && t.prazo && t.prazo >= de && t.prazo <= ate).forEach((t) =>
      it.push({ d: t.prazo, k: t.tipo || "Tarefa", v: esc(t.titulo) + (t.prioridade === "Alta" ? ' <span class="pill mark">alta</span>' : ""), act: 'data-act="editar" data-t="tarefas" data-id="' + esc(t.id) + '"', ord: "60" }));
    S.marcos.filter((m) => !m.concluido && m.data && m.data >= de && m.data <= ate).forEach((m) =>
      it.push({ d: m.data, k: "Marco", v: "<b>" + esc(m.titulo) + "</b>", act: 'data-act="nav" data-v="dissertacao"', ord: "10" }));
    S.reunioes.filter((r) => r.data >= de && r.data <= ate).forEach((r) =>
      it.push({ d: r.data, k: "Orient.", v: "Reunião de orientação", act: 'data-act="editar" data-t="reunioes" data-id="' + esc(r.id) + '"', ord: "20" }));
    return it;
  }
  function vInicio() {
    const hj = HOJE(), fim = N.somarDias(hj, 6);
    const h = new Date().getHours();
    const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    const nome = ((S.profile && S.profile.full_name) || "").split(" ")[0];
    const wm = minutosSemana(), meta = metaSemana() * 60;
    const abertas = tarefasAbertas();
    const atrasT = abertas.filter((t) => t.prazo && t.prazo < hj);
    const atrasL = S.leituras.filter((l) => l.prazo && l.prazo < hj && !lida(l));
    const semanaL = S.leituras.filter((l) => l.prazo && l.prazo >= hj && l.prazo <= fim && !lida(l));
    const pagRest = semanaL.reduce((a, l) => a + ritmo(l).restante, 0);
    const pagDia = semanaL.reduce((a, l) => a + (ritmo(l).porDia || 0), 0);
    const dp = progressoDiss(), pm = proximoMarco();
    const lendo = S.leituras.filter((l) => l.status === "Lendo");

    const itens = itensAgenda(hj, fim);
    let agenda = "";
    for (let i = 0; i < 7; i++) {
      const d = N.somarDias(hj, i);
      const doDia = itens.filter((x) => x.d === d).sort((a, b) => a.ord.localeCompare(b.ord));
      if (!doDia.length && i > 0) continue;
      agenda += '<div class="ag-day' + (i === 0 ? " today" : "") + '"><div class="ag-date"><b>' + (i === 0 ? "Hoje" : i === 1 ? "Amanhã" : esc(DIAS_CURTO[N.diaSemana(d)]) + " " + N.parse(d).getDate()) + "</b><span>" + esc(fmtD(d)) + "</span></div>" +
        '<div class="ag-items">' + (doDia.length ? doDia.map((x) => '<div class="ag-item clickable" ' + x.act + '><span class="k">' + esc(x.k) + '</span><span class="v">' + x.v + "</span></div>").join("") : '<span class="muted small">Nada com data marcada.</span>') + "</div></div>";
    }
    const atrasados = atrasT.length + atrasL.length ? '<div class="panel" style="border-color:var(--danger)"><div class="panel-h"><h2>Atrasados</h2><span class="pill danger">' + (atrasT.length + atrasL.length) + "</span></div><div class=\"list\">" +
      atrasL.map((l) => '<div class="row clickable" data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"><div class="grow"><div class="t">' + esc(l.titulo) + '</div><div class="s">Leitura · ' + destTag(l) + "</div></div>" + prazoPill(l.prazo) + "</div>").join("") +
      atrasT.map(linhaTarefa).join("") + "</div></div>" : "";

    return '<div class="head"><div><h1>' + saud + (nome ? ", " + esc(nome) : "") + '</h1><p class="sub">' + esc(new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })) + "</p></div>" +
      '<div class="actions"><button class="btn" data-act="novo" data-t="tarefas">+ Tarefa</button><button class="btn" data-act="novo" data-t="sessoes">+ Sessão de estudo</button></div></div>' +
      '<div class="metrics">' +
        '<div class="metric"><span class="label">Estudo na semana</span><span class="big">' + fmtH(wm) + " <small>de " + metaSemana() + "h</small></span>" + bar(wm, meta, wm >= meta && meta ? "ok" : "") + "</div>" +
        '<div class="metric"><span class="label">Leitura dos próximos 7 dias</span><span class="big">' + num(pagRest) + ' <small>páginas</small></span><span class="small muted">' + (pagDia ? "cerca de <b>" + num(pagDia) + "</b> por dia para cumprir os prazos" : "nenhuma leitura com prazo") + "</span></div>" +
        '<div class="metric"><span class="label">Tarefas abertas</span><span class="big">' + abertas.length + '</span><span class="small" style="color:' + (atrasT.length ? "var(--danger)" : "var(--muted)") + '">' + (atrasT.length ? plural(atrasT.length, "atrasada", "atrasadas") : "nenhuma atrasada") + "</span></div>" +
        '<div class="metric"><span class="label">Dissertação</span><span class="big">' + dp.p + "<small>%</small></span>" + bar(dp.w, dp.m) + '<span class="small muted">' + (pm ? esc(pm.titulo) + " " + rel(pm.data) : "sem marco futuro") + "</span></div>" +
      "</div>" +
      '<div class="cols"><div class="stack">' + atrasados +
        '<section class="panel"><div class="panel-h"><h2>Próximos 7 dias</h2><span class="xs muted">aulas calculadas pelo dia da semana de cada disciplina</span></div><div class="agenda">' + agenda + "</div></section></div>" +
      '<div class="stack">' +
        '<section class="panel"><div class="panel-h"><h2>Cronômetro</h2></div>' + htmlCronometro() + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Lendo agora</h2><button class="btn ghost sm" data-act="nav" data-v="leituras">Biblioteca</button></div>' +
          (lendo.length ? '<div class="list">' + lendo.map((l) => { const r = ritmo(l); return '<div class="row clickable" data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"><div class="grow"><div class="t">' + esc(l.titulo) + '</div><div style="margin:6px 0 4px">' + bar(l.paginas_lidas, l.paginas_total) + '</div><div class="s"><span class="mono">' + (l.paginas_lidas || 0) + "/" + (l.paginas_total || "?") + " p.</span>" + (r.porDia ? "<span>" + r.porDia + " p./dia até " + esc(fmtD(l.prazo)) + "</span>" : "") + "</div></div></div>"; }).join("") + "</div>"
            : empty("Nenhuma leitura em andamento.")) + "</section>" +
        '<div class="drop" data-act="depositar" data-drop="1"><b>Depositar textos</b><span class="small muted">Arraste PDFs para qualquer lugar do hub ou clique aqui. O hub conta as páginas, procura DOI ou ISBN e monta a referência.</span></div>' +
      "</div></div>";
  }

  // ---------------------------- DISCIPLINAS ---------------------------------
  function vDisciplinas() {
    const ativas = discsAtivas();
    const encerradas = S.disciplinas.filter((d) => d.ativa === false);
    const card = (d) => {
      const pa = proxAula(d);
      const paraAula = pa ? S.leituras.filter((l) => l.disciplina_id === d.id && !lida(l) && l.prazo && l.prazo <= pa) : [];
      const pags = paraAula.reduce((a, l) => a + ritmo(l).restante, 0);
      const ls = S.leituras.filter((l) => l.disciplina_id === d.id), feitas = ls.filter(lida).length;
      const tar = S.tarefas.filter((t) => t.disciplina_id === d.id && !t.concluida).length;
      return '<button class="dcard" style="--c:' + esc(d.cor || "var(--line)") + '" data-act="nav" data-v="disciplina" data-id="' + esc(d.id) + '">' +
        "<div><h3>" + esc(d.nome) + '</h3><div class="small muted">' + esc(d.professor || "") + "</div></div>" +
        '<div class="meta">' + (d.dia_semana != null ? "<span>" + esc(DIAS[d.dia_semana]) + (d.hora_inicio ? ", " + hm(d.hora_inicio) + (d.hora_fim ? " às " + hm(d.hora_fim) : "") : "") + "</span>" : "<span>dia da aula não informado</span>") + (d.semestre ? '<span class="mono">' + esc(d.semestre) + "</span>" : "") + "</div>" +
        (pa ? '<div class="kv"><span>Próxima aula</span><b>' + esc(fmtDia(pa)) + ' <span class="muted small">(' + rel(pa) + ")</span></b></div>" +
          '<div class="kv"><span>Para essa aula</span><span>' + (paraAula.length ? plural(paraAula.length, "texto", "textos") + " · " + pags + " p. restantes" : "nenhuma leitura pendente") + "</span></div>" : "") +
        '<div><div class="kv"><span>Leituras concluídas</span><span class="mono">' + feitas + "/" + ls.length + "</span></div>" + bar(feitas, ls.length, "ok") + "</div>" +
        '<div class="kv"><span>Tarefas abertas</span><span class="mono">' + tar + "</span></div></button>";
    };
    return '<div class="head"><div><h1>Disciplinas</h1><p class="sub">Cada disciplina reúne próxima aula, textos, tarefas e materiais.</p></div><button class="btn primary" data-act="novo" data-t="disciplinas">+ Nova disciplina</button></div>' +
      (ativas.length ? '<div class="cards">' + ativas.map(card).join("") + "</div>" : empty("Nenhuma disciplina cadastrada.", '<button class="btn" data-act="novo" data-t="disciplinas">+ Nova disciplina</button>')) +
      (encerradas.length ? '<section style="margin-top:28px"><div class="panel-h"><h2>Encerradas</h2></div><div class="cards">' + encerradas.map(card).join("") + "</div></section>" : "");
  }

  function vDisciplina() {
    const d = disc(rota.id);
    if (!d) return empty("Disciplina não encontrada.", '<button class="btn" data-act="nav" data-v="disciplinas">Voltar às disciplinas</button>');
    const pa = proxAula(d);
    const ls = S.leituras.filter((l) => l.disciplina_id === d.id).sort(ordemLeituras);
    const paraAula = pa ? ls.filter((l) => !lida(l) && l.prazo && l.prazo <= pa) : [];
    const ts = S.tarefas.filter((t) => t.disciplina_id === d.id).sort(ordemTarefas);
    const mats = S.materiais.filter((m) => m.disciplina_id === d.id);
    return '<button class="back" data-act="nav" data-v="disciplinas">← Disciplinas</button>' +
      '<div class="head"><div><h1 style="display:flex;gap:12px;align-items:center"><span class="dot" style="width:14px;height:14px;background:' + esc(d.cor || "var(--muted)") + '"></span>' + esc(d.nome) + "</h1>" +
      '<p class="sub">' + [d.professor, d.semestre, d.dia_semana != null ? DIAS[d.dia_semana] + (d.hora_inicio ? ", " + hm(d.hora_inicio) + (d.hora_fim ? " às " + hm(d.hora_fim) : "") : "") : ""].filter(Boolean).map(esc).join(" · ") + "</p></div>" +
      '<div class="actions"><button class="btn" data-act="editar" data-t="disciplinas" data-id="' + esc(d.id) + '">Editar</button><button class="btn primary" data-act="depositar" data-dest="' + esc(d.id) + '">' + icon.up + "Depositar textos</button></div></div>" +
      '<div class="cols"><div class="stack">' +
        '<section class="panel"><div class="panel-h"><h2>Textos</h2><button class="btn sm" data-act="novo" data-t="leituras" data-dest="' + esc(d.id) + '">+ Cadastrar sem arquivo</button></div>' +
          (ls.length ? '<div class="list">' + ls.map(linhaLeitura).join("") + "</div>" : '<div class="drop" data-act="depositar" data-dest="' + esc(d.id) + '"><b>Nenhum texto ainda</b><span class="small muted">Arraste os PDFs da disciplina aqui.</span></div>') + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Tarefas</h2></div>' + addRapido(d.id) +
          (ts.length ? '<div class="list" style="margin-top:10px">' + ts.map(linhaTarefa).join("") + "</div>" : "") + "</section>" +
      "</div><div class=\"stack\">" +
        '<section class="panel"><div class="panel-h"><h2>Próxima aula</h2></div>' +
          (pa ? '<p style="font-family:var(--f-display);font-size:1.35rem;text-transform:capitalize">' + esc(fmtDia(pa)) + '</p><p class="muted small" style="margin-bottom:12px">' + rel(pa) + (d.hora_inicio ? ", às " + hm(d.hora_inicio) : "") + "</p>" +
            (paraAula.length ? '<div class="list">' + paraAula.map((l) => { const r = ritmo(l); return '<div class="row clickable" data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"><div class="grow"><div class="t">' + esc(l.titulo) + '</div><div class="s"><span>faltam ' + r.restante + " p.</span>" + (r.porDia ? '<span class="pill primary">' + r.porDia + " p./dia</span>" : "") + "</div></div></div>"; }).join("") + "</div>" : '<p class="small muted">Nenhum texto pendente com prazo até essa aula.</p>')
            : '<p class="small muted">Informe o dia da semana das aulas (e, se quiser, o início e o fim do semestre) para o hub calcular as próximas aulas.</p>') + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Materiais</h2><button class="btn sm" data-act="enviarMaterial" data-dest="' + esc(d.id) + '">' + icon.up + "Enviar</button></div>" +
          '<p class="hint" style="margin-bottom:8px">Plano de ensino, slides, cronograma, modelos.</p>' + listaMateriais(mats) + "</section>" +
        (d.avaliacao || d.notas ? '<section class="panel"><div class="panel-h"><h2>Avaliação e anotações</h2></div><dl class="dl">' + (d.avaliacao ? "<dt>Avaliação</dt><dd>" + esc(d.avaliacao) + "</dd>" : "") + (d.notas ? "<dt>Anotações</dt><dd>" + esc(d.notas) + "</dd>" : "") + "</dl></section>" : "") +
      "</div></div>";
  }
  function listaMateriais(mats) {
    if (!mats.length) return '<p class="small muted">Nenhum material enviado.</p>';
    return '<div class="list">' + mats.map((m) => '<div class="row"><span class="muted">' + icon.file.replace("<svg", '<svg width="18" height="18"') + '</span><div class="grow"><div class="t">' + esc(m.titulo) + '</div><div class="s">' + esc(tamanho(m.arquivo_tamanho)) + "</div></div>" +
      '<button class="btn sm" data-act="abrirArquivo" data-path="' + esc(m.arquivo_path) + '">Abrir</button>' +
      (UI.confirmar === m.id ? '<button class="btn sm danger" data-act="excluirConfirmado" data-t="materiais" data-id="' + esc(m.id) + '">Confirmar</button>' : '<button class="btn sm ghost" data-act="pedirConfirmacao" data-id="' + esc(m.id) + '" aria-label="Excluir material">✕</button>') + "</div>").join("") + "</div>";
  }

  // ---------------------------- LEITURAS ------------------------------------
  const STATUS = ["A ler", "Lendo", "Lido", "Fichado"];
  const statusPill = (s) => '<span class="pill ' + ({ "Lendo": "warn", "Lido": "primary", "Fichado": "ok" }[s] || "") + '">' + esc(s || "A ler") + "</span>";
  function ordemLeituras(a, b) {
    const la = lida(a), lb = lida(b);
    if (la !== lb) return la ? 1 : -1;
    return String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")) || String(a.titulo).localeCompare(b.titulo);
  }
  function linhaLeitura(l) {
    return '<div class="row clickable" data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"><div class="grow"><div class="t">' + esc(l.titulo) + "</div>" +
      '<div class="s">' + (l.autores ? "<span>" + esc(l.autores.split(";")[0]) + (l.autores.includes(";") ? " e outros" : "") + "</span>" : "") +
      (l.paginas_total ? '<span class="mono">' + (l.paginas_lidas || 0) + "/" + l.paginas_total + " p.</span>" : "") + (l.arquivo_path ? "<span>PDF</span>" : "") + "</div></div>" +
      prazoPill(l.prazo, lida(l)) + statusPill(l.status) + "</div>";
  }
  function vLeituras() {
    let ls = S.leituras.slice();
    const st = UI.leitStatus, q = UI.leitQ.trim().toLowerCase();
    if (st === "abertas") ls = ls.filter((l) => !lida(l));
    else if (st !== "todas") ls = ls.filter((l) => (l.status || "A ler") === st);
    ls = ls.filter((l) => casaDestino(l, UI.leitDest));
    if (q) ls = ls.filter((l) => [l.titulo, l.autores, l.tags, l.referencia, l.ano].join(" ").toLowerCase().includes(q));
    ls.sort(ordemLeituras);
    const cont = (s) => S.leituras.filter((l) => (l.status || "A ler") === s).length;
    const chips = [["abertas", "Pendentes (" + S.leituras.filter((l) => !lida(l)).length + ")"], ...STATUS.map((s) => [s, s + " (" + cont(s) + ")"]), ["todas", "Todas (" + S.leituras.length + ")"]];
    return '<div class="head"><div><h1>Leituras</h1><p class="sub">Sua biblioteca de textos, com arquivo, progresso, prazo e fichamento.</p></div>' +
      '<div class="actions"><button class="btn" data-act="novo" data-t="leituras">+ Cadastrar sem arquivo</button><button class="btn primary" data-act="depositar">' + icon.up + "Depositar textos</button></div></div>" +
      '<div class="toolbar"><div class="chips">' + chips.map(([k, l]) => '<button class="chip" data-act="filtro" data-k="leitStatus" data-v="' + esc(k) + '" aria-pressed="' + (st === k) + '">' + esc(l) + "</button>").join("") + "</div></div>" +
      '<div class="toolbar"><input type="search" class="search" id="leit-q" data-input="leitQ" placeholder="Buscar por título, autor, ano ou palavra-chave" value="' + esc(UI.leitQ) + '">' +
      '<select id="leit-dest" data-change="leitDest" style="width:auto;max-width:260px"><option value="">Todas as disciplinas</option>' + opcoesDestino(UI.leitDest) + "</select></div>" +
      (ls.length ? '<section class="panel"><div class="tablewrap"><table><thead><tr><th>Obra</th><th>Para</th><th>Prazo</th><th>Progresso</th><th>Situação</th><th></th></tr></thead><tbody>' +
        ls.map((l) => '<tr class="clickable" data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"><td style="min-width:260px"><div style="font-weight:500">' + esc(l.titulo) + '</div><div class="xs muted">' + esc([l.autores, l.ano, l.tipo_obra].filter(Boolean).join(" · ")) + "</div>" +
          (l.referencia && !l.referencia_conferida ? '<div class="xs" style="color:var(--warn);margin-top:2px">referência a conferir</div>' : "") + "</td>" +
          "<td>" + destTag(l) + "</td><td>" + (prazoPill(l.prazo, lida(l)) || '<span class="muted xs">sem prazo</span>') + "</td>" +
          '<td style="min-width:130px">' + (l.paginas_total ? '<div class="xs mono muted">' + (l.paginas_lidas || 0) + "/" + l.paginas_total + " p.</div>" + bar(l.paginas_lidas, l.paginas_total, lida(l) ? "ok" : "") : '<span class="muted xs">sem total</span>') + "</td>" +
          "<td>" + statusPill(l.status) + "</td>" +
          "<td>" + (l.arquivo_path ? '<button class="btn sm" data-act="abrirArquivo" data-path="' + esc(l.arquivo_path) + '">' + icon.file + "Abrir</button>" : "") + "</td></tr>").join("") +
        "</tbody></table></div></section>"
        : (S.leituras.length ? empty("Nenhuma leitura com esse filtro.") : '<div class="drop" data-act="depositar"><b>Sua biblioteca está vazia</b><span class="small muted">Arraste os PDFs dos textos para cá. O hub conta as páginas, procura DOI ou ISBN e monta a referência ABNT.</span></div>'));
  }

  function vLeitura() {
    const l = achar("leituras", rota.id);
    if (!l) return empty("Leitura não encontrada.", '<button class="btn" data-act="nav" data-v="leituras">Voltar às leituras</button>');
    const r = ritmo(l);
    const cits = S.citacoes.filter((c) => c.leitura_id === l.id).sort((a, b) => (parseInt(a.pagina, 10) || 0) - (parseInt(b.pagina, 10) || 0));
    const voltar = l.disciplina_id && disc(l.disciplina_id) ? '<button class="back" data-act="nav" data-v="disciplina" data-id="' + esc(l.disciplina_id) + '">← ' + esc(disc(l.disciplina_id).nome) + "</button>" : '<button class="back" data-act="nav" data-v="leituras">← Leituras</button>';
    const salvo = (k) => UI.salvoCampo === l.id + k ? ' <span class="saved">salvo</span>' : "";
    const campo = (k, rotulo, dica) => '<div class="f"><label for="fx-' + k + '">' + rotulo + salvo(k) + '</label><textarea id="fx-' + k + '" data-salvar-leitura="' + k + '" placeholder="' + esc(dica) + '" style="min-height:130px">' + esc(l[k] || "") + "</textarea></div>";
    return voltar +
      '<div class="head"><div style="min-width:0"><span class="label">' + esc([l.tipo_obra, destNome(l)].filter(Boolean).join(" · ") || "Leitura") + '</span><h1 style="margin-top:6px">' + esc(l.titulo) + '</h1><p class="sub">' + esc([l.autores, l.ano].filter(Boolean).join(" · ")) + "</p></div>" +
      '<div class="actions">' + (l.arquivo_path ? '<button class="btn primary" data-act="abrirArquivo" data-path="' + esc(l.arquivo_path) + '">' + icon.file + "Abrir texto</button>" : '<button class="btn" data-act="anexarLeitura" data-id="' + esc(l.id) + '">' + icon.up + "Anexar arquivo</button>") +
      '<button class="btn" data-act="editar" data-t="leituras" data-id="' + esc(l.id) + '">Editar dados</button></div></div>' +
      '<div class="cols"><div class="stack">' +
        '<section class="panel"><div class="panel-h"><h2>Fichamento</h2>' + (l.status === "Fichado" ? '<span class="pill ok">fichado</span>' : '<button class="btn sm" data-act="marcarFichado" data-id="' + esc(l.id) + '">Marcar como fichado</button>') + '</div><div class="form">' +
          campo("ideias", "Ideias centrais", "A tese do texto e os argumentos principais, com suas palavras.") +
          '<div class="f"><label>Citações diretas</label>' +
            (cits.length ? '<div class="stack" style="gap:14px;margin:4px 0 10px">' + cits.map((c) => '<div class="quote"><div class="q">“' + esc(c.trecho) + '”</div><div class="m">' + (c.pagina ? '<span class="mono">p. ' + esc(c.pagina) + "</span>" : '<span style="color:var(--warn)">sem página</span>') + (c.comentario ? "<span>" + esc(c.comentario) + "</span>" : "") +
              '<span style="flex:1"></span><button class="btn sm ghost" data-act="copiarCitacao" data-id="' + esc(c.id) + '">' + icon.copy + 'Copiar</button><button class="btn sm ghost" data-act="editar" data-t="citacoes" data-id="' + esc(c.id) + '">Editar</button></div></div>').join("") + "</div>" : "") +
            '<div class="stack" style="gap:8px;background:var(--surface-2);padding:12px;border-radius:8px"><div class="two" style="grid-template-columns:110px 1fr"><input type="text" id="cit-pag" placeholder="Página" aria-label="Página"><input type="text" id="cit-com" placeholder="Comentário (opcional)" aria-label="Comentário"></div>' +
            '<textarea id="cit-trecho" placeholder="Trecho exatamente como está no original" aria-label="Trecho" style="min-height:70px"></textarea><div><button class="btn sm primary" data-act="addCitacao" data-id="' + esc(l.id) + '">Adicionar citação</button></div></div></div>' +
          campo("critica", "Análise crítica", "Concordâncias, objeções, lacunas do argumento.") +
          campo("conexao", "Conexão com a disciplina ou a dissertação", "Onde e como este texto será usado.") +
        '<p class="hint">Os campos são salvos sozinhos quando você sai deles.</p></div></section>' +
      '</div><div class="stack">' +
        '<section class="panel"><div class="panel-h"><h2>Progresso</h2>' + statusPill(l.status) + "</div>" +
          '<div class="two"><div class="f"><label for="pg-lidas">Já li até a página</label><input type="number" min="0" id="pg-lidas" data-pagina="' + esc(l.id) + '" value="' + (l.paginas_lidas || 0) + '"></div>' +
          '<div class="f"><label for="pg-total">De um total de</label><input type="number" min="0" id="pg-total" data-total="' + esc(l.id) + '" value="' + (l.paginas_total || "") + '" placeholder="páginas"></div></div>' +
          '<div style="margin:12px 0">' + bar(l.paginas_lidas, l.paginas_total, lida(l) ? "ok" : "") + "</div>" +
          '<div class="f"><label for="pg-prazo">Ler até</label><input type="date" id="pg-prazo" data-prazo="' + esc(l.id) + '" value="' + esc(l.prazo || "") + '"></div>' +
          (l.disciplina_id && disc(l.disciplina_id) && proxAula(disc(l.disciplina_id)) && l.prazo !== proxAula(disc(l.disciplina_id)) ? '<button class="btn sm ghost" style="margin-top:6px" data-act="prazoProxAula" data-id="' + esc(l.id) + '">Usar a próxima aula (' + esc(fmtD(proxAula(disc(l.disciplina_id)))) + ")</button>" : "") +
          (r.porDia ? '<div class="pace" style="margin-top:12px"><span class="big">' + r.porDia + '</span><span class="small">páginas por dia para terminar ' + (r.dias > 0 ? "até " + esc(fmtDia(l.prazo)) + " (" + plural(r.dias, "dia", "dias") + ")" : "hoje") + "</span></div>" : "") +
          "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Referência</h2>' + (l.referencia ? (l.referencia_conferida ? '<span class="pill ok">conferida</span>' : '<span class="pill warn">gerada automaticamente</span>') : "") + "</div>" +
          (l.referencia ? '<div class="ref-box">' + N.refHTML(l.referencia) + "</div>" +
            '<div class="actions" style="margin-top:10px"><button class="btn sm" data-act="copiarRef" data-id="' + esc(l.id) + '">' + icon.copy + "Copiar</button>" +
            '<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-conferida="' + esc(l.id) + '"' + (l.referencia_conferida ? " checked" : "") + "> Conferi com a obra</label></div>" +
            (!l.referencia_conferida ? '<p class="hint" style="margin-top:8px">Montada a partir dos dados públicos da obra. Confira edição, local e editora na folha de rosto antes de usar.</p>' : "")
            : '<p class="small muted">Sem referência ainda.</p>') +
          '<div class="f" style="margin-top:14px"><label for="busca-id">Preencher pelo DOI ou ISBN</label><div style="display:flex;gap:8px"><input type="text" id="busca-id" placeholder="10.xxxx/... ou 978..." value="' + esc(l.doi || l.isbn || "") + '"><button class="btn" data-act="buscarDados" data-id="' + esc(l.id) + '">Buscar</button></div></div></section>' +
        '<section class="panel"><div class="panel-h"><h2>Dados</h2></div><dl class="dl">' +
          [["Tipo", l.tipo_obra], ["Idioma", l.idioma], ["Páginas na obra", l.pagina_inicial ? "p. " + l.pagina_inicial + (l.pagina_final ? "-" + l.pagina_final : "") : ""], ["DOI", l.doi], ["ISBN", l.isbn], ["Palavras-chave", l.tags], ["Arquivo", l.arquivo_nome ? l.arquivo_nome + " (" + tamanho(l.arquivo_tamanho) + ")" : ""]]
            .filter(([, v]) => v).map(([k, v]) => "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl></section>" +
      "</div></div>";
  }

  // ---------------------------- CITAÇÕES ------------------------------------
  function vCitacoes() {
    const q = UI.citQ.trim().toLowerCase();
    let cs = S.citacoes.map((c) => ({ c, l: achar("leituras", c.leitura_id) })).filter((x) => x.l);
    cs = cs.filter((x) => casaDestino(x.l, UI.citDest));
    if (q) cs = cs.filter((x) => [x.c.trecho, x.c.comentario, x.l.titulo, x.l.autores, x.l.tags].join(" ").toLowerCase().includes(q));
    cs.sort((a, b) => String(a.l.titulo).localeCompare(b.l.titulo) || (parseInt(a.c.pagina, 10) || 0) - (parseInt(b.c.pagina, 10) || 0));
    return '<div class="head"><div><h1>Citações</h1><p class="sub">Todas as citações diretas dos seus fichamentos, pesquisáveis em um só lugar.</p></div></div>' +
      '<div class="toolbar"><input type="search" class="search" id="cit-q" data-input="citQ" placeholder="Buscar por palavra, autor ou obra" value="' + esc(UI.citQ) + '">' +
      '<select id="cit-dest" data-change="citDest" style="width:auto;max-width:260px"><option value="">Todas as disciplinas</option>' + opcoesDestino(UI.citDest) + "</select>" +
      '<span class="small muted">' + plural(cs.length, "citação", "citações") + "</span></div>" +
      (cs.length ? '<section class="panel"><div class="stack" style="gap:20px">' + cs.map(({ c, l }) => '<div class="quote"><div class="q">“' + esc(c.trecho) + '”</div><div class="m">' +
        '<span class="clickable" data-act="nav" data-v="leitura" data-id="' + esc(l.id) + '"><b class="t">' + esc(l.titulo) + "</b></span>" + (l.autores ? "<span>" + esc(l.autores.split(";")[0]) + "</span>" : "") +
        (c.pagina ? '<span class="mono">p. ' + esc(c.pagina) + "</span>" : '<span style="color:var(--warn)">sem página</span>') + destTag(l) +
        '<span style="flex:1"></span><button class="btn sm ghost" data-act="copiarCitacao" data-id="' + esc(c.id) + '">' + icon.copy + "Copiar</button></div>" +
        (c.comentario ? '<div class="small muted">' + esc(c.comentario) + "</div>" : "") + "</div>").join("") + "</div></section>"
        : empty(S.citacoes.length ? "Nenhuma citação encontrada." : "As citações que você registrar nos fichamentos aparecem aqui."));
  }

  // ---------------------------- TAREFAS -------------------------------------
  function ordemTarefas(a, b) {
    if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;
    return String(a.prazo || "9999").localeCompare(String(b.prazo || "9999"));
  }
  function linhaTarefa(t) {
    return '<div class="row' + (t.concluida ? " done" : "") + '"><input type="checkbox" data-tarefa="' + esc(t.id) + '"' + (t.concluida ? " checked" : "") + ' aria-label="Concluir tarefa">' +
      '<div class="grow clickable" data-act="editar" data-t="tarefas" data-id="' + esc(t.id) + '"><div class="t">' + esc(t.titulo) + '</div><div class="s">' + (t.tipo ? "<span>" + esc(t.tipo) + "</span>" : "") + destTag(t) + (t.prioridade === "Alta" && !t.concluida ? '<span class="pill mark">prioridade alta</span>' : "") + "</div></div>" +
      prazoPill(t.prazo, t.concluida) + "</div>";
  }
  function addRapido(dest) {
    return '<form class="inline-add" data-form="addTarefa"' + (dest ? ' data-dest="' + esc(dest) + '"' : "") + '><input type="text" id="qt-titulo' + (dest ? "-d" : "") + '" placeholder="Nova tarefa e Enter" aria-label="Nova tarefa" required>' +
      '<input type="date" id="qt-prazo' + (dest ? "-d" : "") + '" aria-label="Prazo">' +
      (dest ? "" : '<select id="qt-dest" aria-label="Disciplina"><option value="">Sem disciplina</option>' + opcoesDestino("") + "</select>") +
      '<button class="btn">Adicionar</button></form>';
  }
  function vTarefas() {
    const hj = HOJE(), f = UI.tarFiltro;
    let ts = S.tarefas.filter((t) => casaDestino(t, UI.tarDest));
    if (f === "abertas") ts = ts.filter((t) => !t.concluida); else if (f === "feitas") ts = ts.filter((t) => t.concluida);
    ts.sort(ordemTarefas);
    const grupos = [
      ["Atrasadas", (t) => !t.concluida && t.prazo && t.prazo < hj],
      ["Próximos 7 dias", (t) => !t.concluida && t.prazo && t.prazo >= hj && t.prazo <= N.somarDias(hj, 7)],
      ["Mais adiante", (t) => !t.concluida && t.prazo && t.prazo > N.somarDias(hj, 7)],
      ["Sem prazo", (t) => !t.concluida && !t.prazo],
      ["Concluídas", (t) => t.concluida],
    ];
    const corpo = grupos.map(([g, fn]) => { const it = ts.filter(fn); return it.length ? '<section class="panel"><div class="panel-h"><h2>' + g + '</h2><span class="mono small muted">' + it.length + '</span></div><div class="list">' + it.map(linhaTarefa).join("") + "</div></section>" : ""; }).join("");
    return '<div class="head"><div><h1>Tarefas</h1><p class="sub">Seminários, artigos, resenhas e entregas.</p></div><button class="btn" data-act="novo" data-t="tarefas">+ Tarefa com detalhes</button></div>' +
      '<section class="panel" style="margin-bottom:16px">' + addRapido("") + "</section>" +
      '<div class="toolbar"><div class="chips">' + [["abertas", "Abertas"], ["feitas", "Concluídas"], ["todas", "Todas"]].map(([k, l]) => '<button class="chip" data-act="filtro" data-k="tarFiltro" data-v="' + k + '" aria-pressed="' + (f === k) + '">' + l + "</button>").join("") + "</div>" +
      '<select id="tar-dest" data-change="tarDest" style="width:auto;max-width:260px"><option value="">Todas as disciplinas</option>' + opcoesDestino(UI.tarDest) + "</select></div>" +
      '<div class="stack">' + (corpo || empty("Nenhuma tarefa aqui.")) + "</div>";
  }

  // ---------------------------- DISSERTAÇÃO ---------------------------------
  const STATUS_CAP = ["Planejado", "Pesquisa", "Rascunho", "Revisão", "Concluído"];
  function vDissertacao() {
    const d = S.dissertacao || {};
    const caps = S.capitulos.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const dp = progressoDiss(), pm = proximoMarco();
    const re = pm ? N.ritmoEscrita(dp.w, dp.m, pm.data, HOJE()) : null;
    const marcos = S.marcos.slice().sort((a, b) => String(a.data || "9999").localeCompare(String(b.data || "9999")));
    const reun = S.reunioes.slice().sort((a, b) => String(b.data).localeCompare(a.data));
    const bib = S.leituras.filter((l) => l.para_dissertacao).sort(ordemLeituras);
    const mats = S.materiais.filter((m) => m.para_dissertacao);
    const capPill = (s) => '<span class="pill ' + ({ Rascunho: "warn", "Revisão": "primary", "Concluído": "ok" }[s] || "") + '">' + esc(s || "Planejado") + "</span>";
    const F = [["titulo", "Título"], ["orientador", "Orientação"], ["linha", "Linha de pesquisa"], ["problema", "Problema"], ["hipotese", "Hipótese"], ["objetivo_geral", "Objetivo geral"], ["objetivos_especificos", "Objetivos específicos"], ["metodologia", "Metodologia"]].filter(([k]) => d[k]);
    return '<div class="head"><div><h1>Dissertação</h1><p class="sub">Projeto, capítulos, marcos, orientação e bibliografia.</p></div>' +
      '<div class="actions"><button class="btn" data-act="depositar" data-dest="diss">' + icon.up + 'Depositar textos</button><button class="btn primary" data-act="novo" data-t="capitulos">+ Capítulo</button></div></div>' +
      '<div class="metrics">' +
        '<div class="metric"><span class="label">Palavras escritas</span><span class="big">' + num(dp.w) + '</span><span class="small muted">meta de ' + num(dp.m) + "</span></div>" +
        '<div class="metric"><span class="label">Progresso do texto</span><span class="big">' + dp.p + "<small>%</small></span>" + bar(dp.w, dp.m) + "</div>" +
        '<div class="metric"><span class="label">Ritmo necessário</span><span class="big">' + (re && re.porDia != null ? num(re.porDia) + " <small>palavras/dia</small>" : '<small>sem dados</small>') + '</span><span class="small muted">' + (pm ? "até " + esc(pm.titulo) + " (" + rel(pm.data) + ")" : "cadastre um marco com data") + "</span></div>" +
        '<div class="metric"><span class="label">Bibliografia</span><span class="big">' + bib.length + '</span><span class="small muted">' + bib.filter((l) => l.status === "Fichado").length + " fichadas</span></div>" +
      "</div>" +
      '<div class="cols"><div class="stack">' +
        '<section class="panel"><div class="panel-h"><h2>Capítulos</h2><span class="hint">Atualize as palavras direto na tabela</span></div>' +
          (caps.length ? '<div class="tablewrap"><table><thead><tr><th>#</th><th>Capítulo</th><th>Situação</th><th>Palavras</th><th style="width:26%">Progresso</th></tr></thead><tbody>' +
            caps.map((c) => '<tr><td class="mono muted">' + esc(c.ordem ?? "") + '</td><td style="min-width:200px" class="clickable" data-act="editar" data-t="capitulos" data-id="' + esc(c.id) + '"><div class="t" style="font-weight:500">' + esc(c.titulo) + "</div>" + (c.notas ? '<div class="xs muted">' + esc(String(c.notas).slice(0, 120)) + (String(c.notas).length > 120 ? "…" : "") + "</div>" : "") + "</td>" +
              "<td>" + capPill(c.status) + '</td><td style="white-space:nowrap"><input type="number" min="0" id="cap-' + esc(c.id) + '" data-palavras="' + esc(c.id) + '" value="' + (c.palavras || 0) + '" style="width:96px;padding:4px 8px" aria-label="Palavras escritas"><span class="xs muted mono"> / ' + num(c.meta_palavras) + "</span></td>" +
              "<td>" + bar(c.palavras, c.meta_palavras, c.status === "Concluído" ? "ok" : "") + "</td></tr>").join("") + "</tbody></table></div>"
            : empty("Divida o texto em capítulos com meta de palavras para acompanhar o ritmo.", '<button class="btn" data-act="novo" data-t="capitulos">+ Capítulo</button>')) + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Projeto de pesquisa</h2><button class="btn sm" data-act="editarDiss">' + (F.length ? "Editar" : "Preencher") + "</button></div>" +
          (F.length ? '<dl class="dl">' + F.map(([k, rot]) => "<dt>" + rot + "</dt><dd>" + esc(d[k]) + "</dd>").join("") + "</dl>" : empty("Registre título, problema, hipótese e objetivos para tê-los sempre à vista.")) + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Reuniões de orientação</h2><button class="btn sm" data-act="novo" data-t="reunioes">+ Reunião</button></div>' +
          (reun.length ? '<div class="list">' + reun.map((r) => '<div class="row clickable" data-act="editar" data-t="reunioes" data-id="' + esc(r.id) + '" style="align-items:flex-start"><span class="mono small muted" style="width:96px;flex:none">' + esc(fmtD(r.data)) + "<br>" + esc(N.parse(r.data).getFullYear()) + '</span><div class="grow small">' +
            (r.pauta ? '<div><b>Pauta:</b> <span style="white-space:pre-wrap">' + esc(r.pauta) + "</span></div>" : "") + (r.encaminhamentos ? '<div style="margin-top:4px"><b>Encaminhamentos:</b> <span style="white-space:pre-wrap">' + esc(r.encaminhamentos) + "</span></div>" : "") + "</div></div>").join("") + "</div>"
            : empty("Registre a pauta antes e os encaminhamentos depois de cada reunião.")) + "</section>" +
      '</div><div class="stack">' +
        '<section class="panel"><div class="panel-h"><h2>Marcos</h2><button class="btn sm" data-act="novo" data-t="marcos">+ Marco</button></div>' +
          (marcos.length ? '<div class="list">' + marcos.map((m) => '<div class="row' + (m.concluido ? " done" : "") + '"><input type="checkbox" data-marco="' + esc(m.id) + '"' + (m.concluido ? " checked" : "") + ' aria-label="Marco concluído"><div class="grow clickable" data-act="editar" data-t="marcos" data-id="' + esc(m.id) + '"><div class="t">' + esc(m.titulo) + '</div><div class="s">' + esc(fmtLongo(m.data)) + "</div></div>" +
            (m.concluido ? '<span class="pill ok">feito</span>' : m.data ? (m.data >= HOJE() ? '<span class="pill mono">' + N.diasEntre(HOJE(), m.data) + " dias</span>" : '<span class="pill danger">vencido</span>') : "") + "</div>").join("") + "</div>" : empty("Depósito, defesa e outras datas do programa.")) + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Bibliografia da pesquisa</h2></div>' + (bib.length ? '<div class="list">' + bib.slice(0, 12).map(linhaLeitura).join("") + "</div>" + (bib.length > 12 ? '<button class="btn sm ghost" style="margin-top:8px" data-act="verBibliografia">Ver todas (' + bib.length + ")</button>" : "") : empty("Deposite textos com destino Dissertação.")) + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Arquivos</h2><button class="btn sm" data-act="enviarMaterial" data-dest="diss">' + icon.up + 'Enviar</button></div><p class="hint" style="margin-bottom:8px">Projeto, versões enviadas ao orientador, normas do programa.</p>' + listaMateriais(mats) + "</section>" +
      "</div></div>";
  }

  // ---------------------------- ROTINA --------------------------------------
  function vRotina() {
    const hj = HOJE(), ti = N.diaSemana(hj);
    const semana = '<div class="weekwrap"><div class="week">' + DIAS.map((nome, i) => {
      const bs = S.blocos.filter((b) => Number(b.dia_semana) === i).sort((a, b) => String(a.inicio).localeCompare(b.inicio));
      const aulas = discsAtivas().filter((d) => Number(d.dia_semana) === i && d.dia_semana != null);
      return '<div class="day' + (i === ti ? " today" : "") + '"><h3 style="text-transform:capitalize">' + nome + "</h3>" +
        aulas.map((d) => '<button class="blk" style="border-left-color:' + esc(d.cor || "var(--muted)") + '" data-act="nav" data-v="disciplina" data-id="' + esc(d.id) + '"><span class="h">' + (hm(d.hora_inicio) ? hm(d.hora_inicio) + "–" + hm(d.hora_fim) : "aula") + "</span><span>Aula: " + esc(d.nome) + "</span></button>").join("") +
        bs.map((b) => '<button class="blk" style="border-left-color:' + esc(destCor(b)) + '" data-act="editar" data-t="blocos" data-id="' + esc(b.id) + '"><span class="h">' + hm(b.inicio) + "–" + hm(b.fim) + "</span><span>" + esc(b.atividade) + "</span></button>").join("") +
        '<button class="btn ghost sm" data-act="novo" data-t="blocos" data-dia="' + i + '">+ bloco</button></div>';
    }).join("") + "</div></div>";
    const ini0 = N.inicioSemana(hj);
    const semanas = []; for (let i = 7; i >= 0; i--) semanas.push(N.somarDias(ini0, -7 * i));
    const horas = semanas.map((w) => { const f = N.somarDias(w, 7); return S.sessoes.filter((s) => s.data >= w && s.data < f).reduce((a, s) => a + s.minutos, 0) / 60; });
    const porDia = DIAS.map((_, i) => { const d = N.somarDias(ini0, i); return S.sessoes.filter((s) => s.data === d).reduce((a, s) => a + s.minutos, 0); });
    const tot = porDia.reduce((a, b) => a + b, 0), maxDia = Math.max(...porDia, 1);
    const recentes = S.sessoes.slice().sort((a, b) => String(b.data).localeCompare(a.data) || String(b.created_at).localeCompare(a.created_at)).slice(0, 12);
    return '<div class="head"><div><h1>Rotina</h1><p class="sub">Semana-modelo de estudo e horas efetivamente estudadas.</p></div>' +
      '<div class="actions"><button class="btn" data-act="editarMeta">Meta: ' + metaSemana() + 'h por semana</button><button class="btn primary" data-act="novo" data-t="sessoes">+ Registrar sessão</button></div></div>' +
      '<div class="stack"><section><div class="panel-h"><h2>Semana-modelo</h2><span class="hint">As aulas entram sozinhas, a partir do horário de cada disciplina.</span></div>' + semana + "</section>" +
      '<div class="cols-even"><section class="panel chart"><div class="panel-h"><h2>Horas por semana</h2><span class="hint">linha tracejada: meta</span></div>' + graficoSemanas(semanas, horas, metaSemana()) + "</section>" +
        '<section class="panel"><div class="panel-h"><h2>Esta semana, dia a dia</h2><span class="mono small">' + fmtH(tot) + " de " + metaSemana() + "h</span></div>" +
          '<div class="list">' + porDia.map((m, i) => '<div class="row"><span style="width:76px;text-transform:capitalize' + (i === ti ? ';font-weight:600;color:var(--primary)' : '') + '">' + DIAS[i] + '</span><div class="grow">' + bar(m, maxDia, i === ti ? "" : "ok") + '</div><span class="mono small" style="width:56px;text-align:right">' + (m ? fmtH(m) : "0") + "</span></div>").join("") + "</div></section></div>" +
      '<section class="panel"><div class="panel-h"><h2>Sessões recentes</h2></div>' +
        (recentes.length ? '<div class="list">' + recentes.map((s) => { return '<div class="row clickable" data-act="editar" data-t="sessoes" data-id="' + esc(s.id) + '"><span class="mono small muted" style="width:64px">' + esc(fmtD(s.data)) + '</span><span class="mono small" style="width:60px">' + fmtH(s.minutos) + '</span><div class="grow"><div class="s">' + (s.nota ? "<span>" + esc(s.nota) + "</span>" : "") + "</div></div></div>"; }).join("") + "</div>" : empty("Nenhuma sessão registrada.")) + "</section></div>";
  }
  function graficoSemanas(semanas, vals, meta) {
    const W = 560, H = 210, L = 36, R = 10, T = 16, B = 28;
    const topo = Math.max(5, Math.ceil(Math.max(meta, ...vals, 1) / 5) * 5);
    const y = (v) => T + (H - T - B) * (1 - v / topo);
    const bw = (W - L - R) / semanas.length;
    let g = "";
    [0, topo / 2, topo].forEach((v) => { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "h</text>"; });
    semanas.forEach((w, i) => {
      const v = vals[i], x = L + i * bw + bw * 0.18, larg = bw * 0.64, atual = i === semanas.length - 1;
      g += '<rect x="' + x + '" y="' + y(v) + '" width="' + larg + '" height="' + Math.max(0, y(0) - y(v)) + '" rx="3" fill="' + (atual ? "var(--primary)" : "var(--muted)") + '" fill-opacity="' + (atual ? 1 : 0.4) + '"><title>' + v.toFixed(1).replace(".", ",") + "h</title></rect>";
      if (v > 0) g += '<text x="' + (x + larg / 2) + '" y="' + (y(v) - 5) + '" text-anchor="middle" style="fill:var(--ink)">' + (Math.round(v * 10) / 10).toString().replace(".", ",") + "</text>";
      const dt = N.parse(w);
      g += '<text x="' + (x + larg / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + N.pad(dt.getDate()) + "/" + N.pad(dt.getMonth() + 1) + "</text>";
    });
    if (meta > 0) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(meta) + '" y2="' + y(meta) + '" stroke="var(--primary)" stroke-dasharray="5 4" stroke-width="1.5"/>';
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Horas estudadas nas últimas 8 semanas">' + g + "</svg>";
  }

  const VIEWS = { inicio: vInicio, disciplinas: vDisciplinas, disciplina: vDisciplina, leituras: vLeituras, leitura: vLeitura, citacoes: vCitacoes, tarefas: vTarefas, dissertacao: vDissertacao, rotina: vRotina };

  // --------------------------------------------------------------------------
  // Pomodoro: foco, pausa curta e pausa longa.
  // Ao fim de cada foco, a sessão de estudo é registrada sozinha.
  // O bip é agendado no relógio de áudio do navegador no momento em que a
  // etapa começa, por isso toca na hora certa mesmo com a aba em segundo plano.
  // Os ajustes ficam guardados neste aparelho.
  // --------------------------------------------------------------------------
  const POMO_PADRAO = { foco: 25, curta: 5, longa: 15, ciclos: 4, auto: true, som: true };
  function lerPomo() {
    try { return Object.assign({}, POMO_PADRAO, JSON.parse(localStorage.getItem("hub-pomodoro") || "{}")); }
    catch (e) { return Object.assign({}, POMO_PADRAO); }
  }
  const PC = lerPomo();
  const FASES = { foco: "Foco", curta: "Pausa curta", longa: "Pausa longa" };
  const duracao = (f) => Math.max(1, Number(PC[f]) || POMO_PADRAO[f]) * 60;
  const P = { fase: "foco", resta: duracao("foco"), rodando: false, fim: 0, feitos: 0, aviso: "" };
  const mmss = (seg) => N.pad(Math.floor(seg / 60)) + ":" + N.pad(seg % 60);
  const proximaPausa = () => ((P.feitos + 1) % Math.max(1, PC.ciclos) === 0 ? "longa" : "curta");
  function mudarFase(f) { P.fase = f; P.resta = duracao(f); document.title = "Hub do Mestrado"; }

  let audio = null, bips = [];
  function prepararAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (e) { audio = null; }
  }
  // Fim do foco: três toques subindo. Fim da pausa: dois toques graves.
  function agendarBip(emSegundos, fase) {
    if (!audio || !PC.som) return;
    const notas = fase === "foco" ? [880, 880, 1320] : [587, 587];
    const t0 = audio.currentTime + Math.max(0, emSegundos);
    notas.forEach((freq, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.34;
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(audio.destination);
      o.start(t); o.stop(t + 0.3);
      bips.push(o);
    });
  }
  function cancelarBips() { bips.forEach((o) => { try { o.disconnect(); } catch (e) { /* já parado */ } }); bips = []; }

  function iniciarFase(inicio) {
    prepararAudio(); cancelarBips();
    const base = inicio || Date.now();
    P.fim = base + P.resta * 1000; P.rodando = true;
    P.resta = Math.max(0, Math.round((P.fim - Date.now()) / 1000));
    agendarBip((P.fim - Date.now()) / 1000, P.fase);
    render();
  }
  function terminarFase() {
    const fimAnterior = P.fim;
    P.rodando = false; bips = [];
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* sem vibração */ }
    if (P.fase === "foco") {
      P.feitos++;
      const min = Math.round(duracao("foco") / 60);
      criar("sessoes", { data: HOJE(), minutos: min, nota: "Pomodoro" });
      mudarFase(P.feitos % Math.max(1, PC.ciclos) === 0 ? "longa" : "curta");
      P.aviso = "Foco concluído e registrado (" + fmtH(min) + "). Hora da " + (P.fase === "longa" ? "pausa longa" : "pausa") + ".";
    } else {
      mudarFase("foco");
      P.aviso = "Pausa encerrada. Hora de voltar ao foco.";
    }
    toast(P.aviso, 6000);
    // Se a aba estava em segundo plano e o aviso atrasou, a etapa seguinte
    // começa na hora em que a anterior terminou, não agora.
    if (PC.auto) iniciarFase(fimAnterior); else render();
  }
  function tique() {
    if (!P.rodando) return;
    P.resta = Math.max(0, Math.round((P.fim - Date.now()) / 1000));
    if (P.resta === 0) { terminarFase(); return; }
    const el = $("#relogio"); if (el) el.textContent = mmss(P.resta);
    document.title = mmss(P.resta) + " · " + FASES[P.fase];
  }
  setInterval(tique, 500);
  document.addEventListener("visibilitychange", tique);

  async function registrarParcial() {
    const min = Math.round((duracao("foco") - P.resta) / 60);
    if (P.fase !== "foco" || min < 1) return;
    P.rodando = false; cancelarBips(); P.aviso = "";
    mudarFase("foco");
    if (await criar("sessoes", { data: HOJE(), minutos: min, nota: "Foco interrompido" })) toast("Sessão de " + fmtH(min) + " registrada.");
  }

  function htmlCronometro() {
    const hoje = S.sessoes.filter((x) => x.data === HOJE());
    const minHoje = hoje.reduce((a, x) => a + x.minutos, 0);
    const pomHoje = hoje.filter((x) => x.nota === "Pomodoro").length;
    const pausa = P.fase !== "foco";
    const decorrido = duracao(P.fase) - P.resta;
    const ciclos = Math.max(1, PC.ciclos), noCiclo = P.feitos % ciclos;
    const bolinhas = Array.from({ length: ciclos }, (_, i) => '<span class="dot" style="width:10px;height:10px;background:' + (i < noCiclo ? "var(--primary)" : "var(--line)") + '"></span>').join("");
    return '<div class="timer">' +
      '<div class="chips">' + Object.entries(FASES).map(([k, l]) => '<button class="chip" data-act="pomoFase" data-v="' + k + '" aria-pressed="' + (P.fase === k) + '"' + (P.rodando ? " disabled" : "") + ">" + l + " · " + (PC[k]) + "</button>").join("") + "</div>" +
      '<div class="clock" id="relogio" style="color:' + (pausa ? "var(--ok)" : "var(--ink)") + '">' + mmss(P.resta) + "</div>" +
      '<div class="ctrl" title="Pomodoros até a pausa longa">' + bolinhas + '<span class="xs muted">' + noCiclo + " de " + ciclos + " até a pausa longa</span></div>" +
      '<div class="ctrl">' + (P.rodando ? '<button class="btn" data-act="pomoPausar">Pausar</button>' : '<button class="btn primary" data-act="pomoIniciar">' + (decorrido > 0 ? "Continuar" : pausa ? "Iniciar pausa" : "Iniciar foco") + "</button>") +
        '<button class="btn ghost" data-act="pomoPular">' + (pausa ? "Pular pausa" : "Pular") + "</button>" +
        (!P.rodando && decorrido > 0 ? '<button class="btn ghost" data-act="pomoZerar">Zerar</button>' : "") +
        (!pausa && !P.rodando && decorrido >= 60 ? '<button class="btn" data-act="pomoRegistrar">Registrar ' + fmtH(Math.round(decorrido / 60)) + "</button>" : "") +
        '<span style="flex:1"></span><button class="btn ghost sm" data-act="pomoAjustar">Ajustar</button></div>' +
      (P.aviso ? '<p class="small" style="color:var(--ok)">' + esc(P.aviso) + "</p>" : "") +
      '<p class="xs muted">Hoje: ' + plural(pomHoje, "pomodoro", "pomodoros") + " · " + fmtH(minHoje) + " estudadas." + (PC.som ? "" : " Som desligado.") + "</p></div>";
  }

  function abrirAjustesPomodoro() {
    abrirModal('<form class="form" id="form-modal"><h2>Ajustar cronômetro</h2>' +
      '<div class="three">' + campoHTML("p-foco", "Foco (min)", "number", { req: 1 }, PC.foco) + campoHTML("p-curta", "Pausa curta (min)", "number", { req: 1 }, PC.curta) + campoHTML("p-longa", "Pausa longa (min)", "number", { req: 1 }, PC.longa) + "</div>" +
      campoHTML("p-ciclos", "Pomodoros até a pausa longa", "number", { req: 1 }, PC.ciclos) +
      campoHTML("p-auto", "Começar a etapa seguinte sozinho (foco, pausa, foco…)", "check", {}, PC.auto) +
      campoHTML("p-som", "Bip ao fim de cada etapa", "check", {}, PC.som) +
      '<p class="hint">Cada foco concluído vira uma sessão de estudo e conta nas horas da semana. Os ajustes valem para este aparelho.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="pomoTestar">Testar o bip</button><span class="sp"></span><button type="button" class="btn ghost" data-act="fecharModal">Cancelar</button><button class="btn primary">Salvar</button></div></form>');
    $("#form-modal").addEventListener("submit", (e) => {
      e.preventDefault();
      const n = (id, min) => Math.max(min, Math.round(Number($("#fm-" + id).value) || 0));
      PC.foco = n("p-foco", 1); PC.curta = n("p-curta", 1); PC.longa = n("p-longa", 1); PC.ciclos = n("p-ciclos", 1);
      PC.auto = $("#fm-p-auto").checked; PC.som = $("#fm-p-som").checked;
      try { localStorage.setItem("hub-pomodoro", JSON.stringify(PC)); } catch (err) { /* armazenamento indisponível */ }
      if (!P.rodando) P.resta = duracao(P.fase);
      fecharModal(); render(); toast("Cronômetro ajustado.");
    });
  }

  // --------------------------------------------------------------------------
  // Formulários
  // --------------------------------------------------------------------------
  const PALETA = ["#1E4D42", "#2E5C8A", "#8A2E45", "#9A5A06", "#5B4A8C", "#1F7178", "#A2482A", "#4D5A6E"];
  const TIPOS_OBRA = ["Livro", "Capítulo de livro", "Artigo", "Tese ou dissertação", "Jurisprudência", "Legislação", "Outro"];
  const TIPOS_TAREFA = ["Leitura", "Seminário", "Artigo", "Fichamento", "Resenha", "Prova", "Apresentação", "Orientação", "Outro"];
  const DIAS_OPC = [["", "Não informado"]].concat(DIAS.map((d, i) => [String(i), d.charAt(0).toUpperCase() + d.slice(1)]));
  const SPECS = {
    disciplinas: { n: "disciplina", g: "a", campos: [
      ["nome", "Nome da disciplina", "text", { req: 1 }],
      [["professor", "Professor(a)", "text"], ["semestre", "Semestre", "text", { ph: "2026.2" }]],
      [["dia_semana", "Dia da aula", "select", { opts: DIAS_OPC }], ["hora_inicio", "Início", "time"], ["hora_fim", "Fim", "time"]],
      [["inicio_aulas", "Primeira aula", "date"], ["fim_aulas", "Última aula", "date"]],
      ["cor", "Cor", "cor"],
      ["avaliacao", "Forma de avaliação", "textarea", { ph: "Ex.: seminário (40%) e artigo final (60%)" }],
      ["notas", "Anotações", "textarea"],
      ["ativa", "Disciplina em andamento", "check", { def: true }]] },
    leituras: { n: "leitura", g: "a", campos: [
      ["titulo", "Título", "text", { req: 1 }],
      ["autores", "Autores", "text", { ph: "SOBRENOME, Nome; SOBRENOME, Nome" }],
      [["ano", "Ano", "number"], ["tipo_obra", "Tipo", "select", { opts: [["", "Não informado"]].concat(TIPOS_OBRA.map((x) => [x, x])) }], ["idioma", "Idioma", "text", { ph: "português" }]],
      [["destino", "Para", "destino"], ["prazo", "Ler até", "date"]],
      [["paginas_total", "Total de páginas", "number"], ["pagina_inicial", "Página inicial na obra", "text"], ["pagina_final", "Página final na obra", "text"]],
      ["referencia", "Referência (ABNT NBR 6023)", "textarea", { ph: "SOBRENOME, Nome. **Título**: subtítulo. Edição. Local: Editora, ano.", dica: "O que estiver entre ** e ** sai em negrito ao copiar." }],
      [["doi", "DOI", "text"], ["isbn", "ISBN", "text"]],
      [["status", "Situação", "select", { opts: STATUS.map((s) => [s, s]) }], ["tags", "Palavras-chave", "text", { ph: "boa-fé, confiança" }]]] },
    tarefas: { n: "tarefa", g: "a", campos: [
      ["titulo", "O que precisa ser feito", "text", { req: 1 }],
      [["destino", "Para", "destino"], ["tipo", "Tipo", "select", { opts: [["", "Não informado"]].concat(TIPOS_TAREFA.map((x) => [x, x])) }]],
      [["prazo", "Prazo", "date"], ["prioridade", "Prioridade", "select", { opts: [["Alta", "Alta"], ["Média", "Média"], ["Baixa", "Baixa"]], def: "Média" }]],
      ["notas", "Detalhes", "textarea"],
      ["concluida", "Concluída", "check"]] },
    citacoes: { n: "citação", g: "a", campos: [
      ["pagina", "Página", "text", { ph: "45 ou 45-46" }],
      ["trecho", "Trecho", "textarea", { req: 1 }],
      ["comentario", "Comentário", "textarea"]] },
    capitulos: { n: "capítulo", g: "o", campos: [
      [["ordem", "Ordem", "number"], ["status", "Situação", "select", { opts: STATUS_CAP.map((s) => [s, s]) }]],
      ["titulo", "Título", "text", { req: 1 }],
      [["palavras", "Palavras escritas", "number"], ["meta_palavras", "Meta de palavras", "number"]],
      ["notas", "Roteiro e pendências", "textarea"]] },
    marcos: { n: "marco", g: "o", campos: [
      ["titulo", "Marco", "text", { req: 1, ph: "Depósito, defesa…" }],
      ["data", "Data", "date"],
      ["concluido", "Concluído", "check"]] },
    reunioes: { n: "reunião de orientação", g: "a", campos: [
      ["data", "Data", "date", { req: 1 }],
      ["pauta", "Pauta", "textarea"],
      ["encaminhamentos", "Encaminhamentos", "textarea"]] },
    blocos: { n: "bloco de estudo", g: "o", campos: [
      [["dia_semana", "Dia", "select", { opts: DIAS.map((d, i) => [String(i), d.charAt(0).toUpperCase() + d.slice(1)]) }], ["inicio", "Início", "time", { req: 1 }], ["fim", "Fim", "time", { req: 1 }]],
      ["atividade", "Atividade", "text", { req: 1, ph: "Leitura, escrita, revisão…" }],
      ["destino", "Para", "destino"]] },
    sessoes: { n: "sessão de estudo", g: "a", campos: [
      [["data", "Data", "date", { req: 1 }], ["minutos", "Minutos", "number", { req: 1 }]],
      ["nota", "O que foi feito", "text"]] },
  };

  function opcoesDestino(sel) {
    return '<option value="diss"' + (sel === "diss" ? " selected" : "") + ">Dissertação</option>" +
      discsAtivas().map((d) => '<option value="' + esc(d.id) + '"' + (sel === d.id ? " selected" : "") + ">" + esc(d.nome) + "</option>").join("");
  }
  function campoHTML(k, rot, tipo, o, v) {
    o = o || {};
    const id = "fm-" + k, req = o.req ? " required" : "", ph = o.ph ? ' placeholder="' + esc(o.ph) + '"' : "";
    if (v == null || v === "") v = o.def != null ? o.def : v;
    let inp;
    if (tipo === "textarea") inp = '<textarea id="' + id + '"' + req + ph + ">" + esc(v ?? "") + "</textarea>";
    else if (tipo === "select") inp = '<select id="' + id + '">' + o.opts.map(([val, l]) => '<option value="' + esc(val) + '"' + (String(v ?? "") === String(val) ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select>";
    else if (tipo === "destino") inp = '<select id="' + id + '"><option value="">Nenhum</option>' + opcoesDestino(v) + "</select>";
    else if (tipo === "check") return '<div class="f chk"><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + '><label for="' + id + '">' + esc(rot) + "</label></div>";
    else if (tipo === "cor") { const c = v || PALETA[S.disciplinas.length % PALETA.length]; inp = '<div class="chips" id="' + id + '" data-v="' + esc(c) + '">' + PALETA.map((p) => '<button type="button" class="chip" data-act="cor" data-v="' + p + '" aria-pressed="' + (c === p) + '" aria-label="Cor ' + p + '" style="width:30px;height:30px;padding:0;background:' + p + ";border-color:" + p + '"></button>').join("") + "</div>"; }
    else if (tipo === "time") inp = '<input type="time" id="' + id + '"' + req + ' value="' + esc(hm(v)) + '">';
    else inp = '<input type="' + tipo + '" id="' + id + '"' + req + ph + (v != null ? ' value="' + esc(v) + '"' : "") + (tipo === "number" ? ' min="0" step="1"' : "") + ">";
    return '<div class="f"><label for="' + id + '">' + esc(rot) + "</label>" + inp + (o.dica ? '<span class="hint">' + esc(o.dica) + "</span>" : "") + "</div>";
  }
  function abrirModal(html, larga) {
    $("#modal").innerHTML = '<div class="modal-bg" data-act="fundoModal"><div class="modal' + (larga ? " wide" : "") + '" role="dialog" aria-modal="true">' + html + "</div></div>";
    const f = $("#modal input:not([type=checkbox]):not([type=hidden]), #modal textarea, #modal select"); if (f) f.focus();
  }
  const fecharModal = () => { $("#modal").innerHTML = ""; };

  function abrirForm(t, id, pre) {
    const sp = SPECS[t]; const atual = id ? achar(t, id) : null;
    const base = Object.assign({}, atual || {}, pre || {});
    if (base.destino === undefined) base.destino = destValor(base);
    const planos = [];
    const corpo = sp.campos.map((c) => {
      if (Array.isArray(c[0])) { c.forEach((x) => planos.push(x)); return '<div class="' + (c.length === 3 ? "three" : "two") + '">' + c.map((x) => campoHTML(x[0], x[1], x[2], x[3], base[x[0]])).join("") + "</div>"; }
      planos.push(c); return campoHTML(c[0], c[1], c[2], c[3], base[c[0]]);
    }).join("");
    const titulo = (atual ? "Editar " : sp.g === "a" ? "Nova " : "Novo ") + sp.n;
    abrirModal('<form class="form" id="form-modal"><h2>' + esc(titulo.charAt(0).toUpperCase() + titulo.slice(1)) + "</h2>" + corpo +
      '<div class="actions">' + (atual ? '<button type="button" class="btn danger" data-act="excluirPedido" data-t="' + t + '" data-id="' + esc(id) + '">Excluir</button>' : "") +
      '<span class="sp"></span><button type="button" class="btn ghost" data-act="fecharModal">Cancelar</button><button class="btn primary">Salvar</button></div></form>');
    $("#form-modal").addEventListener("submit", async (e) => {
      e.preventDefault();
      const row = {};
      planos.forEach(([k, , tipo]) => {
        const el = document.getElementById("fm-" + k); if (!el) return;
        if (tipo === "check") row[k] = el.checked;
        else if (tipo === "cor") row[k] = el.dataset.v;
        else if (tipo === "number") row[k] = el.value === "" ? null : Number(el.value);
        else if (tipo === "destino") { row.para_dissertacao = el.value === "diss"; row.disciplina_id = el.value && el.value !== "diss" ? el.value : null; }
        else if (tipo === "select" && k === "dia_semana") row[k] = el.value === "" ? null : Number(el.value);
        else { const v = el.value.trim(); row[k] = v === "" ? null : v; }
      });
      if (pre) ["leitura_id"].forEach((k) => { if (pre[k] && !atual) row[k] = pre[k]; });
      if (t === "tarefas") row.concluida_em = row.concluida ? (atual && atual.concluida_em) || HOJE() : null;
      if (t === "leituras") {
        if (row.paginas_total && (atual ? atual.paginas_lidas : 0) > row.paginas_total) row.paginas_lidas = row.paginas_total;
        if (atual && row.referencia !== atual.referencia) row.referencia_conferida = !!row.referencia;
        if (row.doi) row.doi = N.limparDOI(row.doi);
      }
      fecharModal();
      if (atual) { if (await alterar(t, id, row)) toast("Alterações salvas."); }
      else { const r = await criar(t, row); if (r) { toast(sp.g === "a" ? "Criada." : "Criado."); if (t === "leituras") ir("leitura", r.id); } }
    });
  }

  function abrirFormDiss() {
    const d = S.dissertacao || {};
    const campos = [["titulo", "Título provisório", "text"], [["orientador", "Orientador(a)", "text"], ["linha", "Linha de pesquisa", "text"]], ["problema", "Problema de pesquisa", "textarea"], ["hipotese", "Hipótese", "textarea"], ["objetivo_geral", "Objetivo geral", "textarea"], ["objetivos_especificos", "Objetivos específicos", "textarea"], ["metodologia", "Metodologia", "textarea"]];
    const planos = [];
    const corpo = campos.map((c) => { if (Array.isArray(c[0])) { c.forEach((x) => planos.push(x)); return '<div class="two">' + c.map((x) => campoHTML(x[0], x[1], x[2], {}, d[x[0]])).join("") + "</div>"; } planos.push(c); return campoHTML(c[0], c[1], c[2], {}, d[c[0]]); }).join("");
    abrirModal('<form class="form" id="form-modal"><h2>Projeto de pesquisa</h2>' + corpo + '<div class="actions"><span class="sp"></span><button type="button" class="btn ghost" data-act="fecharModal">Cancelar</button><button class="btn primary">Salvar</button></div></form>', true);
    $("#form-modal").addEventListener("submit", async (e) => {
      e.preventDefault();
      const row = {}; planos.forEach(([k]) => { const v = document.getElementById("fm-" + k).value.trim(); row[k] = v || null; });
      fecharModal();
      try { S.dissertacao = await api.salvarDissertacao(row); render(); toast("Projeto salvo."); } catch (err) { falha(err); }
    });
  }

  function abrirFormMeta() {
    UI.menu = false; render();
    abrirModal('<form class="form" id="form-modal"><h2>Meta semanal de estudo</h2>' + campoHTML("meta", "Horas de estudo por semana", "number", { req: 1 }, metaSemana()) +
      '<p class="hint">Conta todas as sessões registradas, pelo cronômetro ou à mão.</p><div class="actions"><span class="sp"></span><button type="button" class="btn ghost" data-act="fecharModal">Cancelar</button><button class="btn primary">Salvar</button></div></form>');
    $("#form-modal").addEventListener("submit", async (e) => {
      e.preventDefault(); const v = Number($("#fm-meta").value) || 0; fecharModal();
      try { S.profile = await api.salvarPerfil({ meta_horas_semana: v }); render(); toast("Meta atualizada."); } catch (err) { falha(err); }
    });
  }

  // --------------------------------------------------------------------------
  // Depósito de textos: analisa, busca dados, envia e cadastra sozinho
  // --------------------------------------------------------------------------
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  async function analisarPDF(file) {
    const out = {};
    if (!window.pdfjsLib) return out;
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    out.paginas = pdf.numPages;
    try {
      const md = await pdf.getMetadata();
      const t = md && md.info && md.info.Title, a = md && md.info && md.info.Author;
      if (t && !/microsoft|word|untitled|sem título|\.docx?|\.pdf|^\s*$/i.test(t) && t.length > 6) out.titulo = String(t).trim();
      if (a && !/^\s*$|user|usuário|admin/i.test(a)) out.autor = String(a).trim();
    } catch (e) { /* PDF sem metadados */ }
    let texto = "";
    for (let i = 1; i <= Math.min(3, pdf.numPages); i++) {
      try { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); texto += tc.items.map((x) => x.str).join(" ") + "\n"; } catch (e) { /* página ilegível */ }
    }
    out.doi = N.acharDOI(texto);
    out.isbn = N.acharISBN(texto);
    out.semTexto = texto.replace(/\s/g, "").length < 40;
    try { pdf.destroy(); } catch (e) { /* ok */ }
    return out;
  }
  async function buscarDOI(doi) {
    const r = await fetch("https://api.crossref.org/works/" + N.limparDOI(doi).split("/").map(encodeURIComponent).join("/"));
    if (!r.ok) throw new Error(r.status === 404 ? "DOI não encontrado na Crossref." : "Crossref respondeu " + r.status);
    return N.obraDaCrossref((await r.json()).message);
  }
  async function buscarISBN(isbn) {
    const r = await fetch("https://brasilapi.com.br/api/isbn/v1/" + N.limparISBN(isbn));
    if (!r.ok) throw new Error(r.status === 404 ? "ISBN não encontrado." : "BrasilAPI respondeu " + r.status);
    return N.obraDoISBN(await r.json());
  }
  const TIPO_ROTULO = { artigo: "Artigo", livro: "Livro", capitulo: "Capítulo de livro" };
  function camposDaObra(o) {
    const [pi, pf] = String(o.paginas || "").split("-");
    return {
      titulo: o.titulo ? o.titulo + (o.subtitulo ? ": " + o.subtitulo : "") : null,
      autores: N.autoresLista(o.autores) || null,
      ano: o.ano || null,
      tipo_obra: TIPO_ROTULO[o.tipo] || null,
      idioma: o.idioma === "pt" ? "português" : o.idioma === "en" ? "inglês" : o.idioma === "es" ? "espanhol" : o.idioma === "de" ? "alemão" : o.idioma === "it" ? "italiano" : o.idioma === "fr" ? "francês" : null,
      doi: o.doi || null, isbn: o.isbn || null,
      referencia: N.montarReferencia(o), referencia_conferida: false,
      pagina_inicial: pi && o.tipo !== "livro" ? pi.trim() : null,
      pagina_final: pf && o.tipo !== "livro" ? pf.trim() : null,
    };
  }

  let depositoArquivos = [];
  function abrirDeposito(files, destino) {
    if (!S.carregado) return;
    UI.menu = false;
    depositoArquivos = (files || []).slice();
    const dest = destino !== undefined ? destino : rota.v === "disciplina" ? rota.id : rota.v === "dissertacao" ? "diss" : "";
    const d = dest && dest !== "diss" ? disc(dest) : null;
    const prazo = d ? proxAula(d) || "" : "";
    abrirModal('<div class="form" id="deposito"><div><h2>Depositar textos</h2><p class="small muted" style="margin-top:4px">Para cada PDF, o hub conta as páginas, procura DOI ou ISBN nas primeiras páginas, busca os dados da obra e monta a referência ABNT. Depois é só conferir.</p></div>' +
      '<div class="two"><div class="f"><label for="dp-dest">Para</label><select id="dp-dest"><option value="">Nenhuma disciplina</option>' + opcoesDestino(dest) + "</select></div>" +
      '<div class="f"><label for="dp-prazo">Ler até</label><input type="date" id="dp-prazo" value="' + esc(prazo) + '"><span class="hint" id="dp-prazo-dica">' + (prazo ? "Próxima aula da disciplina, calculada pelo dia da semana." : "Opcional.") + "</span></div></div>" +
      '<div class="drop" id="dp-drop" data-act="escolherArquivos"><b>Escolher arquivos</b><span class="small muted">ou arraste aqui. PDF, Word, ODT, EPUB, até 50 MB cada.</span></div>' +
      '<div class="proc" id="dp-lista"></div>' +
      '<div class="actions"><span class="sp"></span><button type="button" class="btn ghost" data-act="fecharModal" id="dp-fechar">Cancelar</button><button type="button" class="btn primary" data-act="processarDeposito" id="dp-ir" disabled>Depositar</button></div></div>', true);
    listarDeposito();
  }
  function listarDeposito() {
    const el = $("#dp-lista"); if (!el) return;
    el.innerHTML = depositoArquivos.map((f, i) => '<div class="proc-item" id="dp-i' + i + '"><span class="n">' + esc(f.name) + '</span><span class="xs muted">' + esc(tamanho(f.size)) + '</span><span class="st">Aguardando</span></div>').join("");
    const b = $("#dp-ir"); if (b) { b.disabled = !depositoArquivos.length; b.textContent = depositoArquivos.length > 1 ? "Depositar " + depositoArquivos.length + " arquivos" : "Depositar"; }
  }
  async function processarDeposito() {
    const destV = $("#dp-dest").value, prazo = $("#dp-prazo").value || null;
    const base = { para_dissertacao: destV === "diss", disciplina_id: destV && destV !== "diss" ? destV : null, prazo, status: "A ler", paginas_lidas: 0 };
    $("#dp-ir").disabled = true; $("#dp-fechar").textContent = "Fechar"; $("#dp-drop").hidden = true;
    const feitos = [];
    for (let i = 0; i < depositoArquivos.length; i++) {
      const f = depositoArquivos[i], st = $("#dp-i" + i + " .st");
      const msg = (m, cor) => { if (st) { st.innerHTML = m; st.style.color = cor || ""; } };
      try {
        if (f.size > 52428800) { msg("Maior que 50 MB. Não enviado.", "var(--danger)"); continue; }
        let info = {}, obra = null, notas = [];
        if (ehPDF(f)) { msg("Lendo o PDF…"); try { info = await analisarPDF(f); } catch (e) { notas.push("não consegui ler o PDF"); } }
        if (info.doi) { msg("DOI encontrado (" + esc(info.doi) + "). Buscando dados na Crossref…"); try { obra = await buscarDOI(info.doi); } catch (e) { notas.push("DOI encontrado, mas a busca falhou"); } }
        if (!obra && info.isbn) { msg("ISBN encontrado. Buscando dados…"); try { obra = await buscarISBN(info.isbn); } catch (e) { notas.push("ISBN encontrado, mas a busca falhou"); } }
        msg("Enviando o arquivo…");
        const path = await api.enviar(f, "leituras");
        const row = Object.assign({}, base, {
          titulo: info.titulo || tituloDoArquivo(f.name), autores: info.autor || null,
          doi: info.doi || null, isbn: info.isbn || null,
          paginas_total: info.paginas || null,
          arquivo_path: path, arquivo_nome: f.name, arquivo_tamanho: f.size,
        });
        if (obra) Object.entries(camposDaObra(obra)).forEach(([k, v]) => { if (v != null && v !== "") row[k] = v; });
        if (!row.paginas_total && obra && obra.paginasTotal) row.paginas_total = obra.paginasTotal;
        const r = await criar("leituras", row);
        if (!r) { msg("Arquivo enviado, mas o cadastro falhou.", "var(--danger)"); continue; }
        feitos.push(r);
        const partes = [];
        if (info.paginas) partes.push(plural(info.paginas, "página", "páginas"));
        partes.push(obra ? "dados da obra preenchidos, referência montada (confira)" : "sem DOI ou ISBN no texto: complete os dados");
        if (info.semTexto) partes.push("o PDF parece ser imagem escaneada");
        msg("✓ " + partes.concat(notas).map(esc).join(" · ") + ' · <a href="#" data-act="abrirDepositado" data-id="' + esc(r.id) + '">abrir</a>', "var(--ok)");
      } catch (e) { msg(esc(msgErro(e)), "var(--danger)"); }
    }
    depositoArquivos = [];
    if (feitos.length) toast(plural(feitos.length, "texto depositado", "textos depositados") + ".");
  }

  async function enviarMaterial(dest, files) {
    for (const f of files) {
      try {
        if (f.size > 52428800) { toast(f.name + ": maior que 50 MB."); continue; }
        toast("Enviando " + f.name + "…", 20000);
        const path = await api.enviar(f, "materiais");
        await criar("materiais", { titulo: tituloDoArquivo(f.name), arquivo_path: path, arquivo_nome: f.name, arquivo_tamanho: f.size, para_dissertacao: dest === "diss", disciplina_id: dest && dest !== "diss" ? dest : null });
        toast("Material enviado.");
      } catch (e) { falha(e); }
    }
  }

  let modoPicker = null;
  function escolherArquivos(modo) {
    modoPicker = modo;
    const p = $("#file-picker"); p.value = "";
    p.accept = ".pdf,.doc,.docx,.odt,.epub,.ppt,.pptx";
    p.click();
  }
  $("#file-picker").addEventListener("change", (e) => {
    const fs = [...e.target.files]; if (!fs.length || !modoPicker) return;
    const m = modoPicker; modoPicker = null;
    if (m.tipo === "deposito") { depositoArquivos = depositoArquivos.concat(fs); listarDeposito(); }
    else if (m.tipo === "material") enviarMaterial(m.dest, fs);
    else if (m.tipo === "anexo") anexarArquivo(m.id, fs[0]);
  });
  async function anexarArquivo(id, f) {
    try {
      toast("Enviando " + f.name + "…", 20000);
      const info = ehPDF(f) ? await analisarPDF(f).catch(() => ({})) : {};
      const path = await api.enviar(f, "leituras");
      const l = achar("leituras", id);
      const patch = { arquivo_path: path, arquivo_nome: f.name, arquivo_tamanho: f.size };
      if (info.paginas && !l.paginas_total) patch.paginas_total = info.paginas;
      if (info.doi && !l.doi) patch.doi = info.doi;
      await alterar("leituras", id, patch); toast("Arquivo anexado.");
    } catch (e) { falha(e); }
  }

  // Arrastar arquivos para qualquer lugar do hub
  let arrastando = 0;
  const temArquivos = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!temArquivos(e) || !S.carregado) return; arrastando++; if (!$("#deposito")) $("#drop-overlay").hidden = false; });
  window.addEventListener("dragleave", () => { arrastando = Math.max(0, arrastando - 1); if (!arrastando) $("#drop-overlay").hidden = true; });
  window.addEventListener("dragover", (e) => { if (temArquivos(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    if (!temArquivos(e)) return;
    e.preventDefault(); arrastando = 0; $("#drop-overlay").hidden = true;
    if (!S.carregado) return;
    const fs = [...e.dataTransfer.files]; if (!fs.length) return;
    if ($("#deposito")) { if (!$("#dp-drop").hidden) { depositoArquivos = depositoArquivos.concat(fs); listarDeposito(); } return; }
    abrirDeposito(fs);
  });

  // --------------------------------------------------------------------------
  // Área de transferência
  // --------------------------------------------------------------------------
  async function copiar(texto, html, okMsg) {
    try {
      if (html && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([texto], { type: "text/plain" }) })]);
      } else await navigator.clipboard.writeText(texto);
      toast(okMsg);
    } catch (e) { toast("Não foi possível copiar automaticamente. Selecione o texto e copie à mão."); }
  }

  // --------------------------------------------------------------------------
  // Eventos (delegação: um ouvinte para a página inteira)
  // --------------------------------------------------------------------------
  const ACOES = {
    loginVoltar: () => { loginEnviado = false; erroLogin = ""; render(); },
    sair: async () => { UI.menu = false; await api.sair(); },
    menu: () => { UI.menu = !UI.menu; render(); },
    nav: (el) => ir(el.dataset.v, el.dataset.id),
    novo: (el) => {
      const pre = {};
      if (el.dataset.dest) pre.destino = el.dataset.dest;
      if (el.dataset.dia != null) pre.dia_semana = el.dataset.dia;
      if (el.dataset.t === "sessoes") { pre.data = HOJE(); pre.minutos = null; }
      if (el.dataset.t === "reunioes") pre.data = HOJE();
      if (el.dataset.t === "capitulos") pre.ordem = S.capitulos.length + 1;
      if (el.dataset.t === "leituras" && pre.destino && pre.destino !== "diss" && disc(pre.destino)) pre.prazo = proxAula(disc(pre.destino));
      abrirForm(el.dataset.t, null, pre);
    },
    editar: (el) => abrirForm(el.dataset.t, el.dataset.id),
    editarDiss: () => abrirFormDiss(),
    editarMeta: () => abrirFormMeta(),
    fecharModal: () => fecharModal(),
    fundoModal: (el, e) => { if (e.target === el && !$("#deposito")) fecharModal(); },
    excluirPedido: (el) => { el.textContent = "Confirmar exclusão"; el.dataset.act = "excluirModal"; },
    excluirModal: async (el) => { fecharModal(); const t = el.dataset.t, id = el.dataset.id; await excluir(t, id); if (t === "leituras" && rota.v === "leitura") ir("leituras"); if (t === "disciplinas" && rota.v === "disciplina") ir("disciplinas"); },
    pedirConfirmacao: (el) => { UI.confirmar = el.dataset.id; render(); },
    excluirConfirmado: (el) => { UI.confirmar = null; excluir(el.dataset.t, el.dataset.id); },
    cor: (el) => { const w = el.parentElement; w.dataset.v = el.dataset.v; $$(".chip", w).forEach((c) => c.setAttribute("aria-pressed", String(c === el))); },
    filtro: (el) => { UI[el.dataset.k] = el.dataset.v; render(); },
    depositar: (el) => abrirDeposito([], el.dataset.dest),
    escolherArquivos: () => escolherArquivos({ tipo: "deposito" }),
    processarDeposito: () => processarDeposito(),
    abrirDepositado: (el) => { fecharModal(); ir("leitura", el.dataset.id); },
    enviarMaterial: (el) => escolherArquivos({ tipo: "material", dest: el.dataset.dest }),
    anexarLeitura: (el) => escolherArquivos({ tipo: "anexo", id: el.dataset.id }),
    abrirArquivo: async (el) => {
      // A janela é aberta já no clique (exigência dos navegadores) e recebe o link temporário em seguida.
      const w = window.open("about:blank", "_blank");
      try { const url = await api.linkArquivo(el.dataset.path); if (w) w.location.href = url; else location.href = url; }
      catch (e) { if (w) w.close(); falha(e); }
    },
    marcarFichado: (el) => alterar("leituras", el.dataset.id, { status: "Fichado" }),
    prazoProxAula: (el) => { const l = achar("leituras", el.dataset.id); alterar("leituras", l.id, { prazo: proxAula(disc(l.disciplina_id)) }); },
    addCitacao: async (el) => {
      const trecho = $("#cit-trecho").value.trim(); if (!trecho) { toast("Escreva o trecho antes de adicionar."); $("#cit-trecho").focus(); return; }
      const r = await criar("citacoes", { leitura_id: el.dataset.id, pagina: $("#cit-pag").value.trim() || null, trecho, comentario: $("#cit-com").value.trim() || null });
      if (r) { toast("Citação adicionada."); const t = $("#cit-trecho"); if (t) t.focus(); }
    },
    copiarCitacao: (el) => {
      const c = achar("citacoes", el.dataset.id); const l = achar("leituras", c.leitura_id) || {};
      const txt = "“" + c.trecho + "”" + (c.pagina ? " (p. " + c.pagina + ")" : "");
      copiar(txt + (l.referencia ? "\n\n" + N.refTexto(l.referencia) : ""), esc(txt).replace(/\n/g, "<br>") + (l.referencia ? "<br><br>" + N.refHTML(l.referencia) : ""), "Citação copiada com a página e a referência.");
    },
    copiarRef: (el) => { const l = achar("leituras", el.dataset.id); copiar(N.refTexto(l.referencia), N.refHTML(l.referencia), "Referência copiada. No Word, o negrito vai junto."); },
    buscarDados: async (el) => {
      const v = $("#busca-id").value.trim(); if (!v) { toast("Cole o DOI ou o ISBN."); return; }
      const ehDoi = /10\.\d{4,9}\//.test(v);
      el.disabled = true; el.textContent = "Buscando…";
      try {
        const o = ehDoi ? await buscarDOI(v) : await buscarISBN(v);
        const patch = {}; Object.entries(camposDaObra(o)).forEach(([k, val]) => { if (val != null && val !== "") patch[k] = val; });
        const l = achar("leituras", el.dataset.id);
        if (o.paginasTotal && !l.paginas_total) patch.paginas_total = o.paginasTotal;
        await alterar("leituras", el.dataset.id, patch);
        toast(ehDoi ? "Dados preenchidos pela Crossref. Confira a referência." : "Dados preenchidos pela BrasilAPI. Confira autores e tradutores na referência.", 6000);
      } catch (e) { toast(String(e.message || e).includes("fetch") ? "Não foi possível consultar o serviço agora. Tente mais tarde ou preencha à mão." : e.message, 6000); el.disabled = false; el.textContent = "Buscar"; }
    },
    pomoIniciar: () => iniciarFase(),
    pomoPausar: () => { P.rodando = false; cancelarBips(); document.title = "Hub do Mestrado"; render(); },
    pomoPular: () => { P.rodando = false; cancelarBips(); P.aviso = ""; mudarFase(P.fase === "foco" ? proximaPausa() : "foco"); render(); },
    pomoZerar: () => { P.rodando = false; cancelarBips(); P.aviso = ""; P.resta = duracao(P.fase); document.title = "Hub do Mestrado"; render(); },
    pomoRegistrar: () => registrarParcial(),
    pomoFase: (el) => { if (P.rodando) return; P.aviso = ""; mudarFase(el.dataset.v); render(); },
    pomoAjustar: () => abrirAjustesPomodoro(),
    pomoTestar: () => { prepararAudio(); const som = PC.som; PC.som = true; agendarBip(0.05, "foco"); PC.som = som; },
    verBibliografia: () => { UI.leitDest = "diss"; UI.leitStatus = "todas"; ir("leituras"); },
    instalar: async () => {
      UI.menu = false; render();
      if (instalar) { instalar.prompt(); try { await instalar.userChoice; } catch (e) { /* ok */ } instalar = null; return; }
      abrirModal('<div class="form"><h2>Instalar como aplicativo</h2><p>O hub pode ficar na tela inicial do celular e na barra de aplicativos do computador, abrindo em janela própria.</p>' +
        '<dl class="dl"><dt>iPhone ou iPad</dt><dd>Abra o hub no Safari, toque em Compartilhar e escolha "Adicionar à Tela de Início".</dd><dt>Android</dt><dd>No Chrome, abra o menu (três pontos) e toque em "Instalar app" ou "Adicionar à tela inicial".</dd><dt>Computador</dt><dd>No Chrome ou no Edge, clique no ícone de instalar que aparece na barra de endereço.</dd></dl>' +
        '<div class="actions"><span class="sp"></span><button class="btn primary" data-act="fecharModal">Entendi</button></div></div>');
    },
  };

  const MUDANCAS = {
    // filtros
    leitDest: (el) => { UI.leitDest = el.value; render(); },
    citDest: (el) => { UI.citDest = el.value; render(); },
    tarDest: (el) => { UI.tarDest = el.value; render(); },
  };

  document.addEventListener("click", (e) => {
    if (UI.menu && !e.target.closest(".menu") && !e.target.closest('[data-act="menu"]')) { UI.menu = false; render(); }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const f = ACOES[el.dataset.act]; if (!f) return;
    if (el.dataset.act !== "fundoModal") e.preventDefault();
    if (el.closest("tr.clickable") && el.tagName === "BUTTON" && el.dataset.act !== "nav") e.stopPropagation();
    f(el, e);
  }, true);

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.change && MUDANCAS[el.dataset.change]) return MUDANCAS[el.dataset.change](el);
    if (el.dataset.tarefa) { const c = el.checked; return alterar("tarefas", el.dataset.tarefa, { concluida: c, concluida_em: c ? HOJE() : null }); }
    if (el.dataset.marco) return alterar("marcos", el.dataset.marco, { concluido: el.checked });
    if (el.dataset.conferida) return alterar("leituras", el.dataset.conferida, { referencia_conferida: el.checked });
    if (el.dataset.palavras) return alterar("capitulos", el.dataset.palavras, { palavras: Math.max(0, Number(el.value) || 0) });
    if (el.dataset.prazo) return alterar("leituras", el.dataset.prazo, { prazo: el.value || null });
    if (el.dataset.total) {
      const l = achar("leituras", el.dataset.total); const t = el.value === "" ? null : Math.max(0, Number(el.value));
      const patch = { paginas_total: t }; if (t && l.paginas_lidas > t) patch.paginas_lidas = t;
      return alterar("leituras", l.id, patch);
    }
    if (el.dataset.pagina) {
      // Situação automática: começou a ler -> Lendo; chegou ao fim -> Lido.
      const l = achar("leituras", el.dataset.pagina); let p = Math.max(0, Number(el.value) || 0);
      if (l.paginas_total) p = Math.min(p, l.paginas_total);
      const patch = { paginas_lidas: p };
      if (p > 0 && l.status === "A ler") patch.status = "Lendo";
      if (l.paginas_total && p >= l.paginas_total && (l.status === "A ler" || l.status === "Lendo")) patch.status = "Lido";
      if (patch.status === "Lido") toast("Leitura concluída. Que tal fechar o fichamento?");
      return alterar("leituras", l.id, patch);
    }
    if (el.dataset.salvarLeitura) {
      const k = el.dataset.salvarLeitura, id = rota.id, v = el.value.trim() || null;
      const l = achar("leituras", id); if (!l || (l[k] || null) === v) return;
      UI.salvoCampo = id + k;
      alterar("leituras", id, { [k]: v }).then(() => setTimeout(() => { if (UI.salvoCampo === id + k) { UI.salvoCampo = null; const s = $(".saved"); if (s) s.remove(); } }, 2000));
    }
    if (el.id === "dp-dest") {
      const d = el.value && el.value !== "diss" ? disc(el.value) : null; const pa = d ? proxAula(d) : null;
      $("#dp-prazo").value = pa || ""; $("#dp-prazo-dica").textContent = pa ? "Próxima aula da disciplina, calculada pelo dia da semana." : "Opcional.";
    }
  });

  let buscaT;
  document.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.input; if (!k) return;
    UI[k] = e.target.value; clearTimeout(buscaT); buscaT = setTimeout(render, 160);
  });

  function erroDeLogin(e) {
    const m = String((e && e.message) || e || "");
    if (/database error|saving new user|signups not allowed/i.test(m)) return "Este e-mail não está autorizado a usar o hub.";
    if (/rate limit|too many|security purposes/i.test(m)) return "Muitos pedidos seguidos. Espere alguns minutos e tente de novo.";
    if (/expired|invalid/i.test(m)) return "Código inválido ou expirado. Peça um novo link.";
    return msgErro(e);
  }
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (f.dataset.form === "login") {
      e.preventDefault(); loginEmail = $("#login-email").value.trim().toLowerCase(); erroLogin = ""; loginOcupado = true; render();
      try { await api.enviarLink(loginEmail); loginEnviado = true; } catch (err) { erroLogin = erroDeLogin(err); }
      loginOcupado = false; render(); return;
    }
    if (f.dataset.form === "codigo") {
      e.preventDefault(); const cod = $("#login-codigo").value.replace(/\s/g, ""); if (!cod) return;
      erroLogin = ""; loginOcupado = true; render();
      try { await api.verificarCodigo(loginEmail, cod); } catch (err) { erroLogin = erroDeLogin(err); }
      loginOcupado = false; render(); return;
    }
    if (f.dataset.form !== "addTarefa") return;
    e.preventDefault();
    const sfx = f.dataset.dest ? "-d" : "";
    const titulo = $("#qt-titulo" + sfx, f).value.trim(); if (!titulo) return;
    const dest = f.dataset.dest || ($("#qt-dest", f) ? $("#qt-dest", f).value : "");
    const r = await criar("tarefas", { titulo, prazo: $("#qt-prazo" + sfx, f).value || null, para_dissertacao: dest === "diss", disciplina_id: dest && dest !== "diss" ? dest : null, prioridade: "Média", concluida: false });
    if (r) { toast("Tarefa adicionada."); const t = document.getElementById("qt-titulo" + sfx); if (t) t.focus(); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#modal").innerHTML) fecharModal();
    if (e.key === "Escape" && UI.menu) { UI.menu = false; render(); }
  });

  // --------------------------------------------------------------------------
  // Aplicativo instalável (PWA)
  // --------------------------------------------------------------------------
  const ehStandalone = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); instalar = e; });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* fora do site publicado, sem service worker */ });
  }

  // --------------------------------------------------------------------------
  // Dados de demonstração (fictícios, marcados como exemplo)
  // --------------------------------------------------------------------------
  function dadosDemo() {
    const H = N.hoje(), D = (n) => N.somarDias(H, n);
    const d1 = uuid(), d2 = uuid(), d3 = uuid();
    const dow = (n) => (N.diaSemana(H) + n) % 7;
    const disciplinas = [
      { id: d1, nome: "Teoria do Direito (exemplo)", professor: "Prof.ª Exemplo A", semestre: "2026.2", dia_semana: dow(3), hora_inicio: "14:00:00", hora_fim: "17:00:00", inicio_aulas: D(-50), fim_aulas: D(60), cor: PALETA[0], avaliacao: "Seminário (40%) e artigo final (60%)", notas: "Textos lidos na língua original.", ativa: true },
      { id: d2, nome: "Contratos e Confiança (exemplo)", professor: "Prof. Exemplo B", semestre: "2026.2", dia_semana: dow(1), hora_inicio: "19:00:00", hora_fim: "22:00:00", inicio_aulas: D(-50), fim_aulas: D(60), cor: PALETA[1], avaliacao: "Guias de leitura e seminário", notas: "", ativa: true },
      { id: d3, nome: "Metodologia da Pesquisa (exemplo)", professor: "Prof.ª Exemplo C", semestre: "2026.2", dia_semana: dow(5), hora_inicio: "08:00:00", hora_fim: "11:00:00", inicio_aulas: D(-50), fim_aulas: D(30), cor: PALETA[2], avaliacao: "Projeto revisado", notas: "", ativa: true },
    ];
    const L = (o) => Object.assign({ id: uuid(), created_at: new Date().toISOString(), para_dissertacao: false, status: "A ler", paginas_lidas: 0, referencia_conferida: false }, o);
    const l1 = L({ titulo: "Texto de exemplo sobre confiança contratual", autores: "AUTORA, Exemplo", ano: 2021, tipo_obra: "Artigo", disciplina_id: d2, prazo: N.proximaAula(disciplinas[1], H), paginas_total: 34, paginas_lidas: 12, status: "Lendo", referencia: "AUTORA, Exemplo. Texto de exemplo sobre confiança contratual. **Revista de Exemplo**, [S. l.], v. 1, n. 2, p. 10-43, 2021.", doi: "10.0000/exemplo.1" });
    const l2 = L({ titulo: "Livro de exemplo de teoria do direito", autores: "AUTOR, Exemplo", ano: 2019, tipo_obra: "Livro", idioma: "inglês", disciplina_id: d1, prazo: N.proximaAula(disciplinas[0], H), paginas_total: 60, paginas_lidas: 0, referencia: "AUTOR, Exemplo. **Livro de exemplo de teoria do direito**. Cidade: Editora Exemplo, 2019.", referencia_conferida: true });
    const l3 = L({ titulo: "Capítulo de exemplo sobre pesquisa empírica", autores: "PESQUISADORA, Exemplo", ano: 2020, tipo_obra: "Capítulo de livro", disciplina_id: d3, prazo: N.proximaAula(disciplinas[2], H), paginas_total: 28 });
    const l4 = L({ titulo: "Artigo de exemplo para a dissertação", autores: "ESTUDIOSO, Exemplo; COLEGA, Exemplo", ano: 2022, tipo_obra: "Artigo", para_dissertacao: true, paginas_total: 22, paginas_lidas: 22, status: "Fichado", ideias: "Exemplo de ideia central registrada no fichamento.", critica: "Exemplo de análise crítica.", conexao: "Usar no capítulo 2.", referencia: "ESTUDIOSO, Exemplo; COLEGA, Exemplo. Artigo de exemplo para a dissertação. **Periódico de Exemplo**, [S. l.], v. 3, n. 1, p. 1-22, 2022.", referencia_conferida: true });
    const l5 = L({ titulo: "Segundo texto de exemplo", autores: "AUTOR, Outro Exemplo", ano: 2018, tipo_obra: "Artigo", disciplina_id: d2, paginas_total: 18 });
    const citacoes = [
      { id: uuid(), leitura_id: l4.id, pagina: "7", trecho: "Trecho de exemplo: aqui entra a citação direta, copiada exatamente do original.", comentario: "Exemplo de comentário.", created_at: new Date().toISOString() },
      { id: uuid(), leitura_id: l1.id, pagina: "15-16", trecho: "Outro trecho de exemplo, que atravessa duas páginas.", comentario: null, created_at: new Date().toISOString() },
    ];
    const T = (titulo, dest, tipo, dd, pr, feita) => ({ id: uuid(), titulo, disciplina_id: dest === "diss" ? null : dest, para_dissertacao: dest === "diss", tipo, prazo: dd == null ? null : D(dd), prioridade: pr, concluida: !!feita, concluida_em: feita ? D(-1) : null, created_at: new Date().toISOString() });
    const tarefas = [
      T("Enviar resumo do capítulo 1 ao orientador", "diss", "Orientação", -1, "Alta"),
      T("Preparar roteiro do seminário", d2, "Seminário", 4, "Alta"),
      T("Guia de leitura do texto 5", d2, "Fichamento", 2, "Média"),
      T("Projeto do artigo final", d1, "Artigo", 25, "Média"),
      T("Revisar referências do projeto", d3, "Outro", null, "Baixa"),
      T("Ler texto introdutório", d1, "Leitura", -6, "Média", true),
    ];
    const capitulos = [[1, "Introdução", "Rascunho", 1800, 3000], [2, "Primeiro capítulo de exemplo", "Revisão", 9200, 12000], [3, "Segundo capítulo de exemplo", "Rascunho", 4100, 12000], [4, "Terceiro capítulo de exemplo", "Planejado", 0, 12000], [5, "Conclusão", "Planejado", 0, 2500]]
      .map(([ordem, titulo, status, palavras, meta]) => ({ id: uuid(), ordem, titulo, status, palavras, meta_palavras: meta, created_at: new Date().toISOString() }));
    const marcos = [["Projeto revisado entregue", -20, true], ["Depósito", 200, false], ["Defesa", 240, false]].map(([titulo, d, c]) => ({ id: uuid(), titulo, data: D(d), concluido: c }));
    const reunioes = [{ id: uuid(), data: D(-12), pauta: "Recorte do problema e bibliografia do capítulo 1.", encaminhamentos: "Reduzir o recorte temporal. Enviar resumo do capítulo 1.", created_at: new Date().toISOString() }];
    const blocos = [[0, "08:00", "10:00", "Leitura para a dissertação", "diss"], [2, "19:00", "21:00", "Fichamentos", d1], [3, "08:00", "10:00", "Escrita da dissertação", "diss"], [5, "09:00", "12:00", "Escrita da dissertação", "diss"]]
      .map(([dia, i, f, a, dest]) => ({ id: uuid(), dia_semana: dia, inicio: i + ":00", fim: f + ":00", atividade: a, disciplina_id: dest === "diss" ? null : dest, para_dissertacao: dest === "diss", created_at: new Date().toISOString() }));
    const sessoes = [[0, 50, d2], [-1, 90, "diss"], [-2, 50, d1], [-3, 120, "diss"], [-4, 60, d3], [-6, 75, d2], [-8, 100, "diss"], [-9, 50, d1], [-10, 120, "diss"], [-12, 60, d3], [-13, 45, d2], [-15, 110, "diss"], [-16, 50, d1], [-18, 90, "diss"], [-20, 60, d3], [-23, 80, "diss"], [-26, 70, d1], [-30, 100, "diss"], [-34, 60, d2], [-38, 90, "diss"], [-44, 75, d1], [-48, 60, "diss"], [-52, 45, d2]]
      .map(([d, m, dest]) => ({ id: uuid(), data: D(d), minutos: m, disciplina_id: dest === "diss" ? null : dest, para_dissertacao: dest === "diss", created_at: new Date().toISOString() }));
    return {
      profile: { full_name: "", meta_horas_semana: 15 },
      dissertacao: { titulo: "Tema de exemplo da dissertação", orientador: "Prof. Dr. Exemplo", linha: "Linha de pesquisa de exemplo", problema: "Pergunta de pesquisa de exemplo.", hipotese: "Hipótese de exemplo.", objetivo_geral: "Objetivo geral de exemplo.", objetivos_especificos: "1. Objetivo específico de exemplo\n2. Objetivo específico de exemplo", metodologia: "Metodologia de exemplo." },
      disciplinas, leituras: [l1, l2, l3, l4, l5], citacoes, tarefas, materiais: [], capitulos, marcos, reunioes, blocos, sessoes,
    };
  }

  // --------------------------------------------------------------------------
  // Início
  // --------------------------------------------------------------------------
  async function iniciar() {
    api = DEMO ? apiDemo() : apiSupabase();
    // Erro devolvido pelo login (ex.: e-mail fora da lista autorizada)
    const q = new URLSearchParams(location.search);
    const hq = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const errDesc = q.get("error_description") || q.get("error") || hq.get("error_description");
    const vemDoLink = hq.has("access_token") || hq.has("error");
    if (errDesc) {
      erroLogin = /database error|saving new user|não autorizado/i.test(errDesc)
        ? "Este e-mail não está autorizado a usar o hub."
        : /expired|invalid/i.test(errDesc) ? "O link expirou ou já foi usado. Peça um novo." : "Não foi possível entrar: " + errDesc;
      try { history.replaceState(null, "", location.pathname); } catch (e) { /* ok */ }
    }
    if (!vemDoLink) lerHash();
    try { S.sessao = await api.sessao(); } catch (e) { S.sessao = null; }
    if (!DEMO && (q.get("code") || vemDoLink)) { try { history.replaceState(null, "", location.pathname + (vemDoLink ? "" : location.hash)); } catch (e) { /* ok */ } }
    render();
    api.aoMudarSessao((ev, s) => {
      const tinha = !!S.sessao; S.sessao = s;
      if (s && !tinha) recarregar();
      if (!s) { S.carregado = false; TABELAS.forEach((t) => (S[t] = [])); render(); }
    });
    if (S.sessao || DEMO) recarregar();
  }
  iniciar();
})();
