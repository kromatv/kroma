// Frees the server port from a LEFTOVER kroma-server before a new one binds.
//
// `bun run dev` supervises the server through concurrently -> cargo watch ->
// `sh -c cargo run`; a clean Ctrl+C tears the whole chain down, but an
// abruptly closed terminal orphans the grandchild onto PID 1 with the port,
// and the next start then dies on EADDRINUSE. Only a process whose command is
// kroma-server is touched: anything else keeps the port and the bind error
// stays loud, because that IS the right answer for a genuinely taken port.

const port = Number(process.env.KROMA_PORT ?? 4040);

const listeners = Bun.spawnSync(['lsof', '-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'])
  .stdout.toString()
  .trim()
  .split('\n')
  .filter(Boolean);

let freed = false;
for (const pid of listeners) {
  const command = Bun.spawnSync(['ps', '-o', 'command=', '-p', pid]).stdout.toString();
  if (!command.includes('kroma-server')) continue;
  console.log(`[preflight] freeing :${port} from leftover kroma-server (pid ${pid})`);
  process.kill(Number(pid), 'SIGTERM');
  freed = true;
}

// A beat for the socket to release before cargo binds.
if (freed) await Bun.sleep(500);
