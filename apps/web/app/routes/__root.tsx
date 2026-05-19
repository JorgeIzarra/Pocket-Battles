import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import tokensCSS from '../styles/tokens.css?url';
import componentsCSS from '../styles/components.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Pocket Battles' },
    ],
    links: [
      { rel: 'stylesheet', href: tokensCSS },
      { rel: 'stylesheet', href: componentsCSS },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function resize() {
      const sw = window.innerWidth / 1280;
      const sh = window.innerHeight / 800;
      setScale(Math.min(sw, sh, 1));
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="app">
          <div
            className="viewport"
            style={{ transform: `scale(${scale})` }}
          >
            <Outlet />
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
