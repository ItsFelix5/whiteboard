import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import type { OutputAsset } from 'rolldown';

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    {
      name: "inline",
      apply: "build",
      enforce: "post",
      generateBundle(_options, bundle) {
        let js = "";
        let html: OutputAsset | undefined = undefined;
        for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk') {
          js = file.code
          delete bundle[fileName]
        } else if (fileName.endsWith('.html')) html = file;
        if(html) html.source = (html.source as string).replace(/ crossorigin src="([^"]*)">/g, '>'+js);
      }
    }
  }
  ],
});