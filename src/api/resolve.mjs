import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium-min';

puppeteer.use(StealthPlugin());

// Configuración de Puppeteer para Vercel
const puppeteerOptions = {
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
};

export default async function handler(req, res) {
    // Configuración de CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar petición OPTIONS de pre-vuelo para CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url: iframeUrl } = req.query;

    if (!iframeUrl) {
        return res.status(400).json({ error: 'Falta el parámetro ?url en la petición.' });
    }

    console.log(`[API] Iniciando resolución para: ${iframeUrl}`);
    let browser = null;

    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        
        let m3u8Url = null;

        // Promesa para capturar la URL del m3u8
        const m3u8Promise = new Promise((resolve) => {
            page.on('response', (response) => {
                const url = response.url();
                if (url.includes('.m3u8') && !url.includes('google')) {
                    if (!m3u8Url) { // Capturar solo la primera coincidencia
                        m3u8Url = url;
                        resolve(url);
                    }
                }
            });
        });

        // Ir a la página y esperar a que la red esté inactiva
        await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 25000 });

        // Esperar a que la promesa del m3u8 se resuelva o se acabe el tiempo
        await Promise.race([m3u8Promise, new Promise(r => setTimeout(r, 10000))]);
        
        if (m3u8Url) {
            console.log(`[API] Éxito. M3U8 encontrado: ${m3u8Url}`);
            return res.status(200).json({ m3u8Url });
        } else {
            console.log('[API] Fallo: No se encontró m3u8 después de la espera.');
            return res.status(404).json({ error: 'No se pudo interceptar el m3u8 a tiempo.' });
        }

    } catch (error) {
        console.error(`[API] Error crítico durante la ejecución de Puppeteer: ${error.message}`);
        return res.status(500).json({ error: `Error del servidor: ${error.message}` });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}