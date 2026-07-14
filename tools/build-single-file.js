// Builds countries-trivia-offline.html — the whole game (flags included) in
// one self-contained file that works from anywhere, no server or internet.
//   node tools/build-single-file.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const css = read("styles.css");
const dataJs = read("data.js");
let appJs = read("app.js");
const html = read("index.html");

// page markup between <body> and the script tags
const body = html.match(/<body>([\s\S]*?)<script/)[1];

// embed every flag as a raw SVG string (collapsed whitespace)
const flags = {};
for (const f of fs.readdirSync(path.join(ROOT, "flags"))) {
  flags[f.replace(".svg", "")] = read(path.join("flags", f)).replace(/\s+/g, " ").trim();
}

// swap the file-based flag URLs for embedded data URIs
appJs = appJs.replace(
  /const FLAG_URL = .*\n/,
  'const FLAG_URL = (code) => "data:image/svg+xml;utf8," + encodeURIComponent(FLAGS[code]);\n'
);

// "</" inside the embedded SVG strings would terminate the <script> tag
const flagsJs = ("const FLAGS = " + JSON.stringify(flags) + ";").replace(/<\//g, "<\\/");

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Countries Trivia</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌍</text></svg>">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${flagsJs}
${dataJs}
${appJs}
</script>
</body>
</html>
`;

const out = path.join(ROOT, "countries-trivia-offline.html");
fs.writeFileSync(out, page);
console.log("built", out, (page.length / 1024 / 1024).toFixed(2), "MB");
