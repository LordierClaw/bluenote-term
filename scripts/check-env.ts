const summary = {
  bun: Bun.version,
  node: process.version,
  platform: process.platform,
}

console.log(JSON.stringify(summary, null, 2))
