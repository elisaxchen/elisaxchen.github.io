// postprocess.js
// This script scrapes movie schedules from three different theater websites,
// combines the data, and outputs a single JSON file.

import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// PARSER FOR BRATTLE THEATRE
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
function parseBrattle(doc) {
    const showings = {};
    const presentations = doc.querySelectorAll('div.presentation');

    for (const movieDiv of presentations) {
        const titleElement = movieDiv.querySelector('h2.movie-title a');
        if (!titleElement) continue;
        const title = titleElement.textContent.trim();

        const showtimesDiv = movieDiv.querySelector('div.showtimes');
        if (!showtimesDiv) continue;

        let currentDateStr = null;
        for (const element of showtimesDiv.querySelectorAll('h3, p')) {
            if (element.tagName === 'H3') {
                const rawDate = element.textContent.trim();
                const match = rawDate.match(/(\w+\s+\d+)/);
                if (match) {
                    const dateWithYear = `${match[1]}, ${new Date().getFullYear()}`;
                    currentDateStr = new Date(dateWithYear).toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' });
                }
            } else if (element.tagName === 'P' && currentDateStr) {
                const times = Array.from(element.querySelectorAll('a')).map(a => a.textContent.trim());
                if (!times.length) continue;
                if (!showings[currentDateStr]) showings[currentDateStr] = [];
                
                const existingMovie = showings[currentDateStr].find(m => m.title === title);
                if (existingMovie) {
                    existingMovie.times.push(...times);
                } else {
                    showings[currentDateStr].push({ title, times });
                }
            }
        }
    }
    return {
        theater: "Brattle Theatre",
        logo: "https://placehold.co/200x80/000000/FFFFFF?text=Brattle",
        showings
    };
}

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// PARSER FOR COOLIDGE CORNER THEATRE
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
function parseCoolidge(doc) {
    const showings = {};
    const filmsContainer = doc.querySelector('#films');
    if (!filmsContainer) return { theater: "Coolidge Corner Theatre", logo: "...", showings: {} };

    let currentDateStr = null;
    for (const element of filmsContainer.children) {
        if (element.matches('div.daily-marker')) {
            const rawDate = element.textContent.trim();
            const dateWithYear = `${rawDate}, ${new Date().getFullYear()}`;
            currentDateStr = new Date(dateWithYear).toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' });
        } else if (element.matches('div.film-card') && currentDateStr) {
            const title = element.querySelector('h3.film-card--title')?.textContent.trim();
            const times = Array.from(element.querySelectorAll('.film-card--showtimes a')).map(a => a.textContent.trim());
            
            if (title && times.length > 0) {
                if (!showings[currentDateStr]) showings[currentDateStr] = [];
                showings[currentDateStr].push({ title, times });
            }
        }
    }
    return {
        theater: "Coolidge Corner Theatre",
        logo: "https://placehold.co/200x80/c0392b/FFFFFF?text=Coolidge",
        showings
    };
}

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// PARSER FOR SOMERVILLE THEATRE
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
function parseSomerville(doc) {
    const showings = {};
    const movieCards = doc.querySelectorAll('.movie-card');

    for (const card of movieCards) {
        const title = card.querySelector('.card-header h2 a')?.textContent.trim();
        const dateEl = card.querySelector('.card-header .date');
        if (!title || !dateEl) continue;

        // The date is in a comment node, a bit tricky to get
        let rawDate = '';
        for(const node of dateEl.childNodes) {
            if (node.nodeType === 8) { // Node.COMMENT_NODE
                rawDate = node.textContent.trim();
                break;
            }
        }
        if (!rawDate) continue;

        const dateObj = new Date(rawDate);
        const currentDateStr = dateObj.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' });
        
        const times = Array.from(card.querySelectorAll('.showtimes-list a.showtime')).map(a => a.textContent.trim());

        if (times.length > 0) {
            if (!showings[currentDateStr]) showings[currentDateStr] = [];
            showings[currentDateStr].push({ title, times });
        }
    }
    return {
        theater: "Somerville Theatre",
        logo: "https://placehold.co/200x80/2980b9/FFFFFF?text=Somerville",
        showings
    };
}


// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// MAIN SCRIPT LOGIC
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
async function main() {
    const args = Deno.args;
    const outputFilename = args.pop();
    const inputFilenames = args;

    if (inputFilenames.length === 0 || !outputFilename) {
        console.error("Usage: deno run --allow-read --allow-write postprocess.js <input1.html> [input2.html...] <output.json>");
        Deno.exit(1);
    }

    const allScrapedData = [];

    for (const filename of inputFilenames) {
        console.log(`Processing ${filename}...`);
        const html = await Deno.readTextFile(filename);
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (!doc) {
            console.error(`Failed to parse ${filename}`);
            continue;
        }

        if (filename.includes('brattle')) {
            allScrapedData.push(parseBrattle(doc));
        } else if (filename.includes('coolidge')) {
            allScrapedData.push(parseCoolidge(doc));
        } else if (filename.includes('somerville')) {
            allScrapedData.push(parseSomerville(doc));
        }
    }

    // Combine all data into the final structure, grouped by day.
    const combinedSchedule = {};
    for (const data of allScrapedData) {
        for (const [date, movies] of Object.entries(data.showings)) {
            if (!combinedSchedule[date]) {
                combinedSchedule[date] = [];
            }
            combinedSchedule[date].push({
                theater: data.theater,
                logo: data.logo,
                movies: movies
            });
        }
    }

    console.log(`Writing combined schedule to ${outputFilename}...`);
    await Deno.writeTextFile(outputFilename, JSON.stringify(combinedSchedule, null, 2));
    console.log("All scraping complete.");
}

main();
