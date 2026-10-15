// Legacy endpoint tombstone: the Player receives subtitles directly from its
// local Service. Core never transports subtitle data or playback credentials.
function removedSubtitleGateway() {
  return Response.json({
    error: "subtitle_gateway_removed",
    message: "As legendas são entregues diretamente pelo Service local ao Player.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}

export const GET = removedSubtitleGateway;
export const POST = removedSubtitleGateway;
export const PUT = removedSubtitleGateway;
export const DELETE = removedSubtitleGateway;
export const PATCH = removedSubtitleGateway;
export const HEAD = removedSubtitleGateway;
export const OPTIONS = removedSubtitleGateway;
