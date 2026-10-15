"""Offline contract tests for resumable coverage probing; never contacts MAL."""
import contextlib, datetime, email.message, importlib.util, io, json, pathlib, sqlite3, sys, tempfile
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('collector',pathlib.Path(__file__).with_name('collect-mal-api.py'))
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
progress_before_request=[]

def nested_fallback(url):
 from urllib.parse import urlparse,parse_qs
 selector=parse_qs(urlparse(url).query)['fields'][0]
 if '{' in selector:return {'_http_error':400}
 return {'id':9,'alternative_titles':{'en':'verified actual title','ja':'','synonyms':[]}}

merged,sources,gaps=collector.recover_detail_fields(nested_fallback,'https://api.myanimelist.net/v2/manga/9','alternative_titles{en}',9)
assert merged['alternative_titles']['en']=='verified actual title' and not gaps and len(sources)==2
merged,sources,gaps=collector.recover_detail_fields(lambda url: {'_http_error':400} if '%7B' in url else {'id':9,'title':'base'},'https://api.myanimelist.net/v2/manga/9','alternative_titles{en}',9)
assert 'alternative_titles' not in merged and len(gaps)==1

class Response:
 def __init__(self,status,body):
  self.status=status;self.headers=email.message.Message();self.body=json.dumps(body).encode()
 def read(self):return self.body

class Connection:
 def __init__(self,*args,**kwargs):pass
 def close(self):pass
 def request(self,method,path,headers):self.path=path
 def getresponse(self):
  from urllib.parse import urlparse,parse_qs
  path=urlparse(self.path)
  if path.path.endswith('/ranking'):return Response(200,{'data':[]})
  eid=int(path.path.rsplit('/',1)[1]);fields=parse_qs(path.query).get('fields',[''])[0]
  if eid==110:progress_before_request.append(json.loads((root/'progress.json').read_text())['requests_this_run'])
  if eid>=100:return Response(404,{'error':'not_found'})
  if eid==2:return Response(404,{'error':'not_found'})
  if eid==3 and 'alternative_titles' in fields:return Response(400,{'error':'invalid_request'})
  return Response(200,{'id':eid,'title':'offline test','num_episodes':12})

with tempfile.TemporaryDirectory() as folder:
 root=pathlib.Path(folder);credentials=root/'dummy.txt';credentials.write_text('Client ID: '+'a'*32)
 db=sqlite3.connect(root/'mal.sqlite3')
 db.executescript('CREATE TABLE streams(kind TEXT,ranking TEXT,next_url TEXT,done INTEGER,PRIMARY KEY(kind,ranking)); CREATE TABLE coverage_candidates(kind TEXT,id INTEGER,checked INTEGER DEFAULT 0,PRIMARY KEY(kind,id));')
 rows=[(kind,rank) for kind,ranks in collector.RANKS.items() for rank in ranks+['verification-bypopularity']]
 rows.extend(('anime',f'season-{year}-{season}') for year in range(1900,datetime.datetime.now().year+3) for season in ('winter','spring','summer','fall'))
 db.executemany('INSERT INTO streams VALUES(?,?,NULL,1)',rows)
 db.executemany('INSERT INTO coverage_candidates(kind,id) VALUES(?,?)',[('anime',i) for i in (1,2,3)])
 db.commit();db.close()
 argv=['collector','--credentials',str(credentials),'--output',str(root),'--delay','0','--min-interval','0']
 with patch.object(sys,'argv',argv),patch.object(collector.http.client,'HTTPSConnection',Connection),contextlib.redirect_stdout(io.StringIO()):collector.main()
 db=sqlite3.connect(root/'mal.sqlite3')
 assert db.execute('SELECT id,checked FROM coverage_candidates ORDER BY id').fetchall()==[(1,1),(2,-1),(3,1)]
 assert db.execute('SELECT id,detail_done FROM entities ORDER BY id').fetchall()==[(1,1),(3,2)]
 assert db.execute('SELECT field FROM field_gaps').fetchall()==[('alternative_titles',)]
 assert json.loads(db.execute('SELECT body FROM recovered_details WHERE id=3').fetchone()[0])['num_episodes']==12
 assert db.execute('SELECT count(*) FROM responses WHERE status=404').fetchone()[0]==1
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 db.execute("INSERT INTO coverage_candidates(kind,id) VALUES('manga',99)")
 db.execute("UPDATE streams SET done=0,next_url='https://api.myanimelist.net/v2/manga/ranking?ranking_type=bypopularity' WHERE kind='manga' AND ranking='bypopularity'")
 db.execute("INSERT INTO field_gaps VALUES('anime',1,'num_episodes',400,'historical_failed_selector')")
 db.execute("UPDATE entities SET detail_done=0 WHERE kind='anime' AND id=1")
 db.commit();db.close()
 with patch.object(sys,'argv',argv+['--kind','anime','--refresh-discovery']),patch.object(collector.http.client,'HTTPSConnection',Connection),contextlib.redirect_stdout(io.StringIO()):collector.main()
 db=sqlite3.connect(root/'mal.sqlite3')
 assert db.execute("SELECT checked FROM coverage_candidates WHERE kind='manga' AND id=99").fetchone()==(0,)
 assert db.execute("SELECT done FROM streams WHERE kind='manga' AND ranking='bypopularity'").fetchone()==(0,)
 assert db.execute("SELECT count(*) FROM entities WHERE kind='manga'").fetchone()==(0,)
 assert db.execute("SELECT count(*) FROM streams WHERE kind='anime' AND ranking IN ('bypopularity','all','airing','upcoming','tv','ova','movie','special','favorite') AND done=1").fetchone()==(9,)
 assert db.execute("SELECT count(*) FROM responses WHERE url LIKE '%/manga/%'").fetchone()==(0,)
 assert db.execute("SELECT count(*) FROM field_gaps WHERE kind='anime' AND id=1").fetchone()==(0,)
 assert db.execute("SELECT detail_done FROM entities WHERE kind='anime' AND id=1").fetchone()==(1,)
 db.execute("INSERT INTO entities(kind,id,detail_done) VALUES('anime',5,1)")
 db.commit();db.close()
 with patch.object(sys,'argv',argv+['--kind','anime']),patch.object(collector.http.client,'HTTPSConnection',Connection),contextlib.redirect_stdout(io.StringIO()):collector.main()
 db=sqlite3.connect(root/'mal.sqlite3')
 assert db.execute("SELECT checked FROM coverage_candidates WHERE kind='anime' AND id=4").fetchone()==(1,)
 assert db.execute("SELECT detail_done FROM entities WHERE kind='anime' AND id=4").fetchone()==(1,)
 assert db.execute("SELECT checked FROM coverage_candidates WHERE kind='manga' AND id=99").fetchone()==(0,)
 db.executemany("INSERT INTO coverage_candidates(kind,id) VALUES('anime',?)",[(eid,) for eid in range(100,115)])
 db.commit();db.close()
 with patch.object(sys,'argv',argv+['--kind','anime','--connections','1']),patch.object(collector.http.client,'HTTPSConnection',Connection),contextlib.redirect_stdout(io.StringIO()):collector.main()
 db=sqlite3.connect(root/'mal.sqlite3')
 assert progress_before_request==[10],progress_before_request
 assert db.execute("SELECT count(*) FROM coverage_candidates WHERE kind='anime' AND id>=100 AND checked=-1").fetchone()==(15,)
 db.execute("INSERT INTO streams VALUES('anime','diagnostic-basic-1','https://api.myanimelist.net/v2/anime/1?fields=id%2Ctitle',0)")
 db.execute("INSERT INTO streams VALUES('anime','diagnostic-basic-2','https://api.myanimelist.net/v2/anime/2?fields=id%2Ctitle',0)")
 db.commit();db.close()
 with patch.object(sys,'argv',argv+['--kind','anime']),patch.object(collector.http.client,'HTTPSConnection',Connection),contextlib.redirect_stdout(io.StringIO()):collector.main()
 db=sqlite3.connect(root/'mal.sqlite3')
 assert db.execute("SELECT done FROM streams WHERE ranking='diagnostic-basic-1'").fetchone()==(1,)
 assert db.execute("SELECT done FROM streams WHERE ranking='diagnostic-basic-2'").fetchone()==(-1,)
 assert db.execute("SELECT status FROM responses WHERE url='https://api.myanimelist.net/v2/anime/1?fields=id%2Ctitle'").fetchone()==(200,)
 assert db.execute("SELECT status FROM responses WHERE url='https://api.myanimelist.net/v2/anime/2?fields=id%2Ctitle'").fetchone()==(404,)
 assert db.execute("SELECT count(*) FROM entities WHERE kind='anime' AND id=2").fetchone()==(0,)
 assert db.execute("SELECT detail_done FROM entities WHERE kind='anime' AND id=1").fetchone()==(1,)
 db.execute("UPDATE streams SET done=0,next_url='https://api.myanimelist.net/v2/anime/1?fields=id%2Ctitle' WHERE ranking='diagnostic-basic-1'")
 db.commit();db.close()
 class WrongDiagnosticIdentity(Connection):
  def getresponse(self):return Response(200,{'id':9,'title':'wrong resource'})
 try:
  with patch.object(sys,'argv',argv+['--kind','anime']),patch.object(collector.http.client,'HTTPSConnection',WrongDiagnosticIdentity),contextlib.redirect_stdout(io.StringIO()):collector.main()
 except RuntimeError as exc:assert 'Diagnostic response identity mismatch' in str(exc)
 else:raise AssertionError('Wrong diagnostic ID was accepted')
 db=sqlite3.connect(root/'mal.sqlite3')
 assert db.execute("SELECT done FROM streams WHERE ranking='diagnostic-basic-1'").fetchone()==(0,)
 db.close()
print('PASS: existing ID collected; missing ID preserved as 404; rejected field isolated; partial record and types preserved.')
print('PASS: anime-only refresh finishes all nine rankings and preserves the pending manga queue.')
print('PASS: new observed anime bounds enqueue and collect intervening IDs without redoing old probes.')
print('PASS: nested selector fallback resolves a gap only when the matching-ID response actually contains the field.')
print('PASS: live progress checkpoints advance after HTTP 404 candidates, before the run finishes.')
print('PASS: diagnostic requests preserve minimal selectors and record 200/404 without fabricating discovery or complete detail records.')
