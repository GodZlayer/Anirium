const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 4002;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/health" || parsed.pathname === "/manifest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      id: "community.local.library",
      name: "Local Video Library & WebDAV Resolver (Standalone Container)",
      status: "running",
      version: "1.0.0",
      capabilities: ["playback.source.provide"]
    }));
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint não encontrado no addon container" }));
});

server.listen(PORT, () => {
  console.log(`[Anirium Community Addon Container] Local Library rodando na porta ${PORT}`);
});
