import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "downloads", "anirium-service.exe");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Executável do serviço não encontrado" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": 'attachment; filename="anirium-service.exe"',
        "Content-Length": fileBuffer.length.toString(),
        // This fingerprint identifies the delivered bytes, not publisher trust
        // or Microsoft certification. Never cache this mutable legacy URL.
        "X-Anirium-Artifact-SHA256": createHash("sha256").update(fileBuffer).digest("hex"),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Erro ao baixar serviço" }, { status: 500 });
  }
}
