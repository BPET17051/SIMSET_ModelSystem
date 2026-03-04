const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

    console.log('Navigating to https://simset-modelsystem.pages.dev/ ...');
    await page.goto('https://simset-modelsystem.pages.dev/');

    console.log('Navigating to borrow.html ...');
    await page.goto('https://simset-modelsystem.pages.dev/borrow.html');
    await page.waitForTimeout(3000);

    await browser.close();
})();
