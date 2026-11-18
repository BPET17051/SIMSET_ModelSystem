import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

function parseArgs(argv) {
    const args = {};
    for (const raw of argv) {
        if (!raw.startsWith("--")) continue;
        const [key, value = ""] = raw.slice(2).split("=");
        args[key] = value;
    }
    return args;
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function findMojibake(text) {
  const patterns = [/\u00E0\u00B8/g, /\u00E0\u00B9/g, /\u00E2/g, /\u00F0\u0178/g, /\uFFFD/g];
    return patterns
        .map((pattern) => ({ pattern: pattern.source, count: (text.match(pattern) || []).length }))
        .filter((item) => item.count > 0);
}

async function fetchWithTrace(startUrl) {
    const hops = [];
    let url = startUrl;

    for (let i = 0; i < 10; i += 1) {
        const res = await fetch(url, {
            redirect: "manual",
            headers: {
                "cache-control": "no-cache",
                pragma: "no-cache",
            },
        });

        const location = res.headers.get("location");
        hops.push({
            url,
            status: res.status,
            contentType: res.headers.get("content-type"),
            cacheControl: res.headers.get("cache-control"),
            etag: res.headers.get("etag"),
            cfCacheStatus: res.headers.get("cf-cache-status"),
            location,
        });

        if (location && res.status >= 300 && res.status < 400) {
            url = new URL(location, url).toString();
            continue;
        }

        const body = await res.text();
        return { finalUrl: url, body, headers: res.headers, hops };
    }

    throw new Error(`Too many redirects starting from ${startUrl}`);
}

function extractBorrowScript(html, finalUrl) {
    const match = html.match(/<script[^>]+src="([^"]*borrow\.js[^"]*)"/i);
    if (!match) return null;
    return new URL(match[1], finalUrl).toString();
}

function printSection(title) {
    console.log(`\n## ${title}`);
}

const args = parseArgs(process.argv.slice(2));
const site = (args.site || "https://simset-modelsystem.pages.dev").replace(/\/+$/, "");
const borrowPath = args.path || "/borrow.html";
const localHtmlPath = resolvePath(args.localHtml || "website/borrow.html");
const localJsPath = resolvePath(args.localJs || "website/borrow.js");

printSection("Target");
console.log(`site: ${site}`);
console.log(`path: ${borrowPath}`);

let htmlResult;
try {
    htmlResult = await fetchWithTrace(`${site}${borrowPath}`);
} catch (error) {
    console.error(`fetch failed: ${error.message}`);
    process.exit(1);
}

printSection("HTML Response");
for (const hop of htmlResult.hops) {
    console.log(JSON.stringify(hop, null, 2));
}

const localHtml = await readFile(localHtmlPath, "utf8");
const htmlMojibake = findMojibake(htmlResult.body);
console.log(`final url: ${htmlResult.finalUrl}`);
console.log(`remote html sha256: ${sha256(htmlResult.body)}`);
console.log(`local  html sha256: ${sha256(localHtml)}`);
console.log(`remote html mojibake matches: ${htmlMojibake.length ? JSON.stringify(htmlMojibake) : "none"}`);

const htmlMarkers = [
    "วันที่รับของ",
    "วันที่ส่งคืน",
    "เลือกวันยืม-คืน",
    "รายการอุปกรณ์ทางการแพทย์",
];
for (const marker of htmlMarkers) {
    console.log(`html marker "${marker}": ${htmlResult.body.includes(marker) ? "present" : "missing"}`);
}

const remoteJsUrl = extractBorrowScript(htmlResult.body, htmlResult.finalUrl);
printSection("JS Reference");
if (!remoteJsUrl) {
    console.log("borrow.js reference not found in remote HTML");
    process.exit(2);
}
console.log(`remote borrow.js url: ${remoteJsUrl}`);

let jsResult;
try {
    jsResult = await fetchWithTrace(remoteJsUrl);
} catch (error) {
    console.error(`fetch js failed: ${error.message}`);
    process.exit(1);
}

printSection("JS Response");
for (const hop of jsResult.hops) {
    console.log(JSON.stringify(hop, null, 2));
}

const localJs = await readFile(localJsPath, "utf8");
const jsMojibake = findMojibake(jsResult.body);
console.log(`final url: ${jsResult.finalUrl}`);
console.log(`remote js sha256: ${sha256(jsResult.body)}`);
console.log(`local  js sha256: ${sha256(localJs)}`);
console.log(`remote js mojibake matches: ${jsMojibake.length ? JSON.stringify(jsMojibake) : "none"}`);

const jsMarkers = [
    "ช่วงเวลา:",
    "เลือกช่วงยืมเรียบร้อย",
    "กำลังใช้งาน...",
    "เลือกวันยืม-คืน",
];
for (const marker of jsMarkers) {
    console.log(`js marker "${marker}": ${jsResult.body.includes(marker) ? "present" : "missing"}`);
}

printSection("Interpretation");
if (htmlMojibake.length || jsMojibake.length) {
    console.log("production response still contains mojibake-like byte patterns");
} else {
    console.log("production response body looks UTF-8 clean");
}

if (sha256(jsResult.body) !== sha256(localJs)) {
    console.log("remote borrow.js differs from local workspace file");
} else {
    console.log("remote borrow.js matches local workspace file byte-for-byte");
}
