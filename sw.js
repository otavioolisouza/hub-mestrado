// ============================================================================
// Service worker: é o que permite instalar o hub como aplicativo e abrir a
// interface mesmo com internet instável. Os DADOS nunca ficam em cache aqui:
// tudo que vem do Supabase passa direto pela rede.
//
// Ao publicar uma versão nova dos arquivos, aumente o número de VERSAO para
// que todos recebam a atualização.
// ============================================================================
const VERSAO = "hub-mestrado-v1";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./nucleo.js",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Bibliotecas com versão fixada no jsDelivr: podem vir do cache.
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copia = res.clone();
      caches.open(VERSAO).then((c) => c.put(req, copia));
      return res;
    })));
    return;
  }

  // Qualquer outro domínio (Supabase, Crossref, BrasilAPI, fontes): só rede.
  if (url.origin !== self.location.origin) return;

  // Arquivos do próprio hub: rede primeiro, cache se estiver sem internet.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(VERSAO).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
