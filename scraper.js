import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURACIÓN ---
const TARGET_IDS = [
    '823464', // Godzilla x Kong
    '507089'  // Five Nights at Freddy's
];
const ALLOWED_SERVERS = ['streamwish', 'filemoon', 'vidhide'];
// --------------------

const CUEVANA_BASE_URL = 'https://www.cuevana.is';
// ¡IMPORTANTE! El scraper ahora guarda el database.json dentro de la carpeta 'public'
const DATABASE_PATH = path.join(__dirname, 'public', 'database.json');
const TMDB_API_KEY = '44a281a88c65bfa293fccc36ef45ebdd';

async function runScraper() {
    console.log(`[SCRAPER] --- INICIANDO BÚSQUEDA DE IFRAMES (Servidores: ${ALLOWED_SERVERS.join(', ')}) ---`);
    await fs.ensureDir(path.join(__dirname, 'public')); // Asegura que la carpeta public exista
    const browser = await puppeteer.launch({ headless: "new" });
    const db = {}; // Empezamos con una base de datos limpia cada vez

    for (const tmdbId of TARGET_IDS) {
        console.log(`\n[SCRAPER] Procesando película: ${tmdbId}`);
        try {
            await scrapeMovie(browser, tmdbId, db);
        } catch (error) {
            console.error(`[SCRAPER] Error en ${tmdbId}: ${error.message}`);
        }
    }
    await browser.close();
    await fs.writeJson(DATABASE_PATH, db, { spaces: 2 });
    console.log("\n[SCRAPER] --- SCRAPING FINALIZADO. 'public/database.json' ha sido creado/actualizado. ---");
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
            if (videoList) {
                videoList.forEach(v => {
                    const serverName = v.cyberlocker.toLowerCase();
                    if (ALLOWED_SERVERS.includes(serverName)) {
                        allServers.push({ language, serverName: serverName, iframeUrl: v.result });
                    }
                });
            }
        };
        processVideos(nextData.props.pageProps.thisMovie.videos.latino, 'Latino');
        processVideos(nextData.props.pageProps.thisMovie.videos.spanish, 'Español');
        processVideos(nextData.props.pageProps.thisMovie.videos.english, 'Subtitulado');

        if (allServers.length > 0) {
            db[tmdbId] = { 
                title: movieDetails.title, 
                releaseDate: movieDetails.releaseDate, 
                servers: allServers
            };
            console.log(`[SCRAPER] ${allServers.length} iframes filtrados y guardados para "${movieDetails.title}".`);
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