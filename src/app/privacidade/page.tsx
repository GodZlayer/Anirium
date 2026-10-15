import InformationPage from "@/components/InformationPage";

export const metadata = {
  title: "Política de privacidade | Anirium",
  description: "Dados tratados pelo site Anirium, Player Pro e aplicativo local Anirium+ Service.",
};

export default function PrivacyPage() {
  return (
    <InformationPage title="Política de privacidade">
      <p>Atualizada em 3 de outubro de 2026. Esta política descreve o site anirium.com.br, o Player Pro e o aplicativo local Anirium+ Service, publicados sob o nome GodZlayer. Contato para privacidade: <a href="mailto:admin@anirium.com.br">admin@anirium.com.br</a>.</p>
      <section>
        <h2>Dados da conta e uso do site</h2>
        <p>Quando você entra com o Google, o Anirium recebe identificador da conta Google, e-mail, nome e imagem de perfil disponibilizados no login. O servidor valida a credencial recebida. O Anirium não solicita sua senha do Google.</p>
        <p>O site pode guardar perfil, preferências, favoritos, progresso de episódios, avaliações, opiniões e addons habilitados que você utiliza, além do plano e sua validade. Esses dados permitem autenticar a conta, manter sua biblioteca e preferências e verificar o acesso às funcionalidades habilitadas. Durante o beta aberto de testes, a ativação do Anirium+ é gratuita e não exige pagamento.</p>
      </section>
      <section>
        <h2>Cookies, armazenamento e sessões</h2>
        <p>A sessão usa o cookie __Host-anirium_web_session em produção, protegido contra leitura por scripts e enviado por HTTPS, com prazo de até 30 dias desde o login. O banco guarda um hash dessa credencial. Um novo login troca a sessão anterior; sair encerra o acesso. A atualização remove a sessão antiga e pode exigir novo login. Identificadores locais do Player distinguem o dispositivo e permanecem até serem removidos pelo navegador ou pelo usuário; eles não substituem a autenticação.</p>
        <p>A integração com o Service utiliza identificadores de conta, dispositivo e sessão, informação do plano e tokens de autorização com expiração. Eles servem para validar o acesso e controlar sessões simultâneas. O token do Service tem validade de cinco minutos e pode ser renovado durante o uso; isso não significa que os dados da conta sejam apagados após cinco minutos.</p>
      </section>
      <section>
        <h2>Processamento local e conexões de mídia</h2>
        <p>O Player Pro solicita mídia ao Service instalado no seu computador. O Service processa vídeo, áudio e legendas localmente e mantém arquivos temporários, cache e registros técnicos no computador. A API do Player usa a interface local 127.0.0.1; as conexões externas usadas na obtenção de mídia são distintas dessa API.</p>
        <p>Quando você usa fontes de addons externos, o Service pode enviar a esses servidores dados da busca, como título e episódio. Ao usar BitTorrent/P2P, seu endereço IP e identificadores do conteúdo podem ser visíveis a peers, trackers e serviços de descoberta; o computador pode enviar e receber partes dos arquivos. P2P não oferece anonimato. Não use esse modo se não estiver autorizado a acessar e compartilhar o conteúdo.</p>
        <p>O Core do Anirium fornece catálogo, conta, autorização e links de fontes oficiais; ele não recebe nem retransmite os segmentos de vídeo, áudio e legenda produzidos pelo Service. O histórico e o progresso da reprodução são dados separados da mídia e podem ser enviados ao site.</p>
      </section>
      <section>
        <h2>Serviços externos</h2>
        <p>O site utiliza a infraestrutura Cloudflare e recursos do Google para login e fontes tipográficas. Imagens de catálogo e perfil podem ser carregadas de outros domínios. Ao carregar esses recursos, o respectivo serviço recebe informações técnicas da conexão, como endereço IP e dados do navegador, conforme suas próprias políticas.</p>
        <p>Plugins habilitados pelo usuário, sincronização com serviços externos e servidores de fontes possuem comportamentos e políticas próprios. Verifique o manifesto e a política do addon antes de habilitá-lo. A Microsoft trata os dados de aquisição e distribuição do aplicativo na Store conforme a política da Microsoft.</p>
      </section>
      <section>
        <h2>Conservação e segurança</h2>
        <p>Dados de perfil, biblioteca e preferências são persistidos para manter a conta e os recursos utilizados. Sair da conta, desinstalar o Service ou expirar uma assinatura não exclui automaticamente os dados no servidor. Registros técnicos, dados necessários à segurança, obrigações aplicáveis e atendimento de solicitações podem precisar ser conservados. Esta versão não oferece exclusão automática de conta pela interface.</p>
        <p>Você pode solicitar informações sobre conservação e exclusão pelo contato abaixo. A operação utiliza validação de sessão, tokens expirantes e controle de acesso; nenhuma medida elimina todos os riscos. Não envie senhas, tokens ou documentos em mensagens de suporte sem uma necessidade previamente verificada.</p>
      </section>
      <section>
        <h2>Solicitações de privacidade</h2>
        <p>Para solicitar acesso, correção, informações sobre compartilhamento, exclusão ou outros direitos aplicáveis aos seus dados, escreva para <a href="mailto:admin@anirium.com.br">admin@anirium.com.br</a>. Informe o assunto e a conta envolvida, sem enviar a senha. Podemos precisar confirmar sua identidade antes de divulgar ou alterar dados da conta. Limitações e conservação obrigatória serão explicadas no atendimento.</p>
        <p>Esta página pode ser atualizada para refletir alterações no produto e no tratamento de dados. A data de atualização aparece no início.</p>
      </section>
    </InformationPage>
  );
}
