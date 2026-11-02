/** Branding UI smoke test in an isolated browser. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),base=process.env.BASE_URL||'http://localhost:3107';
 await page.goto(base+'/pad'); await page.locator('.ProseMirror').waitFor();
 await page.getByRole('menuitem',{name:'Help',exact:true}).click(); await page.getByRole('menuitem',{name:'About EDTRDocs',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'About EDTRDocs',exact:true});await dialog.waitFor();
 assert.equal(await dialog.getByRole('link',{name:'hello@312.sh',exact:true}).getAttribute('href'),'mailto:hello@312.sh');
 for(const host of ['https://edtr.md','https://edtr.plus','https://312.sh'])assert.ok(await dialog.locator(`a[href="${host}"]`).count());
 assert.equal(await dialog.locator('a[href*="ymg.digital"]').count(),0);
 await page.screenshot({path:'/tmp/edtr-about-dialog.png'});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 // An invalid UI-only cookie passes the navigation proxy but authenticates no account.
 await page.context().addCookies([{name:'better-auth.session_token',value:'ui-test-not-a-session',url:base}]);
 await page.goto(base+'/welcome'); const welcome=page.locator('.welcome-screen');await welcome.waitFor();
 const footer=welcome.locator('footer');await footer.scrollIntoViewIfNeeded();
 assert.equal(await footer.getByRole('img',{name:'312',exact:true}).count(),1);
 assert.equal(await footer.locator('a').getAttribute('href'),'https://312.sh');
 await page.screenshot({path:'/tmp/edtr-welcome-footer.png'});
 console.log('PASS About dialog, contact email, related projects, 312 branding, Escape and welcome footer.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
