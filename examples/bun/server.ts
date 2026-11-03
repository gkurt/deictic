import tools from './deictic.plugin.ts';
import index from './src/index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 5183),
  // deictic's endpoints, then the page. Alt-click an element to open the popup there.
  routes: { ...tools.routes, '/*': index },
  development: { hmr: true, console: true },
});

console.log(`Listening on ${server.url}`);
