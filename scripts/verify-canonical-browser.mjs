import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

export async function verifyCanonicalBrowser(origin,account) {
  const browser=await puppeteer.launch({executablePath:process.env.ANIRIUM_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const errors=[],observations=[],responses=[];
  let page;
  try {
    page=await browser.newPage();
    page.on('response',response=>{if(response.url().startsWith(origin+'/api/'))responses.push({url:new URL(response.url()).pathname,status:response.status()});});
    page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request',request=>{
      // Keep every local API real; remote media/OAuth is outside this fixture.
      if(new URL(request.url()).origin!==origin)return request.abort();
      return request.continue();
    });
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:740}]) {
      await page.setViewport(viewport);
      await page.goto(origin,{waitUntil:'networkidle2'});
      await page.waitForSelector('[title="Explorar Catálogo"]');
      await page.click('[title="Explorar Catálogo"]');
      await page.waitForSelector('[title="Todas as obras com ao menos 1 ep"]');
      await page.click('[title="Todas as obras com ao menos 1 ep"]');
      await page.waitForSelector('[aria-label^="Abrir "]');
      for(let index=0;index<30 && !(await page.$('[aria-label="Abrir Late runtime fixture"]'));index++) {
        const next=await page.$('[aria-label="Próxima página do catálogo"]');
        assert.ok(next,'catalog pagination available');
        assert.equal(await next.evaluate(button=>button.disabled),false,'migrated record must be reachable through pagination');
        await next.click();
        await page.waitForFunction(()=>document.querySelector('[aria-label^="Abrir "]')!==null);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      await page.waitForSelector('[aria-label="Abrir Late runtime fixture"]');
      await page.focus('[aria-label="Abrir Late runtime fixture"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[title="Fechar Modal"]');
      await page.waitForFunction(()=>document.body.innerText.includes('Não informado'));
      await page.waitForFunction(()=>document.body.innerText.includes('Descrição canônica da obra de teste.'));
      const black=JSON.parse(fs.readFileSync('src/lib/builtinBlackTheme.json','utf8'));
      const tokenProperties={
        'background.base':'--color-bg-base','surface.base':'--color-surface-graphite','surface.raised':'--color-surface-charcoal','border.default':'--color-border-warm',
        'text.primary':'--color-text-ivory','text.secondary':'--color-text-beige','action.primary':'--color-gold','action.active':'--color-amber',
        'state.primary':'--color-primary','state.error':'--color-secondary','state.success':'--color-accent','state.warning':'--color-highlight','state.disabled':'--color-disabled',
      };
      const computed=await page.evaluate(properties=>Object.fromEntries(Object.entries(properties).map(([key,property])=>[key,getComputedStyle(document.documentElement).getPropertyValue(property).trim()])),tokenProperties);
      assert.deepEqual(computed,black.tokens,'actual browser theme matches canonical packaged token contract');
      const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,titleVisible:document.body.innerText.includes('Late runtime fixture')}));
      const header=await page.evaluate(()=>{
        const root=document.querySelector('[title="Fechar Modal"]').parentElement;
        return Array.from(root.querySelectorAll('button')).filter(button=>button.getClientRects().length).map(button=>{
          const rect=button.getBoundingClientRect();
          return {label:button.getAttribute('aria-label')||button.title,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
        });
      });
      for(let index=0;index<header.length;index++) {
        const rect=header[index];
        assert.ok(rect.left>=0&&rect.right<=viewport.width&&rect.top>=0&&rect.bottom<=viewport.height,`header control within viewport: ${rect.label}`);
        for(const other of header.slice(index+1))assert.ok(rect.right<=other.left||other.right<=rect.left||rect.bottom<=other.top||other.bottom<=rect.top,'header controls do not overlap');
      }
      layout.header=header;
      observations.push(layout);
      assert.ok(layout.titleVisible,'migrated catalog title renders in actual UI');
      fs.mkdirSync('.agent-runtime/planning/data-browser',{recursive:true});
      await page.screenshot({path:`.agent-runtime/planning/data-browser/catalog-modal-${viewport.width}.png`});
      await page.click('[title="Fechar Modal"]');
    }
    fs.writeFileSync('.agent-runtime/planning/data-browser/observations.json',JSON.stringify({mode:'real Edge + built Next + fixture PostgreSQL; remote requests blocked',observations,errors},null,2));
    await browser.defaultBrowserContext().setCookie({name:'__Host-anirium_web_session',value:account.cookieValue,domain:new URL(origin).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Lax'});
    await page.setViewport({width:1440,height:900});
    async function openAccountEpisodes() {
      await page.goto(origin,{waitUntil:'networkidle2'});
      const authenticated=await page.evaluate(async()=>{const data=await (await fetch('/api/user')).json();return data.user?.id;});
      assert.equal(authenticated,'runtime-owner','browser uses native fixture session');
      await page.click('[title="Explorar Catálogo"]');
      await page.click('[title="Todas as obras com ao menos 1 ep"]');
      await page.waitForSelector('[aria-label^="Abrir "]');
      for(let index=0;index<30 && !(await page.$('[aria-label="Abrir Runtime fixture"]'));index++) {
        const next=await page.$('[aria-label="Próxima página do catálogo"]');
        assert.equal(await next.evaluate(button=>button.disabled),false);
        await next.click();await new Promise(resolve=>setTimeout(resolve,100));
      }
      await page.click('[aria-label="Abrir Runtime fixture"]');
      await page.waitForSelector('[title="Lista de episódios e produções"]');
      await page.click('[title="Lista de episódios e produções"]');
    }
    await openAccountEpisodes();
    await page.waitForSelector('[title="Favoritar este episódio"]');
    const write=page.waitForResponse(response=>response.url()===origin+'/api/user'&&response.request().method()==='POST'&&JSON.parse(response.request().postData()||'{}').action==='toggle_bookmark');
    await page.click('[title="Favoritar este episódio"]');
    const saved=await write;
    assert.equal(saved.status(),200);
    assert.equal(JSON.parse(saved.request().postData()).seasonEntityId,account.seasonEntityId,'UI sends stable selected release');
    assert.equal(JSON.parse(saved.request().postData()).entityId,undefined,'UI does not send the old coordinate identity');
    await page.waitForSelector('[title="Remover episódio dos favoritos"]');
    const own=await account.own();
    assert.equal(own.bookmarkItems.length,1);
    assert.equal(own.bookmarkItems[0].seasonEntityId,account.seasonEntityId);
    assert.equal((await account.other()).bookmarkItems.length,0,'UI write remains private to fixture account');
    await openAccountEpisodes();
    await page.waitForSelector('[title="Remover episódio dos favoritos"]');
    await page.screenshot({path:'.agent-runtime/planning/data-browser/account-favorite.png'});
    await page.click('[title="Remover episódio dos favoritos"]');
    await page.waitForSelector('[title="Favoritar este episódio"]');
    assert.equal((await account.own()).bookmarkItems.length,0,'UI removal survives canonical alias reconciliation');
    await page.click('[title="Visão Geral da Obra"]');
    await page.waitForSelector('[title="Salvar nos favoritos"]');
    const workWrite=page.waitForResponse(response=>response.url()===origin+'/api/user'&&response.request().method()==='POST'&&JSON.parse(response.request().postData()||'{}').entityType==='SERIES');
    void workWrite.catch(()=>{});
    await page.click('[title="Salvar nos favoritos"]');
    const workSaved=await workWrite;
    assert.equal(workSaved.status(),200);
    const workRequest=JSON.parse(workSaved.request().postData());
    assert.equal(workRequest.entityId,account.workEntityId,'work button sends stable canonical UUID');
    assert.equal(workRequest.animeId,undefined,'work button omits obsolete numeric identity');
    await page.waitForSelector('[title="Remover dos favoritos"]');
    assert.ok((await account.own()).bookmarks.includes(920001));
    assert.equal((await account.other()).bookmarks.includes(920001),false);
    await openAccountEpisodes();
    await page.click('[title="Visão Geral da Obra"]');
    await page.waitForSelector('[title="Remover dos favoritos"]');
    const workRemove=page.waitForResponse(response=>response.url()===origin+'/api/user'&&response.request().method()==='POST'&&JSON.parse(response.request().postData()||'{}').entityType==='SERIES');
    void workRemove.catch(()=>{});
    await page.click('[title="Remover dos favoritos"]');
    assert.equal((await workRemove).status(),200);
    await page.waitForSelector('[title="Salvar nos favoritos"]');
    assert.equal((await account.own()).bookmarks.includes(920001),false,'work removal persists in canonical navigation');
    assert.deepEqual(errors,[],'real catalog hydration has no page errors');
    console.log('Real Edge UI: migrated catalog loads through live local APIs; keyboard opens detail with unknown status preserved at desktop/mobile sizes. Screenshots and viewport observations recorded.');
    console.log('Real authenticated Edge UI: episode favorite sends stable reordered season ID, persists after reload, remains private across accounts and removes without resurrection.');
    console.log('Real authenticated Edge UI: work favorite sends canonical UUID, persists after reload, remains account scoped and removes from indexed navigation.');
    console.log('Presentation: canonical localized description renders and all 13 packaged black theme tokens match computed browser CSS.');
  } catch(error) {
    fs.mkdirSync('.agent-runtime/planning/data-browser',{recursive:true});
    if(page){await page.screenshot({path:'.agent-runtime/planning/data-browser/failure.png'});fs.writeFileSync('.agent-runtime/planning/data-browser/failure.json',JSON.stringify({errors,responses,text:await page.evaluate(()=>document.body.innerText)},null,2));}
    throw error;
  } finally {await browser.close();}
}
