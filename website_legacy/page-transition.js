(() => {
    function syncNavOffset() {
        const nav = document.querySelector('.nav');
        if (!nav) return;

        const navHeight = Math.ceil(nav.getBoundingClientRect().height);
        if (navHeight > 0) {
            document.documentElement.style.setProperty('--nav-offset', `${navHeight}px`);
        }
    }

    // Create the Top Progress Bar
    const nprogress = document.createElement('div');
    nprogress.id = 'simset-nprogress';
    document.body.appendChild(nprogress);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const navFlag = window.sessionStorage.getItem('simset:navigating');
    let closed = false;

    // Remove legacy HTML loader if it slipped through the script logic
    const oldLoader = document.getElementById('global-page-loader');
    if (oldLoader) oldLoader.remove();

    if (navFlag) {
        nprogress.style.width = '100%';
        nprogress.style.opacity = '1';
    }

    window.sessionStorage.removeItem('simset:navigating');
    syncNavOffset();

    const nav = document.querySelector('.nav');
    if (nav && 'ResizeObserver' in window) {
        const navObserver = new ResizeObserver(() => syncNavOffset());
        navObserver.observe(nav);
    }

    window.addEventListener('resize', syncNavOffset);
    window.addEventListener('orientationchange', syncNavOffset);
    window.addEventListener('load', syncNavOffset, { once: true });

    function closeOverlay() {
        if (closed) return;
        closed = true;
        document.body.classList.add('page-ready');
        window.setTimeout(() => {
            nprogress.style.opacity = '0';
        }, reducedMotion ? 0 : 250);
    }

    function shouldIntercept(anchor) {
        if (!anchor) return false;
        if (anchor.target && anchor.target !== '_self') return false;
        if (anchor.hasAttribute('download') || anchor.dataset.noTransition !== undefined) return false;

        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
            return false;
        }

        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return false;
        if (url.href === window.location.href) return false;

        return true;
    }

    function navigateWithTransition(url) {
        if (closed) {
            window.location.href = url;
            return;
        }

        window.sessionStorage.setItem('simset:navigating', '1');
        document.body.classList.add('page-is-leaving');
        nprogress.style.opacity = '1';
        nprogress.style.width = '65%';

        window.setTimeout(() => {
            nprogress.style.width = '85%';
            window.location.href = url;
        }, reducedMotion ? 0 : 220);
    }

    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const anchor = event.target.closest('a[href]');
        if (!shouldIntercept(anchor)) return;

        event.preventDefault();
        navigateWithTransition(anchor.href);
    });

    window.addEventListener('pageshow', () => {
        // Handle browser back button caching
        if (closed) {
            nprogress.style.opacity = '0';
            nprogress.style.width = '0%';
            document.body.classList.remove('page-is-leaving');
            document.body.classList.add('page-ready');
        } else {
            closeOverlay();
        }
    });

    window.addEventListener('load', () => {
        window.setTimeout(closeOverlay, navFlag ? 150 : 300);
    }, { once: true });

    // Fallback closure
    window.setTimeout(closeOverlay, 1500);
})();
