// ============================================================================
// NÚCLEO: regras puras do hub (datas, aulas, ritmo de leitura, ABNT).
// Não conversa com banco nem com a tela. Mesma entrada, mesma saída.
// Por isso as aulas e os ritmos são CALCULADOS na hora, nunca agendados:
// não existe nada que possa "parar de rodar" sem ninguém perceber.
// ============================================================================
(function (global) {
  "use strict";

  // ---------- Datas (sempre no fuso local, formato AAAA-MM-DD) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const hoje = (agora) => ymd(agora || new Date());
  const somarDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diasEntre = (de, ate) => Math.round((parse(ate) - parse(de)) / 86400000);
  // 0 = segunda ... 6 = domingo
  const diaSemana = (s) => (parse(s).getDay() + 6) % 7;
  const inicioSemana = (s) => somarDias(s, -diaSemana(s));

  // Próxima aula de uma disciplina a partir de uma data (inclusive).
  // Se a aula é hoje mas já terminou (agora > hora_fim), vai para a próxima semana.
  function proximaAula(disc, refData, agora) {
    if (!disc || disc.dia_semana == null || disc.dia_semana === "") return null;
    const alvo = Number(disc.dia_semana);
    let d = refData;
    if (disc.inicio_aulas && d < disc.inicio_aulas) d = disc.inicio_aulas;
    const delta = (alvo - diaSemana(d) + 7) % 7;
    d = somarDias(d, delta);
    if (agora && disc.hora_fim && d === hoje(agora)) {
      const hm = pad(agora.getHours()) + ":" + pad(agora.getMinutes());
      if (hm > String(disc.hora_fim).slice(0, 5)) d = somarDias(d, 7);
    }
    if (disc.fim_aulas && d > disc.fim_aulas) return null;
    return d;
  }

  // Todas as aulas de uma disciplina entre duas datas (inclusive).
  function aulasEntre(disc, de, ate) {
    const out = [];
    let d = proximaAula(disc, de);
    while (d && d <= ate) { out.push(d); d = proximaAula(disc, somarDias(d, 1)); }
    return out;
  }

  // Ritmo de leitura: quantas páginas por dia até o prazo.
  // Conta o dia de hoje e exclui o dia do prazo (leitura pronta ANTES da aula).
  function ritmoLeitura(total, lidas, prazo, refData) {
    total = Number(total) || 0; lidas = Number(lidas) || 0;
    const restante = Math.max(0, total - lidas);
    if (!prazo || !total) return { restante, dias: null, porDia: null };
    const dias = diasEntre(refData, prazo);
    if (restante === 0) return { restante, dias, porDia: 0 };
    if (dias <= 0) return { restante, dias, porDia: restante };
    return { restante, dias, porDia: Math.ceil(restante / dias) };
  }

  // Ritmo de escrita até um marco.
  function ritmoEscrita(escritas, meta, dataMarco, refData) {
    const restante = Math.max(0, (Number(meta) || 0) - (Number(escritas) || 0));
    if (!dataMarco || !meta) return { restante, dias: null, porDia: null };
    const dias = diasEntre(refData, dataMarco);
    if (restante === 0) return { restante, dias, porDia: 0 };
    if (dias <= 0) return { restante, dias, porDia: restante };
    return { restante, dias, porDia: Math.ceil(restante / dias) };
  }

  // ---------- ABNT NBR 6023 ----------
  // O destaque (negrito) é marcado no texto entre ** e **. Ao copiar, vira
  // negrito de verdade no Word; no texto simples, os asteriscos somem.
  const MESES = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const SUFIXOS = ["filho", "filha", "júnior", "junior", "jr.", "neto", "neta", "sobrinho", "sobrinha"];

  // "Luís Roberto Barroso" -> { family: "Barroso", given: "Luís Roberto" }
  // "José da Silva Filho"  -> { family: "Silva Filho", given: "José da" }
  function separarNome(nome) {
    const p = String(nome || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (!p.length) return { family: "", given: "" };
    if (p.length === 1) return { family: p[0], given: "" };
    let fam = p.pop();
    if (SUFIXOS.includes(fam.toLowerCase()) && p.length > 1) fam = p.pop() + " " + fam;
    return { family: fam, given: p.join(" ") };
  }
  const autorABNT = (a) => String(a.family || "").toUpperCase() + (a.given ? ", " + a.given : "");
  // Até três autores: todos. Mais de três: o primeiro seguido de et al.
  function autoresABNT(lista) {
    const v = (lista || []).filter((a) => a && a.family);
    if (!v.length) return "";
    if (v.length > 3) return autorABNT(v[0]) + " et al.";
    return v.map(autorABNT).join("; ");
  }
  // Lista completa, para exibir no hub (não para a referência).
  const autoresLista = (lista) => (lista || []).filter((a) => a && a.family).map(autorABNT).join("; ");

  const fecha = (s) => (/[.?!]$/.test(String(s).trim()) ? String(s).trim() : String(s).trim() + ".");
  const primeiraMaiuscula = (t) => { const p = String(t).split(" "); p[0] = p[0].toUpperCase(); return p.join(" "); };

  function montarReferencia(o) {
    const aut = autoresABNT(o.autores);
    const sub = o.subtitulo ? ": " + o.subtitulo : "";
    const local = o.local || "[S. l.]";
    const editora = o.editora || "[s. n.]";
    const ano = o.ano ? String(o.ano) : "[ano?]";
    const doi = o.doi ? " DOI: " + o.doi + "." : "";
    const pag = o.paginas ? "p. " + o.paginas : "";

    if (o.tipo === "livro") {
      const tit = "**" + (aut ? o.titulo : primeiraMaiuscula(o.titulo)) + "**" + sub;
      return (aut ? fecha(aut) + " " : "") + fecha(tit) + " " + local + ": " + editora + ", " + ano + "." + doi;
    }
    if (o.tipo === "capitulo") {
      const org = autoresABNT(o.organizadores);
      const tit = aut ? o.titulo + sub : primeiraMaiuscula(o.titulo) + sub;
      return (aut ? fecha(aut) + " " : "") + fecha(tit) + " In: " + (org ? org + " (org.). " : "") +
        fecha("**" + (o.periodico || "[título do livro?]") + "**") + " " + local + ": " + editora + ", " + ano + "." +
        (pag ? " " + pag + "." : "") + doi;
    }
    if (o.tipo === "artigo") {
      const tit = aut ? o.titulo + sub : primeiraMaiuscula(o.titulo) + sub;
      const partes = ["**" + (o.periodico || "[periódico?]") + "**", local];
      if (o.volume) partes.push("v. " + o.volume);
      if (o.numero) partes.push("n. " + o.numero);
      if (pag) partes.push(pag);
      partes.push((o.mes ? MESES[o.mes - 1] + " " : "") + ano);
      return (aut ? fecha(aut) + " " : "") + fecha(tit) + " " + partes.join(", ") + "." + doi;
    }
    const tit = aut ? o.titulo + sub : primeiraMaiuscula(o.titulo) + sub;
    return (aut ? fecha(aut) + " " : "") + fecha(tit) + " " + ano + "." + doi;
  }

  const refTexto = (r) => String(r || "").replace(/\*\*(.+?)\*\*/g, "$1");
  const escHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const refHTML = (r) => escHTML(r).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Crossref (busca por DOI) -> obra
  function obraDaCrossref(m) {
    const t = m.type || "";
    const tipo = t === "journal-article" ? "artigo"
      : /^(book-chapter|book-section|book-part)$/.test(t) ? "capitulo"
      : /^(book|monograph|edited-book|reference-book)$/.test(t) ? "livro" : "outro";
    const dp = ((m["published-print"] || m.published || m.issued || {})["date-parts"] || [[]])[0] || [];
    const pessoa = (a) => a.family ? { family: a.family, given: a.given || "" } : (a.name ? { family: a.name, given: "" } : null);
    return {
      tipo,
      autores: (m.author || []).map(pessoa).filter(Boolean),
      organizadores: (m.editor || []).map(pessoa).filter(Boolean),
      titulo: ((m.title || [])[0] || "").trim(),
      subtitulo: ((m.subtitle || [])[0] || "").trim(),
      periodico: ((m["container-title"] || [])[0] || "").trim(),
      volume: m.volume || "",
      numero: m.issue || "",
      paginas: m.page || "",
      ano: dp[0] || null,
      mes: tipo === "artigo" && dp[1] ? dp[1] : null,
      local: m["publisher-location"] || "",
      editora: tipo === "artigo" ? "" : (m.publisher || ""),
      doi: m.DOI || "",
      idioma: m.language || "",
    };
  }

  // BrasilAPI (busca por ISBN) -> obra
  // Atenção: a BrasilAPI informa em "authors" autores, tradutores e colaboradores juntos.
  function obraDoISBN(d) {
    return {
      tipo: "livro",
      autores: (d.authors || []).map(separarNome).filter((a) => a.family),
      titulo: (d.title || "").trim(),
      subtitulo: (d.subtitle || "").trim(),
      local: String(d.location || "").split(",")[0].trim(),
      editora: (d.publisher || "").trim(),
      ano: d.year || null,
      isbn: d.isbn || "",
      paginasTotal: d.page_count || null,
    };
  }

  // Extrai DOI e ISBN do texto das primeiras páginas de um PDF.
  function acharDOI(texto) {
    const m = String(texto || "").match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i);
    return m ? m[1].replace(/[.,;:)\]]+$/, "") : "";
  }
  function acharISBN(texto) {
    const m = String(texto || "").match(/ISBN(?:-1[03])?[:\s]*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])/);
    return m ? m[1].replace(/[\s-]/g, "") : "";
  }
  const limparDOI = (s) => String(s || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  const limparISBN = (s) => String(s || "").replace(/[^\dXx]/g, "");

  const api = {
    pad, ymd, parse, hoje, somarDias, diasEntre, diaSemana, inicioSemana,
    proximaAula, aulasEntre, ritmoLeitura, ritmoEscrita,
    separarNome, autoresABNT, autoresLista, montarReferencia, refTexto, refHTML, escHTML,
    obraDaCrossref, obraDoISBN, acharDOI, acharISBN, limparDOI, limparISBN, MESES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Nucleo = api;
})(typeof window !== "undefined" ? window : globalThis);
