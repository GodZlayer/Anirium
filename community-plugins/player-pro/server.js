const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 4004;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/health" || parsed.pathname === "/status" || parsed.pathname === "/manifest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        id: "player-pro",
        service: "Anirium Player Pro Standalone Container Node",
        name: "Anirium Player Pro",
        version: "2.1.0",
        status: "online",
        port: PORT,
        capabilities: [
          "ui.player.render",
          "playback.engine.orchestrate",
          "subtitles.manage",
          "audio.manage",
          "media.stream.http"
        ]
      })
    );
  }

  if (parsed.pathname === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        peers: 0,
        uploadRate: "0.0 KB/s",
        downloadRate: "0.0 KB/s",
        totalDownloaded: "0.0 MB",
        totalUploaded: "0.0 MB",
        fairnessLimit: "Ativo (Fair Share P2P — Upload limitado a ~100 KB/s)",
        activeMix: "Standby no container Player Pro",
        mixDuration: "—",
        mixQualities: ["Auto (1080p)"],
        mixAudios: ["Original"],
        mixSubtitles: ["Desativado"],
        activeLinks: [],
        activeSessions: [],
        port: PORT,
        status: "online"
      })
    );
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint não encontrado no addon container" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Anirium Addon Container] Player Pro v2.1.0 rodando na porta ${PORT}`);
});
