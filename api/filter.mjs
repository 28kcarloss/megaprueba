import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

const puppeteerOptions = {
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url: iframeUrl } = req.query;
    if (!iframeUrl) {
        return res.status(400).send('<h1>Error: Falta el parámetro ?url=</h1>');
    }

    let browser = null;
    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();

        // --- OPTIMIZACIÓN CLAVE ---
        // Bloqueamos todos los recursos innecesarios para ahorrar memoria y tiempo
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'script'].includes(request.resourceType())) {
                // Abortamos todo excepto los scripts que podrían ser del reproductor.
                // Es una suposición, pero a menudo los scripts de reproductores no tienen extensiones obvias.
                if (request.resourceType() === 'script' && !request.url().includes('player')) {
                    request.abort();
                } else {
                    request.continue();
                }
            } else {
                request.continue();
            }
        });
        // -------------------------

        await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Inyectamos CSS para ocultar anuncios y maximizar el video
        await page.addStyleTag({
            content: `
                body, html { overflow: hidden !important; margin: 0; padding: 0; background-color: #000; }
                iframe, .ad, [id*="ad"], [class*="ad"] { display: none !important; }
                #player, video, .video-container, .player-container {
                    position: fixed !important; top: 0; left: 0; width: 100% !important; height: 100% !important; z-index: 9999;
                }
            `
        });

        const cleanHtml = await page.content();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(cleanHtml);

    } catch (error) {
        console.error(`[Filtro] Crash en la función: ${error.message}`);
        res.setHeader('Location', iframeUrl);
        return res.status(302).end();
    } finally {
        if (browser) await browser.close();
    }
}