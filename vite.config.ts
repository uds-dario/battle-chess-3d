import { defineConfig } from 'vite'
import path from 'node:path'

const configDir = path.resolve(__dirname, 'public', 'config')
const configGlob = path.join(configDir, '**', '*.json')

export default defineConfig({
  plugins: [
    {
      name: 'watch-public-config',
      configureServer(server) {
        server.watcher.add(configGlob)
        server.watcher.on('change', (file) => {
          const normalized = file.split(path.sep).join('/')
          if (
            normalized.includes('/public/config/') &&
            normalized.endsWith('.json')
          ) {
            server.ws.send({ type: 'full-reload' })
          }
        })
      },
    },
  ],
})
