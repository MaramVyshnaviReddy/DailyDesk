const fs = require("fs");

const NEWS = [
  ["world", "Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "BBC News"],
  ["world", "Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml", "BBC News"],
  ["world", "Science", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "BBC News"],
  ["world", "India", "https://www.thehindu.com/news/national/feeder/default.rss", "The Hindu"],
  ["sap", "SAP", "https://news.sap.com/feed/", "SAP News Center"]
];

const JOBS = [
  ["sapjobs", "SAC", "SAP analytics cloud"],
  ["sapjobs", "S/4HANA", "SAP S/4HANA"],
  ["sapjobs", "BW", "SAP BW"],
  ["sapjobs", "Fresher", "SAP fresher"],
  ["testjobs", "Selenium", "selenium automation tester"],
  ["testjobs", "Playwright", "playwright automation"],
  ["testjobs", "API testing", "api automation testing"],
  ["testjobs", "Fresher", "automation testing fresher"]
];

function clean(s) {
  return (s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#039;|&#8217;|&apos;/g, "’")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}
function tag(x, name) {
  const m = x.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">"));
  return m ? m[1] : "";
}
function safeUrl(u) { return /^https?:\/\//.test(u) ? u : ""; }

function sapCategory(title) {
  const t = title.toLowerCase();
  if (t.includes("analytics cloud") || t.includes("sac")) return "SAC";
  if (t.includes("s/4hana")) return "S/4HANA";
  if (t.includes("datasphere")) return "Datasphere";
  return "SAP News";
}

async function getNews() {
  const out = { world: [], sap: [] };
  for (const [group, cat, url, src] of NEWS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "DailyDeskBot/1.0" },
        signal: AbortSignal.timeout(20000)
      });
      const xml = await res.text();
      const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
      for (const it of items.slice(0, 8)) {
        const t = clean(tag(it, "title"));
        const link = safeUrl(clean(tag(it, "link")));
        if (!t || !link) continue;
        out[group].push({
          t,
          c: group === "sap" ? sapCategory(t) : cat,
          s: clean(tag(it, "description")).slice(0, 220),
          src,
          d: new Date(clean(tag(it, "pubDate"))).toISOString(),
          url: link
        });
      }
    } catch (e) {
      console.log("Feed failed:", url, e.message);
    }
  }
  return out;
}

async function getJobs() {
  const out = { sapjobs: [], testjobs: [] };
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) { console.log("No Adzuna keys, skipping jobs"); return out; }
  const seen = new Set();
  for (const [group, cat, q] of JOBS) {
    try {
      const url = "https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=" + id +
        "&app_key=" + key + "&results_per_page=10&sort_by=date&what=" + encodeURIComponent(q);
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const data = await res.json();
      for (const r of data.results || []) {
        const link = safeUrl(r.redirect_url);
        if (!link || seen.has(link)) continue;
        seen.add(link);
        out[group].push({
          t: clean(r.title),
          c: cat,
          co: clean(r.company && r.company.display_name) || "Company not listed",
          loc: clean(r.location && r.location.display_name) || "India",
          exp: "See listing",
          d: new Date(r.created).toISOString(),
          url: link
        });
      }
    } catch (e) {
      console.log("Jobs failed:", q, e.message);
    }
  }
  return out;
}

(async () => {
  const news = await getNews();
  const jobs = await getJobs();
  const all = Object.assign({ updated: new Date().toISOString() }, news, jobs);
  for (const k of ["world", "sap", "sapjobs", "testjobs"]) {
    all[k].sort((a, b) => new Date(b.d) - new Date(a.d));
    all[k] = all[k].slice(0, 40);
  }
  fs.writeFileSync("data.json", JSON.stringify(all, null, 1));
  console.log("Saved:", Object.keys(all).map(k => k + ":" + (all[k].length || "")).join(" "));
})();
