// Day 1 stub — replaced on Day 5 with TanStack Start
const server = Bun.serve({
  port: parseInt(process.env.PORT ?? '3000'),
  fetch() {
    return new Response('Pocket Battles — frontend coming soon', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
});
console.log(`Web stub listening on :${server.port}`);
