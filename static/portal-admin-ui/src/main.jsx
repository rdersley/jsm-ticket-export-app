import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';
import CustomerFilters from './CustomerFilters.jsx';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function unique(values){return [...new Set((values||[]).map(String))]}

function App(){
  const [reports,setReports]=useState([]);
  const [serviceDesks,setServiceDesks]=useState([]);
  const [organizations,setOrganizations]=useState([]);
  const [selected,setSelected]=useState(null);
  const [customerQuery,setCustomerQuery]=useState('');
  const [customerResults,setCustomerResults]=useState([]);
  const [knownUsers,setKnownUsers]=useState({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  const load=async()=>{
    setBusy(true);
    try{
      const [rows,desks,orgs]=await Promise.all([
        invoke('portal-admin:list'),
        invoke('portal-admin:service-desks').catch(()=>[]),
        invoke('portal-admin:organizations').catch(()=>[])
      ]);
      setReports(rows||[]);setServiceDesks(desks||[]);setOrganizations(orgs||[]);
      if(selected){const fresh=(rows||[]).find(r=>r.id===selected.id);if(fresh)setSelected(fresh)}
    }catch(e){setMessage(e?.message||'Could not load portal report settings.')}finally{setBusy(false)}
  };
  useEffect(()=>{load()},[]);

  const cfg=selected?.config||{};
  const patch=(key,value)=>setSelected(r=>({...r,config:{...r.config,[key]:value}}));
  const toggleId=(key,id)=>{
    const values=new Set(cfg[key]||[]);values.has(String(id))?values.delete(String(id)):values.add(String(id));patch(key,[...values]);
  };
  const save=async()=>{setBusy(true);try{const saved=await invoke('portal-admin:save',{reportId:selected.id,config:selected.config});setSelected(r=>({...r,config:saved}));setMessage('Portal access saved.');await load()}catch(e){setMessage(e?.message||'Could not save portal access.')}finally{setBusy(false)}};
  const searchCustomers=async()=>{
    const serviceDeskIds=cfg.serviceDeskIds||[];
    if(!serviceDeskIds.length){setMessage('Select at least one service project first.');return}
    setBusy(true);try{
      const results=await invoke('portal-admin:customers',{serviceDeskIds,organizationIds:cfg.organizationIds||[],query:customerQuery})||[];
      setCustomerResults(results);
      setKnownUsers(existing=>({...existing,...Object.fromEntries(results.filter(u=>u.accountId).map(u=>[String(u.accountId),u]))}));
      setMessage(results.length ? `${results.length} matching portal user${results.length===1?'':'s'} found.` : 'No matching portal users found.');
    }catch(e){setMessage(e?.message||'Could not search portal customers.')}finally{setBusy(false)}
  };
  const publish=async()=>{
    setBusy(true);setMessage(`Generating a portal copy of ${selected.name}…`);let jobId;
    try{
      const started=await invoke('portal-admin:publish',{reportId:selected.id});jobId=started.jobId;
      for(let i=0;i<300;i++){
        const status=await invoke('portal-admin:job-status',{jobId});
        if(status?.state==='ready'){setMessage(`Published ${status.issueCount??0} work items to the portal.`);await load();return}
        if(status?.state==='failed')throw new Error(status.message||'Portal publish failed.');
        await sleep(2000);
      }
      throw new Error('The report is still generating.');
    }catch(e){setMessage(e?.message||'Could not publish portal report.')}finally{if(jobId)await invoke('portal-admin:job-cleanup',{jobId}).catch(()=>{});setBusy(false)}
  };

  const selectedUsers=useMemo(()=>unique(cfg.userAccountIds||[]),[cfg.userAccountIds]);
  const selectedOrgs=useMemo(()=>unique(cfg.organizationIds||[]),[cfg.organizationIds]);

  if(selected)return <main>
    <header><div><button className="link" onClick={()=>setSelected(null)}>← Portal reports</button><div className="eyebrow">Portal access</div><h1>{selected.name}</h1><p>{selected.description||'Control who can see and run this saved Excel report in the JSM customer portal.'}</p></div><div className="actions"><button disabled={busy} onClick={publish}>Generate & publish now</button><button className="primary" disabled={busy} onClick={save}>Save access</button></div></header>
    {message&&<div className="notice">{message}</div>}
    <section className="panel">
      <label className="check"><input type="checkbox" checked={cfg.enabled===true} onChange={e=>patch('enabled',e.target.checked)}/>Publish this report to the JSM customer portal</label>
      <div className="grid"><label>Portal access<select value={cfg.accessMode||'all'} onChange={e=>patch('accessMode',e.target.value)}><option value="all">All signed-in portal customers in selected service projects</option><option value="selected">Only selected users and organisations</option></select></label><label>Actions<div className="checks"><label><input type="checkbox" checked={cfg.allowDownload!==false} onChange={e=>patch('allowDownload',e.target.checked)}/>Download latest</label><label><input type="checkbox" checked={cfg.allowRun!==false} onChange={e=>patch('allowRun',e.target.checked)}/>Generate on demand</label></div></label></div>
      <h2>Service projects</h2><p className="help">Choose where this report is available. Leave all unchecked to allow it from any JSM portal where the customer otherwise has access.</p>
      <div className="options">{serviceDesks.map(d=><label key={d.id}><input type="checkbox" checked={(cfg.serviceDeskIds||[]).includes(String(d.id))} onChange={()=>toggleId('serviceDeskIds',d.id)}/><span>{d.projectName||d.name||`Service project ${d.id}`}</span></label>)}</div>

      {cfg.accessMode==='selected'&&<>
        <h2>Selected portal users</h2><div className="searchRow"><input value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();searchCustomers()}}} placeholder="Search name or email"/><button disabled={busy} onClick={searchCustomers}>Search</button></div>
        {!!selectedUsers.length&&<div className="chips">{selectedUsers.map(id=>{const u=knownUsers[id];return <span key={id}>{u?.displayName||u?.emailAddress||id}<button onClick={()=>toggleId('userAccountIds',id)}>×</button></span>})}</div>}
        {!!customerResults.length&&<div className="results">{customerResults.map(u=>{
  const secondary=u.emailAddress||u.email||'Portal customer';
  return <div key={u.accountId||u.name}><div><strong>{u.displayName||u.name||'Portal customer'}</strong><small>{secondary}</small></div><button disabled={selectedUsers.includes(String(u.accountId))} onClick={()=>toggleId('userAccountIds',u.accountId)}>Add</button></div>
})}</div>}
        <h2>Selected organisations</h2><div className="options">{organizations.map(o=><label key={o.id}><input type="checkbox" checked={selectedOrgs.includes(String(o.id))} onChange={()=>toggleId('organizationIds',o.id)}/><span>{o.name}</span></label>)}</div>
      </>}
      {cfg.allowRun!==false&&<CustomerFilters value={cfg.filters} disabled={busy} onChange={v=>patch('filters',v)}/>}
      <div className="info">Portal users must be signed in. Restricted reports are checked against the customer's Atlassian account and JSM organisation memberships before they are listed, generated or downloaded.</div>
    </section>
  </main>;

  return <main><header><div><div className="eyebrow">Nuvriqo</div><h1>Portal Reports</h1><p>Publish selected saved Excel reports to Jira Service Management customers without exposing report JQL or template configuration.</p></div></header>{message&&<div className="notice">{message}</div>}<section className="panel">{!reports.length?<p>No saved reports found.</p>:reports.map(r=><article className="report" key={r.id}><div><div className="title"><strong>{r.name}</strong><span className={r.config?.enabled?'pill on':'pill'}>{r.config?.enabled?'Published':'Not published'}</span></div><p>{r.description||'Saved Excel report'}</p><small>{r.latest?`Latest portal copy: ${new Date(r.latest.generatedAt).toLocaleString()} · ${r.latest.issueCount??0} work items`:'No portal copy generated yet.'}</small></div><button onClick={()=>setSelected(r)}>Configure</button></article>)}</section></main>;
}

createRoot(document.getElementById('root')).render(<App/>);
