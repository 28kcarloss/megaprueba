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
        return res.status(400).send('<h1>Error: Falta el parámetro ?url= en la petición.</h1>');
    }

    let browser = null;
    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

        await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = `
                /* Ocultar capas de anuncios, pop-ups y cualquier cosa que no sea el video */
                body > *:not(video):not(#player):not(.player) {
                    display: none !important;
                    visibility: hidden !important;
                }
                iframe[src*="ad"], div[class*="ads"], div[id*="ads"] {
                    display: none !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
                /* Forzar el reproductor a ocupar toda la pantalla */
                body, html {
                    overflow: hidden !important;
                    margin: 0;
                    padding: 0;
                    background-color: #000;
                }
                #player, .player, .video-js, .jwplayer, video, #video-container {
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 99999;
                }
            `;
            document.head.appendChild(style);
        });

        const cleanHtml = await page.content();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(cleanHtml);

    } catch (error) {
        console.error(`[Filtro] Error: ${error.message}`);
        // Si falla, redirigimos al iframe original como último recurso
        res.setHeader('Location', iframeUrl);
        return res.status(302).end();
    } finally {
        if (browser) await browser.close();
    }
}