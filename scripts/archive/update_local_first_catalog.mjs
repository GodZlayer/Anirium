import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

const targetFunc = `        async function initLocalFirstCatalog() {
            try {
                const db = await openCatalogDB();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const countReq = store.count();

                countReq.onsuccess = () => {
                    const localCount = countReq.result;
                    if (localCount > 0) {
                        const allReq = store.getAll();
                        allReq.onsuccess = () => {
                            if (allReq.result && allReq.result.length > 0) {
                                window.clientCatalog = allReq.result;
                                const countLabel = document.getElementById('client-explore-count');
                                if (countLabel) countLabel.innerText = allReq.result.length;
                                if (window.currentTab === 'explore') {
                                    window.runClientSideCatalogFilter();
                                }
                            }
                        };
                    } else if (Array.isArray(window.clientCatalog) && window.clientCatalog.length > 0) {
                        const writeTx = db.transaction(STORE_NAME, 'readwrite');
                        const writeStore = writeTx.objectStore(STORE_NAME);
                        window.clientCatalog.forEach(item => writeStore.put(item));
                    }
                };
            } catch (err) {
                console.warn('[Anirium Engine] IndexedDB local:', err);
            }
        }`;

const replacementFunc = `        async function initLocalFirstCatalog() {
            try {
                const db = await openCatalogDB();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const countReq = store.count();

                countReq.onsuccess = () => {
                    const localCount = countReq.result;
                    if (localCount >= 50000) {
                        const allReq = store.getAll();
                        allReq.onsuccess = () => {
                            if (allReq.result && allReq.result.length > 0) {
                                window.clientCatalog = allReq.result;
                                if (window.currentTab === 'explore') {
                                    window.runClientSideCatalogFilter();
                                }
                            }
                        };
                    } else {
                        // Sincroniza em background o catálogo consolidado multi-entidade
                        setTimeout(async () => {
                            try {
                                const res = await fetch('/data/catalog_clean.json');
                                if (res.ok) {
                                    const fullCatalog = await res.json();
                                    if (Array.isArray(fullCatalog) && fullCatalog.length > 0) {
                                        window.clientCatalog = fullCatalog;
                                        const wTx = db.transaction(STORE_NAME, 'readwrite');
                                        const wStore = wTx.objectStore(STORE_NAME);
                                        fullCatalog.forEach(it => wStore.put(it));
                                        if (window.currentTab === 'explore') {
                                            window.runClientSideCatalogFilter();
                                        }
                                        console.log('[Anirium Catalog] Local-first catalog sincronizado com', fullCatalog.length, 'entidades');
                                    }
                                }
                            } catch (e) {
                                console.warn('[Anirium Catalog] Fallback background fetch:', e);
                            }
                        }, 500);
                    }
                };
            } catch (err) {
                console.warn('[Anirium Engine] IndexedDB local:', err);
            }
        }`;

if (content.includes('async function initLocalFirstCatalog()')) {
    content = content.replace(targetFunc, replacementFunc);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('initLocalFirstCatalog updated successfully!');
} else {
    console.error('Target function not found!');
}
