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

// Opciones de Puppeteer para el entorno sin pantalla de GitHub Actions
const puppeteerOptions = {
    headless: "new", // <-- ÚNICO CAMBIO: Lo volvemos a poner en modo "headless"
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,720', // Mantenemos el tamaño de ventana simulado
        '--disable-notifications'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
};

async function resolveM3u8(iframeUrl) {
    let browser = null;
    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        
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

        await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        try {
            await page.waitForSelector('body', { timeout: 5000 });
            await page.mouse.click(640, 360, { delay: 100 });
        } catch (e) {
            // No hacemos nada si falla, puede ser normal
        }
        
        await Promise.race([m3u8Promise, new Promise(r => setTimeout(r, 25000))]);
        return m3u8Url;
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
                try {
                    const m3u8Url = await resolveM3u8(server.iframeUrl);
                    if (m3u8Url) {
                        process.stdout.write("ÉXITO ✅\n");
                        liveDb[movieId].servers.push({ ...server, m3u8Url, lastChecked: new Date().toISOString() });
                    } else {
                        process.stdout.write("FALLO ❌\n");
                    }
                } catch (e) {
                    process.stdout.write(`ERROR ❗\n`);
                }
            }
        }

        await fs.writeJson(LIVE_DB_PATH, liveDb, { spaces: 2 });
        console.log(`\n[UPDATER] 'live_database.json' actualizado.`);

    } catch (error) {
        console.error(`\n[UPDATER] Error fatal:`, error);
    }
}

updateLiveDatabase();