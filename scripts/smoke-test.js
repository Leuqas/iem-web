const path = require("path");
const fs = require("fs");
const { startServer } = require(path.join("..", "index"));

async function run() {
  const missing = [];
  const requiredFiles = [
    path.join(__dirname, "..", "public", "index.html"),
    path.join(__dirname, "..", "public", "admin.html"),
    path.join(__dirname, "..", "public", "client.js"),
    path.join(__dirname, "..", "public", "admin.js"),
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      missing.push(file);
    }
  }

  if (missing.length) {
    console.error("Missing required files:");
    for (const file of missing) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  const { server, port } = await startServer(0);
  server.close();
  console.log(`Smoke test passed (server started on port ${port}).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
