const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 4005;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/health" || parsed.pathname === "/status" || parsed.pathname === "/manifest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        id: "mal-sync",
        name: "MAL Sync (Standalone Addon Container)",
        version: "1.0.0",
        status: "running",
        port: PORT,
        capabilities: ["tracking.sync", "network.external.fetch"]
      })
    );
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint não encontrado no addon container mal-sync" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Anirium Addon Container] MAL Sync rodando na porta ${PORT}`);
});
