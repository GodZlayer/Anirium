"""Resumable official MAL catalogue acquisition. Never stores credentials."""
import argparse, datetime, json, pathlib, re, sqlite3, time, urllib.request, urllib.error, urllib.parse, os, msvcrt, gzip
import http.client, threading, concurrent.futures, io

COMMON = 'id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,pictures,background,related_anime,related_manga,recommendations'
FIELDS = {
 'anime': COMMON + ',num_episodes,start_season,broadcast,source,average_episode_duration,rating,studios,statistics,opening_themes,ending_themes',
 'manga': COMMON + ',num_volumes,num_chapters,authors,serialization',
}
RANKS = {'anime':['bypopularity','all','airing','upcoming','tv','ova','movie','special','favorite'], 'manga':['bypopularity','all','manga','novels','oneshots','doujin','manhwa','manhua','favorite']}
VERIFIED_EXTRA_FIELDS={'anime':['opening_themes','ending_themes'],'manga':[]}

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()

def read_json_body(response):
 data=response.read()
 if response.headers.get('Content-Encoding','').lower()=='gzip': data=gzip.decompress(data)
 return data.decode('utf-8')

def overlap_cursor(current_url,next_url):
 if not next_url:return None
 current=dict(urllib.parse.parse_qsl(urllib.parse.urlparse(current_url).query));u=urllib.parse.urlparse(next_url);query=dict(urllib.parse.parse_qsl(u.query))
 limit=int(query.get('limit',current.get('limit','100')));offset=int(query.get('offset','0'));previous=int(current.get('offset','0'))
 if offset>previous:query['offset']=str(max(previous+1,offset-min(50,max(1,limit//10))))
 return urllib.parse.urlunparse(u._replace(query=urllib.parse.urlencode(query)))

def schema_fields(spec,kind):
 schemas=spec['components']['schemas']
 def properties(schema):
  if '$ref' in schema:return properties(schemas[schema['$ref'].split('/')[-1]])
  if schema.get('type')=='array':return properties(schema.get('items',{}))
  result=dict(schema.get('properties',{}))
  for child in schema.get('allOf',[]):result.update(properties(child))
  return result
 def select(schema,depth=0):
  if depth>12:raise ValueError('Unexpected recursive schema')
  fields=[]
  for name,child in sorted(properties(schema).items()):
   if name=='my_list_status':continue
   nested=select(child,depth+1)
   fields.append(name+('{'+nested+'}' if nested else ''))
  return ','.join(fields)
 return ','.join([select(schemas[kind.capitalize()+'ForDetails'])]+VERIFIED_EXTRA_FIELDS[kind])

def split_fields(selector):
 result=[];depth=0;start=0
 for i,char in enumerate(selector+','):
  if char=='{':depth+=1
  elif char=='}':depth-=1
  elif char==',' and depth==0:result.append(selector[start:i]);start=i+1
 return result

def recover_detail_fields(fetch,base_url,selectors,expected_id):
 """Preserve raw fragments separately; merged result is explicitly reconstructed."""
 pending=[split_fields(selectors)];merged={};evidence=[];gaps=[]
 while pending:
  group=pending.pop(0);url=base_url+'?'+urllib.parse.urlencode({'fields':','.join(group)});data=fetch(url);evidence.append(url)
  if data.get('_http_error')==400:
   if len(group)==1:
    field=group[0].split('{',1)[0];gaps.append({'field':field,'selector':group[0],'status':400,'url':url})
    if '{' in group[0]:
     fallback_url=base_url+'?'+urllib.parse.urlencode({'fields':field});fallback=fetch(fallback_url);evidence.append(fallback_url)
     if '_http_error' not in fallback:
      if fallback.get('id')!=expected_id:raise RuntimeError('Fallback identity mismatch')
      merged.update(fallback)
      if field in fallback:gaps.pop()
   else:mid=len(group)//2;pending.extend([group[:mid],group[mid:]])
  elif '_http_error' in data:
   gaps.extend({'field':x.split('{',1)[0],'selector':x,'status':data['_http_error'],'url':url} for x in group)
  else:
   if data.get('id')!=expected_id:raise RuntimeError('Fragment identity mismatch')
   merged.update(data)
 return merged,evidence,gaps

def main():
 p=argparse.ArgumentParser(); p.add_argument('--credentials',required=True); p.add_argument('--output',required=True); p.add_argument('--max-requests',type=int,default=0); p.add_argument('--delay',type=float,default=1.2); p.add_argument('--connections',type=int,default=4); p.add_argument('--min-interval',type=float,default=1.0)
 p.add_argument('--kind',choices=('anime','manga'));p.add_argument('--refresh-discovery',action='store_true')
 a=p.parse_args(); out=pathlib.Path(a.output); out.mkdir(parents=True,exist_ok=True)
 if not 1<=a.connections<=4 or a.delay<0 or a.min_interval<0:raise SystemExit('Use 1..4 connections and nonnegative intervals')
 lock=(out/'collector.lock').open('a+b'); lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
 try: msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
 except OSError: raise SystemExit('Another collector holds the acquisition lock')
 spec_path=out/'official-openapi.json'
 if spec_path.exists():
  spec=json.loads(spec_path.read_text(encoding='utf-8'))
  for kind in FIELDS:FIELDS[kind]=schema_fields(spec,kind)
 secret=pathlib.Path(a.credentials).read_text(encoding='utf-8-sig'); m=re.search(r'(?im)^\s*client\s*id\s*[:=]?\s*([a-f0-9]{32})\s*$',secret)
 if not m: raise SystemExit('Client ID not found')
 client=m.group(1); del secret
 local=threading.local(); pool=concurrent.futures.ThreadPoolExecutor(max_workers=a.connections); prefetched={}
 pace_lock=threading.Lock();next_start=0.0
 def transfer(url):
  nonlocal next_start
  parsed=urllib.parse.urlparse(url)
  if parsed.scheme!='https' or parsed.netloc!='api.myanimelist.net':raise ValueError('Unexpected API origin')
  time.sleep(a.delay)
  if getattr(local,'connection',None) and getattr(local,'requests',0)>=20:
   local.connection.close();local.connection=None
  if not getattr(local,'connection',None):
   local.connection=http.client.HTTPSConnection('api.myanimelist.net',timeout=40);local.requests=0
  try:
   for redirect in range(4):
    with pace_lock:
     time.sleep(max(0,next_start-time.monotonic()));next_start=time.monotonic()+a.min_interval
    local.connection.request('GET',parsed.path+('?' + parsed.query if parsed.query else ''),headers={'X-MAL-CLIENT-ID':client,'Accept':'application/json','Accept-Encoding':'gzip'})
    local.requests+=1
    response=local.connection.getresponse();body=read_json_body(response);status=response.status;headers=response.headers
    if status not in (301,302,303,307,308):break
    destination=urllib.parse.urlparse(urllib.parse.urljoin(url,headers.get('Location','')))
    if destination.scheme!='https' or destination.netloc!='api.myanimelist.net' or destination.path not in (parsed.path,'/error.json'):raise ValueError('API redirect changed origin or resource; credentials not forwarded')
    parsed=destination
   if status!=200:raise urllib.error.HTTPError(url,status,'API rejection',headers,io.BytesIO(body.encode('utf-8')))
   return body,status
  except (OSError,http.client.HTTPException):
   local.connection.close();local.connection=None;raise
 db=sqlite3.connect(out/'mal.sqlite3'); db.execute('pragma journal_mode=WAL'); db.executescript('''
 CREATE TABLE IF NOT EXISTS responses(url TEXT PRIMARY KEY,status INTEGER NOT NULL,body TEXT NOT NULL,fetched_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id INTEGER NOT NULL,detail_done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS streams(kind TEXT NOT NULL,ranking TEXT NOT NULL,next_url TEXT,done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,ranking));
 CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY,started_at TEXT,finished_at TEXT,state TEXT,requests INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS failures(url TEXT PRIMARY KEY,status INTEGER,observed_at TEXT,reason TEXT);
 CREATE TABLE IF NOT EXISTS response_history(url TEXT,status INTEGER,body TEXT,fetched_at TEXT,PRIMARY KEY(url,fetched_at));
 CREATE TABLE IF NOT EXISTS field_gaps(kind TEXT,id INTEGER,field TEXT,status INTEGER,evidence TEXT,PRIMARY KEY(kind,id,field));
 CREATE TABLE IF NOT EXISTS recovered_details(kind TEXT,id INTEGER,body TEXT,evidence TEXT,collected_at TEXT,PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS coverage_candidates(kind TEXT NOT NULL,id INTEGER NOT NULL,checked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,id));
 CREATE TRIGGER IF NOT EXISTS preserve_response BEFORE UPDATE ON responses WHEN OLD.body != NEW.body BEGIN
 INSERT OR IGNORE INTO response_history VALUES(OLD.url,OLD.status,OLD.body,OLD.fetched_at);
 END;
 ''')
 selected_kinds=[a.kind] if a.kind else list(RANKS)
 for kind,ranks in RANKS.items():
  if kind not in selected_kinds:continue
  for rank in ranks:
   url='https://api.myanimelist.net/v2/'+kind+'/ranking?'+urllib.parse.urlencode({'ranking_type':rank,'limit':500,'nsfw':'true','fields':FIELDS[kind]})
   db.execute('insert or ignore into streams(kind,ranking,next_url) values(?,?,?)',(kind,rank,url))
   if a.refresh_discovery:db.execute('update streams set next_url=?,done=0 where kind=? and ranking=?',(url,kind,rank))
  url='https://api.myanimelist.net/v2/'+kind+'/ranking?'+urllib.parse.urlencode({'ranking_type':'bypopularity','limit':500,'nsfw':'true','fields':FIELDS[kind]})
  db.execute('insert or ignore into streams(kind,ranking,next_url) values(?,?,?)',(kind,'verification-bypopularity',url))
 for year in (range(1900,datetime.datetime.now().year+3) if 'anime' in selected_kinds else []):
  for season in ('winter','spring','summer','fall'):
   url=f'https://api.myanimelist.net/v2/anime/season/{year}/{season}?'+urllib.parse.urlencode({'limit':500,'nsfw':'true','fields':FIELDS['anime']})
   db.execute('insert or ignore into streams(kind,ranking,next_url) values(?,?,?)',('anime',f'season-{year}-{season}',url))
 for kind,rank,url in db.execute('select kind,ranking,next_url from streams where done=0').fetchall():
  if rank.startswith('diagnostic-'):continue
  u=urllib.parse.urlparse(url);query=dict(urllib.parse.parse_qsl(u.query));query.update(limit='100' if rank.startswith('search-') else query.get('limit','500'),fields=FIELDS[kind]);db.execute('update streams set next_url=? where kind=? and ranking=?',(urllib.parse.urlunparse(u._replace(query=urllib.parse.urlencode(query))),kind,rank))
 db.execute('insert into runs(started_at,state) values(?,?)',(now(),'running')); run=db.execute('select last_insert_rowid()').fetchone()[0]; db.commit(); count=0
 def report(state):
  summary={'at':now(),'pid':os.getpid(),'run':run,'state':state,'requests_this_run':count,'entities':[{'kind':k,'discovered':n,'details_collected':d} for k,n,d in db.execute('select kind,count(*),sum(case when detail_done=1 then 1 else 0 end) from entities group by kind')], 'streams_finished':db.execute('select count(*) from streams where done=1').fetchone()[0],'streams_total':db.execute('select count(*) from streams').fetchone()[0],'responses':db.execute('select count(*) from responses').fetchone()[0],'failures':db.execute('select count(*) from failures').fetchone()[0], 'coverage_verified':False,'remaining_scope':['verify ranking exclusions and catalogue coverage','seasonal discovery and relation closure','audit catalogue fields and nested values; exclude user-specific data','refresh mutable records; no provider snapshot isolation']}
  temp=out/'progress.tmp'; temp.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8'); temp.replace(out/'progress.json'); print(json.dumps(summary,ensure_ascii=False),flush=True)
 def request(url):
  nonlocal count,next_start
  parsed=urllib.parse.urlparse(url)
  if parsed.scheme!='https' or parsed.netloc!='api.myanimelist.net': raise ValueError('Unexpected pagination origin')
  for attempt in range(7):
   try:
    future=prefetched.pop(url,None);body,status=future.result() if future else transfer(url)
    count+=1; data=json.loads(body)
    db.execute('insert into responses values(?,?,?,?) on conflict(url) do update set status=excluded.status,body=excluded.body,fetched_at=excluded.fetched_at',(url,status,body,now())); return data
   except urllib.error.HTTPError as exc:
    count+=1
    if exc.code in (400,404):
     body=exc.read().decode('utf-8');db.execute('insert into responses values(?,?,?,?) on conflict(url) do update set status=excluded.status,body=excluded.body,fetched_at=excluded.fetched_at',(url,exc.code,body,now()));db.execute('insert or replace into failures values(?,?,?,?)',(url,exc.code,now(),'Unresolved API rejection; not treated as coverage proof'));return {'_http_error':exc.code}
    if exc.code in (401,403): raise RuntimeError('API authorization denied: '+str(exc.code)) from None
    if exc.code not in (429,500,502,503,504): raise RuntimeError('API HTTP '+str(exc.code)) from None
    wait=max(float(exc.headers.get('Retry-After','0')) if str(exc.headers.get('Retry-After','0')).isdigit() else 0, min(60,2**attempt*3))
    if exc.code==429:
     with pace_lock:next_start=max(next_start,time.monotonic()+wait)
    print(json.dumps({'at':now(),'event':'api_retry','path':parsed.path,'status':exc.code,'attempt':attempt+1,'wait_seconds':wait}),flush=True);time.sleep(wait)
   except (OSError,http.client.HTTPException,urllib.error.URLError) as exc:
    wait=min(60,2**attempt*3)
    print(json.dumps({'at':now(),'event':'transport_retry','path':parsed.path,'error':type(exc).__name__,'attempt':attempt+1,'wait_seconds':wait}),flush=True);time.sleep(wait)
  raise RuntimeError('API retry budget exhausted; cursor preserved')
 def discover(kind,data):
  for item in data.get('data',[]):
   node=item.get('node',{});
   if 'id' in node: db.execute('insert or ignore into entities(kind,id) values(?,?)',(kind,node['id']))
 def extend_candidate_bounds():
  # New discovery can raise the observed maximum; retain all prior probe evidence.
  for kind in selected_kinds:
   highest=db.execute('select coalesce(max(id),0) from entities where kind=?',(kind,)).fetchone()[0]
   previous=db.execute('select coalesce(max(id),0) from coverage_candidates where kind=?',(kind,)).fetchone()[0]
   if highest>previous:
    known={row[0] for row in db.execute('select id from entities where kind=? and id>?',(kind,previous))}
    db.executemany('insert or ignore into coverage_candidates(kind,id) values(?,?)',((kind,eid) for eid in range(previous+1,highest+1) if eid not in known))
    db.commit()
 def related(data,owner_kind):
  for kind in ('anime','manga'):
   for item in data.get('related_'+kind,[]):
    node=item.get('node',{});
    if 'id' in node: db.execute('insert or ignore into entities(kind,id) values(?,?)',(kind,node['id']))
  for item in data.get('recommendations',[]):
   node=item.get('node',{})
   if 'id' in node: db.execute('insert or ignore into entities(kind,id) values(?,?)',(owner_kind,node['id']))
 def recover(kind,eid):
  def fetch(url):
   result=request(url);db.commit();return result
  data,evidence,gaps=recover_detail_fields(fetch,'https://api.myanimelist.net/v2/'+kind+'/'+str(eid),FIELDS[kind],eid)
  for field in data:db.execute('delete from field_gaps where kind=? and id=? and field=?',(kind,eid,field))
  for gap in gaps:db.execute('insert or replace into field_gaps values(?,?,?,?,?)',(kind,eid,gap['field'],gap['status'],gap['url']))
  if data:
   db.execute('insert or replace into recovered_details values(?,?,?,?,?)',(kind,eid,json.dumps(data,ensure_ascii=False),json.dumps(evidence),now()));related(data,kind)
  db.execute('update entities set detail_done=? where kind=? and id=?',(2 if gaps else 1,kind,eid));db.commit();return data
 try:
  report('running')
  last_checkpoint_count=0
  while not a.max_requests or count<a.max_requests:
   # A rejected candidate also advances acquisition; checkpoint before any branch.
   if count!=last_checkpoint_count:
    db.execute('update runs set requests=? where id=?',(count,run));db.commit();last_checkpoint_count=count
    if count%10==0:report('running')
   stream=db.execute('select kind,ranking,next_url from streams where done=0 and (? is null or kind=?) order by case when ranking="bypopularity" then 0 when ranking like "season-%" then 2 else 1 end,kind,ranking limit 1',(a.kind,a.kind)).fetchone()
   if stream:
    kind,rank,url=stream
    if rank.startswith('diagnostic-'):
     # These are evidence requests, never discovery completion or full details.
     identity=re.fullmatch(r'/v2/(anime|manga)/(\d+)',urllib.parse.urlparse(url).path)
     if not identity or identity[1]!=kind:raise RuntimeError('Diagnostic resource identity mismatch')
     concurrent.futures.wait(tuple(prefetched.values()))
     data=request(url)
     if '_http_error' not in data and data.get('id')!=int(identity[2]):raise RuntimeError('Diagnostic response identity mismatch')
     db.execute('update streams set done=?,next_url=? where kind=? and ranking=?',(-1 if '_http_error' in data else 1,url if '_http_error' in data else None,kind,rank));db.commit();report('diagnostic_request_finished');continue
    data=request(url)
    if '_http_error' in data:
     parts=urllib.parse.urlparse(url);query=dict(urllib.parse.parse_qsl(parts.query));limit=int(query.get('limit','100'))
     if data['_http_error']==400 and parts.path.endswith('/ranking') and limit>1:
      query['limit']=str(max(1,limit//5));retry_url=urllib.parse.urlunparse(parts._replace(query=urllib.parse.urlencode(query)))
      db.execute('update streams set next_url=? where kind=? and ranking=?',(retry_url,kind,rank));db.commit();report('retrying_smaller_page_with_all_fields');continue
     if data['_http_error']==400 and parts.path.endswith('/ranking') and limit==1:
      query['fields']='id,title';minimal_url=urllib.parse.urlunparse(parts._replace(query=urllib.parse.urlencode(query)));minimal=request(minimal_url);db.commit()
      if '_http_error' not in minimal and minimal.get('data'):
       discover(kind,minimal)
       for item in minimal['data']:recover(kind,item['node']['id'])
       nxt=minimal.get('paging',{}).get('next')
       if nxt:
        next_parts=urllib.parse.urlparse(nxt);next_query=dict(urllib.parse.parse_qsl(next_parts.query));next_query.update(fields=FIELDS[kind],limit='500');nxt=urllib.parse.urlunparse(next_parts._replace(query=urllib.parse.urlencode(next_query)))
       db.execute('update streams set next_url=?,done=? where kind=? and ranking=?',(nxt,int(not nxt),kind,rank));db.commit();report('recovered_available_fields_with_explicit_gaps');continue
     db.execute('update streams set done=-1,next_url=? where kind=? and ranking=?',(url,kind,rank));db.commit();report('running_with_unresolved_stream_rejection');continue
    discover(kind,data)
    for item in data.get('data',[]): related(item.get('node',{}),kind)
    nxt=overlap_cursor(url,data.get('paging',{}).get('next'))
    if nxt and urllib.parse.urlparse(url).path.endswith('/ranking'):
     next_parts=urllib.parse.urlparse(nxt);next_query=dict(urllib.parse.parse_qsl(next_parts.query));next_query['limit']='500';nxt=urllib.parse.urlunparse(next_parts._replace(query=urllib.parse.urlencode(next_query)))
    db.execute('update streams set next_url=?,done=? where kind=? and ranking=?',(nxt,int(not nxt),kind,rank))
   else:
    extend_candidate_bounds()
    if not prefetched:
     batch_size=min(a.connections,a.max_requests-count) if a.max_requests else a.connections
     for pending_kind,pending_id in db.execute('select kind,id from entities where detail_done=0 and (? is null or kind=?) order by kind,id limit ?',(a.kind,a.kind,batch_size)).fetchall():
      pending_url='https://api.myanimelist.net/v2/'+pending_kind+'/'+str(pending_id)+'?'+urllib.parse.urlencode({'fields':FIELDS[pending_kind]})
      prefetched[pending_url]=pool.submit(transfer,pending_url)
    entity=db.execute('select kind,id from entities where detail_done=0 and (? is null or kind=?) order by kind,id limit 1',(a.kind,a.kind)).fetchone()
    coverage_probe=False
    if not entity:
     if not prefetched:
      batch_size=min(a.connections,a.max_requests-count) if a.max_requests else a.connections
      candidates=db.execute('select c.kind,c.id from coverage_candidates c where c.checked=0 and (? is null or c.kind=?) and not exists(select 1 from entities e where e.kind=c.kind and e.id=c.id) order by c.kind,c.id limit ?',(a.kind,a.kind,batch_size)).fetchall()
      for pending_kind,pending_id in candidates:
       pending_url='https://api.myanimelist.net/v2/'+pending_kind+'/'+str(pending_id)+'?'+urllib.parse.urlencode({'fields':FIELDS[pending_kind]})
       prefetched[pending_url]=pool.submit(transfer,pending_url)
     candidate=db.execute('select kind,id from coverage_candidates where checked=0 and (? is null or kind=?) order by kind,id limit 1',(a.kind,a.kind)).fetchone()
     if not candidate:break
     kind,eid=candidate
     if db.execute('select 1 from entities where kind=? and id=?',(kind,eid)).fetchone():
      db.execute('update coverage_candidates set checked=1 where kind=? and id=?',(kind,eid));db.commit();continue
     entity=candidate;coverage_probe=True
    kind,eid=entity; url='https://api.myanimelist.net/v2/'+kind+'/'+str(eid)+'?'+urllib.parse.urlencode({'fields':FIELDS[kind]}); data=request(url)
    if '_http_error' in data:
     if data['_http_error']==400:
      if coverage_probe:
       basic=request('https://api.myanimelist.net/v2/'+kind+'/'+str(eid)+'?fields=id,title')
       if basic.get('id')!=eid:
        db.execute('update coverage_candidates set checked=? where kind=? and id=?',(-1 if basic.get('_http_error')==404 else -2,kind,eid));db.commit();continue
       db.execute('insert or ignore into entities(kind,id) values(?,?)',(kind,eid))
      recover(kind,eid)
     else:db.execute('update entities set detail_done=-1 where kind=? and id=?',(kind,eid));db.commit()
     if coverage_probe:db.execute('update coverage_candidates set checked=? where kind=? and id=?',(-1 if data['_http_error']==404 else 1,kind,eid));db.commit()
     continue
    if data.get('id')!=eid: raise RuntimeError('Response identity mismatch')
    if coverage_probe:
     db.execute('insert or ignore into entities(kind,id) values(?,?)',(kind,eid));db.execute('update coverage_candidates set checked=1 where kind=? and id=?',(kind,eid))
    for field in data:db.execute('delete from field_gaps where kind=? and id=? and field=?',(kind,eid,field))
    unresolved=db.execute('select count(*) from field_gaps where kind=? and id=?',(kind,eid)).fetchone()[0]
    related(data,kind); db.execute('update entities set detail_done=? where kind=? and id=?',(2 if unresolved else 1,kind,eid))
   db.commit()
  state='batch_finished' if a.max_requests and count>=a.max_requests else 'catalogue_pass_finished_coverage_unverified'
 except BaseException as exc:
  pool.shutdown(wait=True,cancel_futures=True)
  db.rollback(); state='interrupted' if isinstance(exc,KeyboardInterrupt) else 'failed'; report(state); db.execute('update runs set finished_at=?,state=?,requests=? where id=?',(now(),state,count,run)); db.commit();db.close();lock.close(); raise
 pool.shutdown(wait=True,cancel_futures=True)
 db.execute('update runs set finished_at=?,state=?,requests=? where id=?',(now(),state,count,run)); db.commit(); report(state)
 db.close();lock.close()

if __name__=='__main__': main()
