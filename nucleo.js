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

  // ---------- Grifos do PDF ----------
  // Recebe os itens de texto de uma página (formato do pdf.js: str, transform,
  // width, height) e os retângulos de um grifo, e devolve o texto grifado.
  // Funciona por geometria: pega, de cada linha coberta pelo grifo, só os
  // caracteres que caem dentro da área marcada.
  function retangulosDoGrifo(quadPoints, rect) {
    const out = [];
    const caixa = (xs, ys) => ({ x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) });
    if (quadPoints && quadPoints.length) {
      if (typeof quadPoints[0] === "number" || (quadPoints.length && ArrayBuffer.isView(quadPoints))) {
        // formato achatado: 8 números por quadrilátero
        for (let i = 0; i + 7 < quadPoints.length; i += 8) {
          const q = Array.from(quadPoints).slice(i, i + 8);
          out.push(caixa([q[0], q[2], q[4], q[6]], [q[1], q[3], q[5], q[7]]));
        }
      } else {
        // formato do pdf.js 3: lista de quadriláteros com 4 pontos {x, y}
        quadPoints.forEach((q) => { if (q && q.length) out.push(caixa(q.map((p) => p.x), q.map((p) => p.y))); });
      }
    } else if (rect && rect.length === 4) {
      out.push(caixa([rect[0], rect[2]], [rect[1], rect[3]]));
    }
    // de cima para baixo, como se lê
    return out.sort((a, b) => b.y2 - a.y2 || a.x1 - b.x1);
  }

  function textoDoGrifo(itens, retangulos) {
    const linhas = [];
    retangulos.forEach((r) => {
      const pedacos = [];
      itens.forEach((it) => {
        const s = it.str || "";
        if (!s.trim()) return;
        const t = it.transform || [1, 0, 0, 1, 0, 0];
        const x = t[4], y = t[5];
        const h = Math.abs(it.height || t[3] || t[0] || 10);
        const w = it.width || 0;
        const meioY = y + h * 0.35;
        const folga = h * 0.35;
        if (meioY < r.y1 - folga || meioY > r.y2 + folga) return;
        if (x + w < r.x1 || x > r.x2) return;
        const n = s.length, cw = n ? w / n : 0;
        let ini = 0, fim = n;
        if (cw > 0) {
          ini = Math.max(0, Math.floor((r.x1 - x) / cw + 0.35));
          fim = Math.min(n, Math.ceil((r.x2 - x) / cw - 0.35));
          // A largura das letras varia; por isso as pontas são ajustadas à
          // palavra inteira mais próxima (quem grifa marca palavras, não letras).
          const L = /[0-9A-Za-zÀ-ÿ]/;
          const limites = (i) => { let a = i, b = i; while (a > 0 && L.test(s[a - 1])) a--; while (b < n && L.test(s[b])) b++; return [a, b]; };
          if (ini > 0 && ini < n && L.test(s[ini - 1]) && L.test(s[ini])) { const [a, b] = limites(ini); ini = ini - a <= b - ini ? a : b; }
          if (fim > 0 && fim < n && L.test(s[fim - 1]) && L.test(s[fim])) { const [a, b] = limites(fim); fim = fim - a < b - fim ? a : b; }
        }
        if (fim <= ini) return;
        pedacos.push({ x: x + ini * cw, fimX: x + fim * cw, txt: s.slice(ini, fim), h });
      });
      pedacos.sort((a, b) => a.x - b.x);
      let linha = "";
      pedacos.forEach((p, i) => {
        if (i > 0) {
          const ant = pedacos[i - 1];
          const junto = p.x - ant.fimX < p.h * 0.15;
          if (!junto && !/\s$/.test(linha) && !/^\s/.test(p.txt)) linha += " ";
        }
        linha += p.txt;
      });
      if (linha.trim()) linhas.push(linha.trim());
    });
    // junta as linhas, desfazendo a hifenização de fim de linha
    let txt = "";
    linhas.forEach((l) => {
      if (!txt) { txt = l; return; }
      if (/[A-Za-zÀ-ÿ]-$/.test(txt) && /^[a-zà-ÿ]/.test(l)) txt = txt.slice(0, -1) + l;
      else txt += " " + l;
    });
    return txt.replace(/\s+/g, " ").trim().replace(/[,;:]$/, "");
  }

  // ---------- Chamada de citação (ABNT NBR 10520:2023) ----------
  // Sobrenomes em maiúsculas e minúsculas; até três autores separados por
  // ponto e vírgula; mais de três, o primeiro seguido de et al.
  const MINUSC = ["de", "da", "do", "das", "dos", "e", "von", "van", "der", "del", "la", "le", "di"];
  const capitalizar = (s) => String(s).toLowerCase().split(/(\s+|-)/).map((p, i) => (i > 0 && MINUSC.includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
  function sobrenomes(autores) {
    return String(autores || "").split(";").map((a) => a.trim()).filter(Boolean).map((a) => capitalizar(a.split(",")[0].trim()));
  }
  function chamadaCitacao(o) {
    const sob = sobrenomes(o.autores);
    let quem = sob.length > 3 ? sob[0] + " et al." : sob.join("; ");
    if (!quem) quem = String(o.titulo || "").trim().split(/\s+/)[0].toUpperCase() + " [...]";
    const partes = [quem, o.ano ? String(o.ano) : "[ano?]"];
    if (o.pagina) partes.push("p. " + o.pagina);
    if (o.traducao) partes.push("tradução nossa");
    if (o.grifo) partes.push("grifo nosso");
    return "(" + partes.join(", ") + ")";
  }
  // Citação com até três linhas vai entre aspas; acima disso, em bloco recuado.
  // Como a linha depende da página, usa-se uma estimativa de 3 linhas de 85 caracteres.
  const citacaoLonga = (texto) => String(texto || "").length > 255;

  const api = {
    pad, ymd, parse, hoje, somarDias, diasEntre, diaSemana, inicioSemana,
    proximaAula, aulasEntre, ritmoLeitura, ritmoEscrita,
    separarNome, autoresABNT, autoresLista, montarReferencia, refTexto, refHTML, escHTML,
    obraDaCrossref, obraDoISBN, acharDOI, acharISBN, limparDOI, limparISBN, MESES,
    retangulosDoGrifo, textoDoGrifo, chamadaCitacao, citacaoLonga, sobrenomes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Nucleo = api;
})(typeof window !== "undefined" ? window : globalThis);
