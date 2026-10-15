import InformationPage from "@/components/InformationPage";

export const metadata = { title: "Anirium+ Service | Anirium", description: "Aplicativo Windows de processamento local para o Player Pro." };

export default function ServicePage() {
  return (
    <InformationPage title="Anirium+ Service">
      <p>Aplicativo Windows nativo que processa vídeo, faixas de áudio e legendas no computador e entrega a mídia ao Player Pro por uma conexão local.</p>
      <section>
        <h2>Microsoft Store</h2>
        <p>O item Anirium+ Service está cadastrado na Store sob GodZlayer. A versão MSIX está em preparação para certificação; o cadastro não significa que o aplicativo já esteja aprovado ou disponível para instalação.</p>
        <p><a href="ms-windows-store://pdp/?productid=9MV35DDQ6SBD">Abrir o item na Microsoft Store</a> ou <a href="https://apps.microsoft.com/detail/9MV35DDQ6SBD">abrir a página web do item</a>. Se o item ainda não estiver público, a Store pode indicar indisponibilidade.</p>
      </section>
      <section>
        <h2>Antes de usar</h2>
        <p>Durante o beta aberto de testes, a ativação do Anirium+ é gratuita e não exige pagamento. A integração continua exigindo conta autenticada e Anirium+ ativo; instalar o Service não substitui a ativação da conta nem concede acesso a mídia. O Service usa anirium.com.br como servidor padrão, não é um player independente e não inclui um catálogo de episódios para download.</p>
        <p>Fontes de addons podem utilizar conexões externas e P2P, com envio e recebimento de dados e exposição do IP aos participantes. Use somente conteúdo autorizado. Consulte a <a href="/privacidade">política de privacidade</a>.</p>
      </section>
      <p>Precisa de ajuda? Acesse <a href="/suporte">o suporte</a>.</p>
    </InformationPage>
  );
}
