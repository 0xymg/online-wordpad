/* eslint-disable @typescript-eslint/no-require-imports */
/** Optional upstream processor fixtures: paths and SHA pins are in runtime proof.
 * Set CSL_TEST_FIXTURE_DIR to a local checkout's processor-tests/machines folder.
 * These historical style regressions supplement current official APA7/IEEE tests;
 * they do not assert that the old upstream APA fixture is APA 7. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),CSL=require('citeproc'),assets=require('../lib/bibliography-assets/data.json');
const directory=process.env.CSL_TEST_FIXTURE_DIR;
if(!directory){console.log('SKIP optional upstream CSL fixtures; set CSL_TEST_FIXTURE_DIR');process.exit(0);}
const fixtures=['fullstyles_APA','bugreports_IeeePunctuation'],results=[];
for(const name of fixtures){const bytes=fs.readFileSync(path.join(directory,name+'.json')),fixture=JSON.parse(bytes),items=Object.fromEntries(fixture.input.map(item=>[item.id,item]));const engine=new CSL.Engine({retrieveLocale:()=>assets['locales-en-US.xml'],retrieveItem:id=>items[id]},fixture.csl,'en-US',true);engine.setOutputFormat('html');engine.updateItems(Object.keys(items));let actual;if(fixture.mode==='citation')actual=engine.processCitationCluster({citationID:'official-fixture',citationItems:fixture.input.map(item=>({id:item.id})),properties:{noteIndex:0}},[],[])[1][0][1];else{const bibliography=engine.makeBibliography();actual=bibliography[0].bibstart+bibliography[1].join('')+bibliography[0].bibend;}assert.equal(actual,fixture.result,name+' exact upstream expected output');results.push({name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source:`https://raw.githubusercontent.com/citation-style-language/test-suite/6eefc5b07c6969ab8999e48542acbcc131cba864/processor-tests/machines/${name}.json`,passed:true});}
console.log(JSON.stringify({upstreamCommit:'6eefc5b07c6969ab8999e48542acbcc131cba864',runtime:'citeproc@2.4.63',fixtures:results},null,2));
