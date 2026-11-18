const DATA_BASE = './data';

async function loadJson(filename) {
    const response = await fetch(`${DATA_BASE}/${filename}`);
    if (!response.ok) {
        throw new Error(`Failed to load ${filename}: HTTP ${response.status}`);
    }
    return response.json();
}

function updateStats(manikins) {
    document.getElementById('stat-total').textContent = manikins.length;
    document.getElementById('stat-ready').textContent = manikins.filter((item) => item.status === 'ready').length;
    document.getElementById('stat-models').textContent = new Set(manikins.map((item) => item.asset_name)).size;
    document.getElementById('stat-locations').textContent = new Set(
        manikins.filter((item) => item.location_id).map((item) => item.location_id)
    ).size;
}

function updateLastUpdated(meta) {
    const target = document.getElementById('last-updated');
    if (!target) return;

    if (!meta?.last_updated) {
        target.textContent = 'ข้อมูลล่าสุด ณ ตอนนี้';
        return;
    }

    const timestamp = new Date(meta.last_updated);
    if (Number.isNaN(timestamp.getTime())) {
        target.textContent = 'ข้อมูลล่าสุด ณ ตอนนี้';
        return;
    }

    target.textContent = `ข้อมูล ณ ${timestamp.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
}

async function reloadHome() {
    try {
        const [manikins, meta] = await Promise.allSettled([
            loadJson('manikins.json'),
            loadJson('meta.json'),
        ]);

        if (manikins.status === 'fulfilled') {
            updateStats(manikins.value);
        }

        if (meta.status === 'fulfilled') {
            updateLastUpdated(meta.value);
        } else {
            updateLastUpdated(null);
        }
    } catch (error) {
        console.error('Home load error:', error);
        updateLastUpdated(null);
    }
}

window.addEventListener('scroll', () => {
    const nav = document.getElementById('nav');
    if (nav) {
        nav.classList.toggle('scrolled', window.scrollY > 60);
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        reloadHome();
    }
});

reloadHome();
