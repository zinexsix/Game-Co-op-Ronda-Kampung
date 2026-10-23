// Server statis sederhana untuk menjalankan build produksi (folder dist/) secara OFFLINE.
// Tanpa dependensi: hanya modul bawaan Node.
//
//   node scripts/serve-dist.mjs            -> http://localhost:4173
//   node scripts/serve-dist.mjs --open     -> juga membuka Microsoft Edge layar penuh (mode kiosk)
//   node scripts/serve-dist.mjs --port 8080
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const port = portArg >= 0 ? Number(args[portArg + 1]) : 4173;
const open = args.includes("--open");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

try {
  await stat(join(root, "index.html"));
} catch {
  console.error("Folder dist/ belum ada. Jalankan dulu: npm run build");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    // Cegah keluar dari folder dist/ (mis. "/../package.json").
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      // File di assets/ bernama hash: aman di-cache lama. config/ & index.html selalu segar agar suntingan langsung terpakai.
      "Cache-Control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Tidak ditemukan");
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = `http://localhost:${port}/`;
  console.log(`Ronda Bareng berjalan offline di ${address}`);
  console.log("Tutup jendela ini (atau Ctrl+C) untuk menghentikan server.");
  if (open) openEdgeFullscreen(address);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${port} sedang dipakai. Coba: node scripts/serve-dist.mjs --port 8080`);
  else console.error(err);
  process.exit(1);
});

/** Buka Microsoft Edge dalam mode kiosk layar penuh (keluar dengan Alt+F4). */
function openEdgeFullscreen(address) {
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];
  const run = (exe) =>
    spawn(exe, ["--kiosk", address, "--edge-kiosk-type=fullscreen", "--no-first-run", "--autoplay-policy=no-user-gesture-required"], {
      detached: true,
      stdio: "ignore",
    });
  (async () => {
    for (const exe of candidates) {
      try {
        await stat(exe);
        run(exe).unref();
        return;
      } catch {
        // coba lokasi berikutnya
      }
    }
    console.log(`Edge tidak ditemukan. Buka ${address} di browser lalu tekan F11 / tombol Layar penuh.`);
  })();
}
