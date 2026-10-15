import InformationPage from "@/components/InformationPage";

export const metadata = { title: "Suporte | Anirium", description: "Contato e ajuda para o site e o Anirium+ Service." };

export default function SupportPage() {
  return (
    <InformationPage title="Suporte do Anirium">
      <section>
        <h2>Fale com o suporte</h2>
        <p>Para dúvidas, falhas no site, no Player Pro ou no Anirium+ Service, escreva para <a href="mailto:admin@anirium.com.br">admin@anirium.com.br</a>. Esse também é o canal para solicitações sobre seus dados pessoais.</p>
        <p>Informe a versão do Windows, a versão do Service, o horário aproximado e os passos que reproduzem a falha. Não envie senhas, tokens, cookies de sessão, documentos pessoais ou arquivos de mídia. Se enviar uma captura de tela, remova informações pessoais que não sejam necessárias.</p>
      </section>
      <section>
        <h2>O Service está offline</h2>
        <p>Abra o Anirium+ Service no menu Iniciar e confira se ele continua em execução. O Player se comunica com o aplicativo local na porta 4004. Não desative o antivírus ou o firewall para tentar resolver o problema; envie o erro ao suporte.</p>
        <p>Se o aplicativo não estiver disponível, o Player permite usar um arquivo local ou link HTTP direto. A integração com o Service requer login e Anirium+ ativo. Durante o beta aberto de testes, essa ativação é gratuita, sem pagamento; conta e sessão continuam sendo validadas. Se a ativação não concluir, entre em contato com o suporte.</p>
      </section>
      <section>
        <h2>Sessão e opções de reprodução</h2>
        <p>Se outra sessão estiver usando a conta, encerre-a antes de tentar novamente. Tokens expirados exigem renovação da sessão. Áudios, legendas e qualidades só aparecem quando existem e estão disponíveis no manifesto produzido pelo Service.</p>
        <p>Addons e servidores externos podem estar indisponíveis. O suporte a esses componentes não representa uma licença para acessar ou compartilhar obras. Use apenas fontes e conteúdo autorizados.</p>
      </section>
      <p>Publicador: GodZlayer. <a href="/privacidade">Leia a política de privacidade</a> ou <a href="/service">consulte a página do Service</a>.</p>
    </InformationPage>
  );
}
