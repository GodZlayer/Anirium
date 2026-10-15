export function playbackFailureStatus(data: { reason?: unknown; status?: unknown }, httpStatus: number): string {
  const allowed = ['plus_required', 'session_in_use', 'token_expired', 'session_revoked', 'device_mismatch', 'account_mismatch', 'session_mismatch', 'session_invalid', 'core_unavailable', 'media_tools_missing'];
  if (typeof data.reason === 'string' && allowed.includes(data.reason)) return data.reason;
  if (typeof data.status === 'string' && allowed.includes(data.status)) return data.status;
  return httpStatus === 401 || httpStatus === 403 ? 'unauthorized' : 'service-error';
}

export function playbackStatusMessage(status: string) {
  const messages: Record<string, { title: string; description: string }> = {
    unauthorized: { title: "Anirium+ não ativo ou sessão inválida", description: "Entre na sua conta e confirme que o plano Anirium+ está ativo." },
    plus_required: { title: "Anirium+ não ativo", description: "Ative o Anirium+ no perfil para utilizar o Service." },
    token_expired: { title: "Sessão expirada", description: "Abra novamente o Player para renovar sua autorização." },
    session_revoked: { title: "Sessão encerrada", description: "Entre novamente na conta para continuar." },
    core_unavailable: { title: "Autorização indisponível", description: "Não foi possível validar a conta no Anirium. Tente novamente." },
    device_mismatch: { title: "Dispositivo não autorizado", description: "Abra novamente o Player neste dispositivo." },
    account_mismatch: { title: "Conta da sessão não corresponde", description: "Abra novamente o Player com a conta atual." },
    session_mismatch: { title: "Sessão do Player inválida", description: "Abra novamente o Player para iniciar uma sessão válida." },
    session_invalid: { title: "Sessão do Player inválida", description: "Abra novamente o Player para iniciar uma sessão válida." },
    session_in_use: { title: "Outra sessão já está usando esta conta", description: "Encerre a sessão anterior antes de iniciar esta reprodução." },
    "session-expired": { title: "Sessão expirada", description: "Autentique-se novamente para continuar a reprodução pelo Service." },
    media_tools_missing: { title: "Dependências de mídia ausentes", description: "Instale FFmpeg e FFprobe ou utilize o instalador completo do Anirium Service." },
    preparing: { title: "Preparando vídeo, áudio e legendas", description: "O Service está processando as fontes disponíveis para este episódio." },
    stalled: { title: "Processamento de mídia interrompido", description: "Não foi possível concluir uma variante. Verifique o Service e tente novamente." },
    "service-offline": { title: "Service offline", description: "Inicie o Anirium Service ou utilize um arquivo local/link HTTP direto." },
    "service-error": { title: "Falha ao preparar a reprodução", description: "Verifique o Anirium Service e tente novamente." },
  };
  return messages[status] || { title: "Nenhuma mídia pronta para reprodução", description: "Você pode utilizar um arquivo local, link HTTP direto ou acessar o distribuidor oficial." };
}
