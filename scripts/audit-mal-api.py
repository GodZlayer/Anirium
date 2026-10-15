"""Audit saved API evidence; counts are not claims of provider completeness."""
import argparse,collections,datetime,json,pathlib,re,sqlite3,urllib.parse

def top_fields(selector):
 depth=0;start=0;result=set()
 for i,char in enumerate(selector+','):
  if char=='{':depth+=1
  elif char=='}':depth-=1
  elif char==',' and depth==0:result.add(selector[start:i].split('{',1)[0]);start=i+1
 return result

def audit(root,since=None):
 db=sqlite3.connect(f'file:{(root/"mal.sqlite3").as_posix()}?mode=ro',uri=True)
 db.execute('BEGIN')  # One WAL snapshot for response and queue counts during live ingestion.
 spec=json.loads((root/'official-openapi.json').read_text(encoding='utf-8'))
 endpoints={path:{'method':'GET','saved_responses':0,'http_statuses':{},'authenticated_only':not any('client_auth' in entry for entry in op['get'].get('security',[]))} for path,op in spec['paths'].items() if 'get' in op}
 detail_counts=collections.Counter(); full_detail_ids=collections.defaultdict(set); missing_fields=collections.defaultdict(collections.Counter); media=collections.Counter(); ids=collections.defaultdict(set); list_ids=collections.defaultdict(set); ranks=collections.defaultdict(set); non_json=[]; mismatches=[]
 def properties(schema):
  if '$ref' in schema:return properties(spec['components']['schemas'][schema['$ref'].split('/')[-1]])
  result=dict(schema.get('properties',{}))
  for child in schema.get('allOf',[]):result.update(properties(child))
  return result
 fields={kind:properties(spec['components']['schemas'][kind.capitalize()+'ForDetails']) for kind in ('anime','manga')}
 extra_path=root/'extra-field-probe.json';extra_fields=[]
 if extra_path.exists():
  extra_fields=json.loads(extra_path.read_text(encoding='utf-8')).get('returned_candidate_fields',[])
  for name in extra_fields:fields['anime'][name]={'observed_extra_field':True}
 status_counts=collections.defaultdict(collections.Counter)
 fresh_ids=collections.defaultdict(set);reference_ids=collections.defaultdict(set)
 def references(data,owner_kind):
  for target in ('anime','manga'):
   reference_ids[target].update(item['node']['id'] for item in data.get('related_'+target,[]) if 'id' in item.get('node',{}))
  reference_ids[owner_kind].update(item['node']['id'] for item in data.get('recommendations',[]) if 'id' in item.get('node',{}))
 for url,status,body,fetched_at in db.execute('select url,status,body,fetched_at from responses'):
  parsed=urllib.parse.urlparse(url);path=parsed.path.removeprefix('/v2');endpoint=path
  for candidate in ([] if path in endpoints else endpoints):
   pattern=re.sub(r'\{[^}]+\}',r'[^/]+',candidate)
   if re.fullmatch(pattern,path):endpoint=candidate;break
  if endpoint in endpoints:endpoints[endpoint]['saved_responses']+=1;status_counts[endpoint][status]+=1
  try:data=json.loads(body)
  except json.JSONDecodeError:non_json.append({'url':url,'status':status});continue
  if status!=200:continue
  match=re.fullmatch(r'/(anime|manga)/(\d+)',path)
  if match:
   kind,eid=match.group(1),int(match.group(2));detail_counts[kind]+=1
   references(data,kind)
   if data.get('id')!=eid:mismatches.append({'url':url,'expected':eid,'actual':data.get('id')})
   requested=top_fields(urllib.parse.parse_qs(parsed.query).get('fields',[''])[0])
   if set(fields[kind])-{'my_list_status'} <= requested:full_detail_ids[kind].add(eid)
   for f in (set(fields[kind]) & requested)-set(data):missing_fields[kind][f]+=1
  if path.startswith(('/anime','/manga')):
   kind=path.split('/')[1]
   for item in data.get('data',[]):
    node=item.get('node',{});eid=node.get('id')
    if eid is None:continue
    ids[kind].add(eid);media[kind+':'+node.get('media_type','missing')]+=1
    references(node,kind)
    if since is not None and fetched_at>=since:fresh_ids[kind].add(eid)
    query=urllib.parse.parse_qs(parsed.query);source=query.get('ranking_type',[path])[0]
    if path in ('/anime','/manga'):source='search-'+query.get('q',[''])[0]
    seasonal=re.fullmatch(r'/anime/season/(\d+)/(\w+)',path)
    if seasonal:source='season-'+seasonal.group(1)+'-'+seasonal.group(2)
    list_ids[(kind,source)].add(eid)
    if 'ranking' in item:ranks[(kind,source)].add(item['ranking']['rank'])
 for endpoint in endpoints:endpoints[endpoint]['http_statuses']=dict(status_counts[endpoint])
 streams=[{'kind':kind,'source':source,'done':done,'has_cursor':bool(cursor),'distinct_ids_observed':len(list_ids[(kind,source)])} for kind,source,done,cursor in db.execute('select kind,ranking,done,next_url from streams')]
 result={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'integrity_check':db.execute('pragma integrity_check').fetchone()[0],'entities':[{ 'kind':kind,'count':n,'details_marked_done':d,'detail_rejections':e} for kind,n,d,e in db.execute('select kind,count(*),sum(detail_done=1),sum(detail_done=-1) from entities group by kind')],'detail_responses_saved':dict(detail_counts),'documented_fields_omitted':{k:dict(v) for k,v in missing_fields.items()},'endpoint_inventory':endpoints,'stream_counts':{'total':len(streams),'finished':sum(s['done'] for s in streams)},'finished_rankings':[s for s in streams if s['done'] and not s['source'].startswith('season-')],'media_occurrences':dict(media),'malformed_json':non_json,'identity_mismatches':mismatches,'api_rejections':[dict(zip(('url','status','observed_at','reason'),r)) for r in db.execute('select * from failures')],'coverage_verified':False,'remaining_requirements':['Finish all discovery streams and details','Compare independent discovery sources and reconcile ranking movement','Audit records excluded from rankings and without date/relations','Verify all catalogue read endpoints and available fields; forums and personal data excluded','Validate nested-field completeness against schemas and actual output','Define verifiable snapshot boundary for mutable provider data']}
 result['stream_counts']['finished']=sum(s['done']==1 for s in streams)
 result['stream_counts']['rejected']=sum(s['done']==-1 for s in streams)
 result['finished_rankings']=[s for s in streams if s['done']==1 and not s['source'].startswith(('season-','diagnostic-'))]
 result['diagnostic_requests']=[s for s in streams if s['source'].startswith('diagnostic-')]
 result['ids_requested_with_all_public_detail_fields']={k:len(v) for k,v in full_detail_ids.items()}
 result['extra_anime_fields_verified']=extra_fields
 result['scope']='Global anime/manga catalogue information; excludes forums, accounts and personal lists'
 known={kind:dict(db.execute('select id,detail_done from entities where kind=?',(kind,))) for kind in ('anime','manga')}
 for kind,body in db.execute('select kind,body from recovered_details'):references(json.loads(body),kind)
 result['reconciliation_since']=since
 result['catalogue_reconciliation']={kind:{
  'saved_complete':sum(state==1 for state in known[kind].values()),
  'saved_partial_ids':sorted(eid for eid,state in known[kind].items() if state==2),
  'pending_detail_ids':sorted(eid for eid,state in known[kind].items() if state==0),
  'unavailable_detail_ids':sorted(eid for eid,state in known[kind].items() if state==-1),
  'fresh_list_ids':len(fresh_ids[kind]) if since else None,
  'fresh_list_ids_without_complete_details':sorted(eid for eid in fresh_ids[kind] if known[kind].get(eid)!=1) if since else None,
  'all_saved_list_ids':len(ids[kind]),
  'missing_saved_list_ids':sorted(ids[kind]-known[kind].keys()),
  'referenced_ids':len(reference_ids[kind]),
  'missing_reference_ids':sorted(reference_ids[kind]-known[kind].keys()),
  'complete_ids_without_full_selector_response':sorted(eid for eid,state in known[kind].items() if state==1 and eid not in full_detail_ids[kind]),
  'candidate_states':[list(row) for row in db.execute('select checked,count(*) from coverage_candidates where kind=? group by checked',(kind,))],
  'pending_unknown_candidate_ids':db.execute('select count(*) from coverage_candidates c where kind=? and checked=0 and not exists(select 1 from entities e where e.kind=c.kind and e.id=c.id)',(kind,)).fetchone()[0],
  'largest_observed_entity_id':max(known[kind],default=0),
 } for kind in ('anime','manga')}
 result['catalogue_endpoint_inventory']={path:entry for path,entry in endpoints.items() if path.startswith(('/anime','/manga')) and path!='/anime/suggestions'}
 for stream in result['finished_rankings']:
  if stream['source'].startswith('verification-'):
   stream['distinct_ids_observed']=None
   stream['observation_note']='Repeated pass uses the same URLs; responses/history preserve versions but cannot independently attribute IDs to this pass.'
 if db.execute("select 1 from sqlite_master where type='table' and name='field_gaps'").fetchone():
  result['unresolved_field_gaps']=[dict(zip(('kind','id','field','status','evidence'),row)) for row in db.execute('select * from field_gaps')]
 (root/'acquisition-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');return result

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',default='data/mal-api-acquisition');parser.add_argument('--since');args=parser.parse_args();r=audit(pathlib.Path(args.output).resolve(),args.since);print(json.dumps({k:r[k] for k in ('observed_at','integrity_check','entities','detail_responses_saved','stream_counts','catalogue_reconciliation','coverage_verified')},ensure_ascii=False))
