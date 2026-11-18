(() => {
    function loadPartial(path) {
        const request = new XMLHttpRequest();
        request.open('GET', path, false);
        request.send();

        if (request.status >= 200 && request.status < 300) {
            return request.responseText;
        }

        throw new Error(`Failed to load partial: ${path} (${request.status})`);
    }

    const mounts = document.querySelectorAll('[data-partial]');
    mounts.forEach((mount) => {
        const key = mount.getAttribute('data-partial');
        if (!key) return;

        try {
            mount.outerHTML = loadPartial(`partials/${key}.html`);
        } catch (error) {
            console.error(error);
        }
    });
})();
