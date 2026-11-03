/** Inline in development HTML so a cached client bundle cannot prevent recovery. */
export const DEV_SERVICE_WORKER_RESET = String.raw`(async()=>{
  if(!('serviceWorker' in navigator))return;
  const ownWorker=worker=>{
    if(!worker)return false;
    try{const url=new URL(worker.scriptURL,location.href);return url.origin===location.origin&&url.pathname==='/sw.js';}catch{return false;}
  };
  const controlled=ownWorker(navigator.serviceWorker.controller);
  try{
    const registrations=await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(registration=>[registration.active,registration.waiting,registration.installing].some(ownWorker)).map(registration=>registration.unregister()));
    if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(key=>/^(edtrdocs|edtr|wordpad)-/.test(key)).map(key=>caches.delete(key)));}
    const marker='edtr-dev-sw-recovery-v1';
    if(!controlled){try{sessionStorage.removeItem(marker);}catch{}return;}
    try{if(sessionStorage.getItem(marker))return;sessionStorage.setItem(marker,'1');}catch{return;}
    console.info('Cleared the editor service worker for local development. Reloading.');
    location.reload();
  }catch(error){console.warn('Could not reset the editor development service worker.',error);}
})();`;
