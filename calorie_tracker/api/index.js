// api/index.js
// Serverless endpoint for semantic food matching + macro scaling (Hugging Face embeddings)

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const csvParse = require("csv-parse/lib/sync");

const HF_TOKEN = process.env.HF_TOKEN; // set in deployment env
if (!HF_TOKEN && process.env.NODE_ENV !== "production") {
  console.warn("WARNING: HF_TOKEN not set - requests will fail without it.");
}

const HF_EMBED_URL = "https://api-inference.huggingface.co/embeddings/all-MiniLM-L6-v2";

let foods = [];        // array of { food, serving_description, kcal, protein_g, carbs_g, fat_g }
let embeddings = null; // Float32Array matrix [N][d]
let embDim = null;

// utility: cosine similarity
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// parse CSV on startup
function loadFoodsDB() {
  const csvPath = path.join(__dirname, "..", "FoodsDB.csv");
  const text = fs.readFileSync(csvPath, "utf8");
  const rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
  foods = rows.map(r => ({
    food: r.food,
    serving_description: r.serving_description || "",
    kcal: parseFloat(r.kcal || 0),
    protein_g: parseFloat(r.protein_g || 0),
    carbs_g: parseFloat(r.carbs_g || 0),
    fat_g: parseFloat(r.fat_g || 0)
  }));
}

// fetch embedding from HF
async function embedText(text) {
  const res = await fetch(HF_EMBED_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: text })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("HF embedding error: " + res.status + " " + txt);
  }
  const json = await res.json();
  // json should be an array (or {embedding: ...} depending on HF response shape)
  if (Array.isArray(json) && Array.isArray(json[0])) return json[0];
  if (json.embedding) return json.embedding;
  // fallback
  return json;
}

// prepare embeddings for all foods (call HF once per food at startup)
async function buildEmbeddings() {
  if (!HF_TOKEN) {
    console.warn("No HF_TOKEN available — embeddings cannot be fetched.");
    return;
  }
  console.log("Building food embeddings (this happens once on cold start) ...");
  const all = [];
  for (let i = 0; i < foods.length; i++) {
    const txt = foods[i].food + " " + (foods[i].serving_description || "");
    try {
      const emb = await embedText(txt);
      all.push(emb);
      console.log("embedded:", foods[i].food);
    } catch (e) {
      console.error("embed error for", foods[i].food, e.message);
      all.push(new Array(384).fill(0)); // fallback dimension (model returns 384 for MiniLM)
    }
  }
  embeddings = all;
  embDim = all[0] ? all[0].length : null;
  console.log("Embeddings ready. dim=", embDim);
}

// attempt to parse numeric amounts from free text (grams, numbers, fractions)
function parseAmount(text) {
  const t = text.toLowerCase();
  // grams e.g. "150 g" or "150g"
  const gramsMatch = t.match(/(\d+(?:\.\d+)?)\s?g\b/);
  if (gramsMatch) return { kind: "grams", value: parseFloat(gramsMatch[1]) };
  // fraction like 1/2
  const fracMatch = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (fracMatch) return { kind: "mult", value: parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]) };
  // normal number (servings)
  const numMatch = t.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) return { kind: "mult", value: parseFloat(numMatch[1]) };
  return { kind: "none", value: 1.0 };
}

// scale macros using multiplier; if serving mentions grams and we got grams parse, scale accordingly
function scaleMacro(dbRow, multiplierInfo) {
  let mult = 1.0;
  if (multiplierInfo.kind === "mult") {
    mult = multiplierInfo.value;
  } else if (multiplierInfo.kind === "grams") {
    // look for a grams number in serving_description like "100 g" or "100g"
    const m = (dbRow.serving_description || "").match(/(\d+(?:\.\d+)?)\s?g/);
    if (m) {
      const servingGrams = parseFloat(m[1]);
      if (servingGrams > 0) mult = multiplierInfo.value / servingGrams;
    } else {
      // if DB serving not in g, keep multiplier as 1
      mult = multiplierInfo.value;
    }
  } else {
    mult = multiplierInfo.value || 1.0;
  }
  return {
    kcal: Math.round(dbRow.kcal * mult),
    protein_g: Math.round(dbRow.protein_g * mult * 10) / 10,
    carbs_g: Math.round(dbRow.carbs_g * mult * 10) / 10,
    fat_g: Math.round(dbRow.fat_g * mult * 10) / 10,
    multiplier: mult
  };
}

// Initialize DB + embeddings
loadFoodsDB();
const initPromise = (async () => {
  try {
    await buildEmbeddings();
  } catch (e) {
    console.error("Error building embeddings:", e.message);
  }
})();

// Express-like minimal handler for serverless platforms
module.exports = async (req, res) => {
  // wait for initialization
  await initPromise;

  if (req.method === "OPTIONS") {
    return res.send("");
  }

  if (req.method !== "POST") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, message: "Send POST with { text }" }));
  }

  let body = req.body;
  if (!body) {
    // parse raw
    try {
      body = JSON.parse(await getRawBody(req));
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
  }

  const text = (body.text || "").trim();
  if (!text) return sendJson(res, 400, { error: "text required" });

  // embed query
  let qEmb;
  try {
    qEmb = await embedText(text);
  } catch (e) {
    console.error("embed error:", e.message);
    return sendJson(res, 500, { error: "embedding failed", details: e.message });
  }

  // compute top-k by cosine
  const scores = embeddings.map(e => cosine(e, qEmb));
  const ranked = scores
    .map((s, idx) => ({ idx, score: s }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // pick best
  const best = foods[ranked[0].idx];
  const parsed = parseAmount(text);
  const scaled = scaleMacro(best, parsed);

  const candidates = ranked.map(r => ({
    food: foods[r.idx].food,
    serving_description: foods[r.idx].serving_description,
    score: r.score
  }));

  return sendJson(res, 200, {
    input: text,
    matched_food: best.food,
    serving_description: best.serving_description,
    multiplier: scaled.multiplier,
    kcal: scaled.kcal,
    protein_g: scaled.protein_g,
    carbs_g: scaled.carbs_g,
    fat_g: scaled.fat_g,
    candidates
  });
};

// helper send json
function sendJson(res, code, obj) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

// helper to read raw body if our platform doesn't parse it automatically
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
