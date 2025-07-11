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

const puppeteerOptions = {
    headless: false, // <-- CAMBIO 1: Lo ponemos en false para VER qué está pasando
    args: ['--window-size=1280,720', '--disable-notifications'],
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
                        console.log(`\n  [INTERCEPTADO] -> ${url.substring(0, 100)}...`);
                        resolve(url);
                    }
                }
            });
        });

        // CAMBIO 2: Aumentamos el timeout general de navegación
        await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // CAMBIO 3: Simulación de interacción más humana
        try {
            // Esperamos a que cualquier posible overlay o botón de play sea visible
            await page.waitForSelector('body', { timeout: 5000 });
            console.log("  -> Cuerpo de la página cargado. Intentando clic.");
            // Hacemos clic en el centro de la página para activar el reproductor
            await page.mouse.click(640, 360, { delay: 100 });
        } catch (e) {
            console.log("  -> No se pudo hacer clic o el elemento no apareció a tiempo (puede ser normal).");
        }
        
        // CAMBIO 4: Aumentamos el tiempo de espera para la intercepción
        console.log("  -> Esperando a que la red cargue el M3U8...");
        await Promise.race([m3u8Promise, new Promise(r => setTimeout(r, 25000))]);
        
        return m3u8Url;
    } finally {
        // CAMBIO 5: Espera antes de cerrar para que puedas ver el resultado
        if (browser) {
            await new Promise(r => setTimeout(r, 3000)); // Pausa de 3 segundos
            await browser.close();
        }
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
                console.log(`  -> Resolviendo: ${server.serverName}...`);
                try {
                    const m3u8Url = await resolveM3u8(server.iframeUrl);
                    if (m3u8Url) {
                        console.log("    [ÉXITO] M3U8 encontrado y guardado. ✅");
                        liveDb[movieId].servers.push({ ...server, m3u8Url, lastChecked: new Date().toISOString() });
                    } else {
                        console.log("    [FALLO] No se encontró M3U8 para este servidor. ❌");
                    }
                } catch (e) {
                    console.error(`    [ERROR] Fallo crítico al resolver: ${e.message} ❗`);
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