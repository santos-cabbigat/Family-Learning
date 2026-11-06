export const APP_URL = 'https://santos-cabbigat.github.io/Family-Learning/';
export const REPOSITORY_URL = 'https://github.com/santos-cabbigat/Family-Learning';
export const ANDROID_VERSION = '0.1.2';
export function isOfficialWeb(url) {
  const current = new URL(url), official = new URL(APP_URL);
  return current.origin === official.origin && current.pathname.startsWith(official.pathname);
}
export function compareVersions(a, b) {
  if (![a,b].every(v => /^\d+\.\d+\.\d+$/.test(v))) throw new Error('The update response has an invalid version. Please try again later.');
  const av=a.split('.').map(Number), bv=b.split('.').map(Number);
  for(let i=0;i<3;i++) if(av[i]!==bv[i]) return Math.sign(av[i]-bv[i]);
  return 0;
}
export async function waitForInstall(worker, timeout = 45000) {
  if (!worker) return;
  return new Promise((resolve,reject) => {
    const finish=()=>{if(worker.state==='installed'||worker.state==='activated'){cleanup();resolve();}else if(worker.state==='redundant'){cleanup();reject(new Error('The update download failed. Your saved records are safe. Try again online.'));}};
    const timer=setTimeout(()=>{cleanup();reject(new Error('The update is still downloading. Check again shortly.'));},timeout);
    const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('statechange',finish);};
    worker.addEventListener('statechange',finish);finish();
  });
}
