"""Read-only receipt audit; never reads credentials or changes runtime state."""
import json
import os
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
database = root / '.agent-runtime' / 'memory.sqlite'
counts = Counter()
router = Counter()
receipts = []
with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
    for (raw,) in connection.execute('SELECT receipt FROM jobs'):
        receipt = json.loads(raw)
        receipts.append(receipt)
        endpoint = receipt.get('endpoint') or {}
        if receipt.get('cache_hit'):
            continue
        counts[(endpoint.get('account', 'unknown'), endpoint.get('model', 'unknown'), receipt.get('role', 'unknown'), receipt.get('status', 'unknown'))] += 1
        router[receipt.get('judgment_source', 'unknown')] += 1
    states = Counter(state for (state,) in connection.execute('SELECT state FROM agents'))
    active = [dict(zip(['id','parent','role','mission','state','started','ended'], row))
              for row in connection.execute('SELECT id,parent,role,mission,state,started,ended FROM agents WHERE state=?', ('active',))]

# Verification is stored separately by the runtime; receipt.verified is only
# its original exact-match result, not the central review written later.
feedback = {}
feedback_source = Path(os.environ['LOCALAPPDATA']) / 'UniversalAgentRuntime/state/runtime.sqlite'
policy_source = feedback_source.parent.parent / 'policy.json'
allocation = json.loads(policy_source.read_text(encoding='utf-8-sig'))['delegation_allocation']
allocation_since = datetime.fromisoformat(allocation['effective_at']).timestamp()
allocation_counts = Counter(opencode=0, google=0, codex=0)
with sqlite3.connect(feedback_source.as_uri() + '?mode=ro', uri=True) as connection:
    for (raw,) in connection.execute('SELECT receipt FROM receipts'):
        receipt = json.loads(raw)
        if receipt.get('cache_hit') or receipt.get('request_started_epoch', 0) < allocation_since:
            continue
        endpoint = receipt.get('endpoint') or {}
        app, model = endpoint.get('app'), endpoint.get('model', '')
        provider = 'google' if app == 'antigravity' and model.startswith(allocation['google_models_prefix']) else app
        if provider in allocation_counts:
            allocation_counts[provider] += 1
    for job, accepted, evidence, reviewed in connection.execute('SELECT job,accepted,evidence,created FROM feedback'):
        feedback[job] = {'accepted': bool(accepted), 'evidence': evidence, 'reviewed': reviewed}

lines = ['# Auditoria de orquestração', '', 'Gerado em ' + datetime.now(timezone.utc).isoformat(), '',
    'Fonte: recibos locais jobs e estados agents do SQLite deste projeto. Execuções em cache excluídas. '
    'Não é prova independente do provedor nem consumo de toda a cota: cotas são compartilhadas por conta.', '',
    '| Conta | Modelo declarado no recibo | Papel | Estado | Execuções |', '|---|---|---|---|---|']
for (account, model, role, status), count in sorted(counts.items()):
    lines.append(f'| {account} | {model} | {role} | {status} | {count} |')
allocation_total = sum(allocation_counts.values())
lines += ['', '## Distribuição das delegações', '',
          'Escopo global do runtime desde ' + allocation['effective_at'] + '. '
          'Conta despachos com recibo persistido; exclui cache, bloqueios antes do envio e esta conversa. '
          'Não mede tokens nem percentual de cota; solicitações em andamento podem ainda não ter recibo.', '',
          '| Executor | Meta | Despachos | Realizado |', '|---|---|---|---|']
for provider, target in allocation['targets'].items():
    actual = f'{allocation_counts[provider] / allocation_total:.1%}' if allocation_total else 'sem despachos'
    lines.append(f'| {provider} | {target:.0%} | {allocation_counts[provider]} | {actual} |')
lines += ['', 'Origem do julgamento: ' + json.dumps(dict(router), ensure_ascii=False), '',
          'Estados históricos dos delegados: ' + json.dumps(dict(states), ensure_ascii=False), '',
          'Saldo/reset observado: ../Quotas/Current.md; recibos completos: .agent-runtime/memory.sqlite. '
          'Blocked não equivale a execução. Completed não equivale a proposta verificada pelo orquestrador.']
target = root / '.agent-runtime' / 'vault' / 'Missions' / 'Orchestration-Audit.md'
target.write_text('\n'.join(lines) + '\n', encoding='utf-8')

def cell(value):
    return str(value if value is not None else 'desconhecido').replace('|', '\\|').replace('\n', ' ')

def literal_response(value):
    # Delegate output is data. Do not render its HTML, images, wikilinks or
    # instructions as active Markdown in the user's vault.
    text = str(value)
    fence = '`' * max(3, 1 + max((len(run) for run in re.findall(r'`+', text)), default=0))
    return '\n'.join([fence + 'text', text, fence])

workers = sorted((r for r in receipts if r.get('role') == 'worker' and not r.get('cache_hit')),
                 key=lambda r: r.get('started_at', ''), reverse=True)
board = ['# Animeflix — orquestração', '',
    'Snapshot em ' + datetime.now(timezone.utc).isoformat() + '. Não é atualização contínua.', '',
    f'**Delegados ativos no registro na coleta: {len(active)}.** Trabalhadores são temporários; encerram após o contrato.', '',
    '[[Missions/Orchestration-Audit|Contas e modelos]] · [[Quotas/Current|Cotas observadas]]', '',
    'SQLite do projeto registra execuções. Avaliações vêm do feedback do runtime. '
    'Recibos com message_review registram o gate tipado do Laya. Recibos antigos não tinham esse gate. '
    'Aprovação do Laya não prova execução de testes; revisão central mantém seu próprio escopo.', '',
    '| Trabalho | Conta / modelo | Estado | Laya | Revisão central |', '|---|---|---|---|---|']
details_dir = root / '.agent-runtime/vault/Missions/Workers'
details_dir.mkdir(exist_ok=True)
for number, r in enumerate(workers):
    job = r['job']
    if not all(c.isalnum() or c in '-_' for c in job):
        raise ValueError('Unsafe receipt identifier')
    endpoint = r.get('endpoint') or {}
    review = feedback.get(job)
    verdict = ('aceito' if review['accepted'] else 'rejeitado') if review else 'não avaliado'
    usage = r.get('usage')
    note = [f'# {job}', '', f'Tarefa: {r.get("task_id", "desconhecida")}',
        f'Missão: {r.get("mission", "desconhecida")}', f'Conta: {endpoint.get("account", "desconhecida")}',
        f'Modelo: {endpoint.get("model", "desconhecido")}', f'Início: {r.get("started_at", "desconhecido")}',
        f'Fim: {r.get("finished_at", "desconhecido")}', f'Estado do recibo: {r.get("status", "desconhecido")}',
        f'Julgamento: {r.get("judgment_source", "desconhecido")}', f'Revisão central: {verdict}', '',
        '## Evidência da revisão', '', review['evidence'] if review else 'Revisão não registrada.', '',
        '## Uso informado pelo executor', '', '```json', json.dumps(usage, ensure_ascii=False, indent=2), '```',
        'Null significa indisponível; não é zero. Contagens não convertem percentuais de cota em tokens.', '',
        '## Contrato tipado e revisão Laya', '',
        literal_response(json.dumps({'task_message': r.get('task_message'), 'result_message': r.get('result_message'),
                                     'message_review': r.get('message_review')}, ensure_ascii=False, indent=2)), '',
        '## Resposta recebida', '', '> Proposta do delegado; leia a revisão antes de usá-la como conclusão.', '',
        literal_response(r.get('response', 'Resposta não disponível no recibo.')), '']
    (details_dir / (job + '.md')).write_text('\n'.join(note), encoding='utf-8')
    if number < 10:
        board.append(f'| [[Missions/Workers/{job}\\|{cell(r.get("task_id"))}]] | '
                     f'{cell(endpoint.get("account"))} / {cell(endpoint.get("model"))} | {cell(r.get("status"))} | '
                     f'{cell((r.get("message_review") or {}).get("verdict", "sem gate registrado"))} | {verdict} |')
board += ['', 'Histórico completo e respostas: pasta Missions/Workers. '
          'Active é um registro operacional, não prova de processo vivo: confirme o handle no orquestrador.', '',
          'Laya seleciona delegados. Esta conversa verifica/aplica. O modelo principal permanece escolhido pelo usuário.']
(root / '.agent-runtime/vault/Index.md').write_text('\n'.join(board) + '\n', encoding='utf-8')

snapshot = {'project': 'Animeflix', 'generated_at': datetime.now(timezone.utc).isoformat(),
    'active_recorded': len(active), 'worker_jobs': len(workers),
    'recent': [{'job': r['job'], 'task': r.get('task_id'), 'endpoint': r.get('endpoint'),
                'status': r.get('status'), 'review': feedback.get(r['job']), 'message_review': r.get('message_review'),
                'started_at': r.get('started_at'), 'finished_at': r.get('finished_at')}
               for r in workers[:12]]}
(root / '.agent-runtime/orchestration-snapshot.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
print(str(target))
