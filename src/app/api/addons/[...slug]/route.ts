// A UI manifest does not grant server-side network execution. Provider search
// and media transport belong to the local Service or an independent consumer,
// never to a generic Core proxy. Keep an explicit tombstone for old clients.
function removedAddonGateway() {
  return Response.json({
    error: 'addon_gateway_removed',
    message: 'O Core não encaminha chamadas para servidores de addons.',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = removedAddonGateway;
export const POST = removedAddonGateway;
export const PUT = removedAddonGateway;
export const DELETE = removedAddonGateway;
export const PATCH = removedAddonGateway;
export const HEAD = removedAddonGateway;
export const OPTIONS = removedAddonGateway;
