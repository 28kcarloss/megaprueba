import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DB_PATH = path.join(__dirname, 'database.json');
const LIVE_DB_PATH = path.join(__dirname, 'live_database.json');
const PROXIES_PATH = path.join(__dirname, 'proxies.json');

// Función para obtener un proxy aleatorio de la lista
function getRandomProxy(proxyList) {
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    return proxyList[randomIndex];
}

async function resolveM3u8(iframeUrl, proxy) {
    let browser = null;
    const puppeteerOptions = {
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--proxy-server=http://${proxy}` // Usamos el proxy para esta ejecución
        ],
    };
    
    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        
        let m3u8Url = null;
        const m3u8Promise = new Promise(resolve => {
            page.on('response', response => {
                const url = response.url();
                if (url.includes('.m3u8')) {
                    if (!m3u8Url) {
                        m3u8Url = url;
                        resolve(url);
                    }
                }
            });
        });

        await page.goto(iframeUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        await Promise.race([m3u8Promise, new Promise(r => setTimeout(r, 15000))]);
        return m3u8Url;
    } finally {
        if (browser) await browser.close();
    }
}

async function updateLiveDatabase() {
    console.log(`[UPDATER] Iniciando ciclo de actualización con proxies públicos.`);
    try {
        const baseDb = await fs.readJson(BASE_DB_PATH);
        const proxyList = await fs.readJson(PROXIES_PATH);
        if (!proxyList || proxyList.length === 0) {
            console.error("[UPDATER] La lista de proxies está vacía. Abortando.");
            return;
        }

        const liveDb = {};

        for (const movieId in baseDb) {
            const movie = baseDb[movieId];
            console.log(`\n[UPDATER] Procesando: ${movie.title}`);
            liveDb[movieId] = { ...movie, servers: [] };

            for (const server of movie.servers) {
                process.stdout.write(`  -> Resolviendo: ${server.serverName}... `);
                
                const proxy = getRandomProxy(proxyList);
                console.log(`(Usando proxy: ${proxy})`);
                
                try {
                    const m3u8Url = await resolveM3u8(server.iframeUrl, proxy);
                    if (m3u8Url) {
                        process.stdout.write("    ÉXITO ✅\n");
                        liveDb[movieId].servers.push({ ...server, m3u8Url, lastChecked: new Date().toISOString() });
                    } else {
                        process.stdout.write("    FALLO (Proxy o servidor no respondieron) ❌\n");
                    }
                } catch (e) {
                    process.stdout.write(`    ERROR (Proxy ${proxy} probablemente muerto) ❗\n`);
                }
            }
        }
        await fs.writeJson(LIVE_DB_PATH, liveDb, { spaces: 2 });
        console.log(`\n[UPDATER] 'live_database.json' actualizado.`);
    } catch (error) {
        console.error(`\n[UPDATER] Error fatal:`, error);
        throw error;
    }
}

updateLiveDatabase();