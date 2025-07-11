import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

puppeteer.use(StealthPlugin());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURACIÓN: AÑADE AQUÍ LOS IDs DE LAS PELÍCULAS QUE QUIERES ---
const TARGET_IDS = [
    '823464', // Godzilla x Kong
    '507089'  // Five Nights at Freddy's
];
// ---------------------------------------------------------------------

const CUEVANA_BASE_URL = 'https://www.cuevana.is';
const DATABASE_PATH = path.join(__dirname, 'database.json');
const TMDB_API_KEY = '44a281a88c65bfa293fccc36ef45ebdd';

async function runScraper() {
    console.log(`[SCRAPER] --- INICIANDO BÚSQUEDA DE IFRAMES PARA ${TARGET_IDS.length} PELÍCULAS ---`);
    const browser = await puppeteer.launch({ headless: "new" });
    const existingDb = await fs.readJson(DATABASE_PATH).catch(() => ({}));

    for (const tmdbId of TARGET_IDS) {
        console.log(`\n[SCRAPER] Procesando película: ${tmdbId}`);
        try {
            await scrapeMovie(browser, tmdbId, existingDb);
        } catch (error) {
            console.error(`[SCRAPER] Error en ${tmdbId}: ${error.message}`);
        }
    }
    await browser.close();
    await fs.writeJson(DATABASE_PATH, existingDb, { spaces: 2 });
    console.log("\n[SCRAPER] --- SCRAPING FINALIZADO. 'database.json' actualizado. ---");
}

async function scrapeMovie(browser, tmdbId, db) {
    const page = await browser.newPage();
    try {
        const movieDetails = await getMovieDetailsFromTmdb(tmdbId);
        if (!movieDetails) return;
        
        const movieUrl = `${CUEVANA_BASE_URL}/pelicula/${tmdbId}/ver`;
        await page.goto(movieUrl, { waitUntil: 'networkidle2' });
        
        const nextData = await page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}'));
        if (!nextData?.props?.pageProps?.thisMovie) return;

        let allServers = [];
        const processVideos = (videoList, language) => {
            if (videoList) videoList.forEach(v => allServers.push({ language, serverName: v.cyberlocker.toLowerCase(), iframeUrl: v.result }));
        };
        processVideos(nextData.props.pageProps.thisMovie.videos.latino, 'Latino');
        processVideos(nextData.props.pageProps.thisMovie.videos.spanish, 'Español');
        processVideos(nextData.props.pageProps.thisMovie.videos.english, 'Subtitulado');

        if (allServers.length > 0) {
            db[tmdbId] = { 
                title: movieDetails.title, 
                releaseDate: movieDetails.releaseDate, 
                servers: allServers,
                lastScraped: new Date().toISOString()
            };
            console.log(`[SCRAPER] ${allServers.length} iframes guardados para "${movieDetails.title}".`);
        }
    } finally {
        await page.close();
    }
}

async function getMovieDetailsFromTmdb(tmdbId) {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
    try {
        const r = await fetch(url);
        const d = await r.json();
        return d.title ? { title: d.title, releaseDate: d.release_date } : null;
    } catch { return null; }
}

runScraper();