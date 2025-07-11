import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DB_PATH = path.join(__dirname, 'database.json');
const LIVE_DB_PATH = path.join(__dirname, 'live_database.json');

// --- LECTURA DE SECRETS ---
const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

async function resolveM3u8(iframeUrl) {
    if (!PROXY_HOST || !PROXY_USERNAME || !PROXY_PASSWORD || !PROXY_PORT) {
        console.log("  -> Faltan credenciales de proxy. Saltando resolución de este servidor.");
        return null;
    }
    const proxyServer = `http://${PROXY_HOST}:${PROXY_PORT}`;
    
    const puppeteerOptions = {
        args: [
            ...chromium.args,
            `--proxy-server=${proxyServer}`
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
    };

    let browser = null;
    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();

        // Autenticación del proxy
        await page.authenticate({
            username: PROXY_USERNAME,
            password: PROXY_PASSWORD,
        });
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        let m3u8Url = null;
        const m3u8Promise = new Promise(resolve => {
            page.on('response', response => {
                const url = response.url();
                if (url.includes('.m3u8') && !m3u8Url) {
                    m3u8Url = url;
                    resolve(url);
                }
            });
        });

        await page.goto(iframeUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await Promise.race([m3u8Promise, new Promise(r => setTimeout(r, 20000))]);
        return m3u8Url;

    } catch (error) {
        console.error(`\n    Error en Puppeteer con proxy: ${error.message.split('\n')[0]}`);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

async function updateLiveDatabase() {
    console.log(`[UPDATER] Iniciando ciclo de actualización.`);
    try {
        const baseDb = await fs.readJson(BASE_DB_PATH);
        const liveDb = {};

        for (const movieId in baseDb) {
            const movie = baseDb[movieId];
            console.log(`\n[UPDATER] Procesando: ${movie.title}`);
            liveDb[movieId] = { ...movie, servers: [] };

            for (const server of movie.servers) {
                process.stdout.write(`  -> Resolviendo: ${server.serverName}... `);
                const m3u8Url = await resolveM3u8(server.iframeUrl);
                if (m3u8Url) {
                    process.stdout.write("ÉXITO ✅\n");
                    liveDb[movieId].servers.push({ ...server, m3u8Url, lastChecked: new Date().toISOString() });
                } else {
                    process.stdout.write("FALLO ❌\n");
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