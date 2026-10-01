const esbuild = require('C:/Users/MueAb/AppData/Local/npm-cache/_npx/beb367dfa21eb3f5/node_modules/esbuild');
const path = require('path');

async function build() {
  console.log('⚡ Bundling Dynamic Auth Widget for Browser...');
  try {
    const result = await esbuild.build({
      entryPoints: [path.resolve(__dirname, '../src/dynamic-entry.tsx')],
      bundle: true,
      outfile: path.resolve(__dirname, '../public/dynamic-bundle.js'),
      format: 'iife',
      globalName: 'DynamicAuth',
      platform: 'browser',
      target: 'es2022',
      define: {
        'process.env.NODE_ENV': '"production"',
        'global': 'window',
      },
      sourcemap: false,
      minify: false,
    });
    console.log('✅ Dynamic Auth Widget bundled successfully to public/dynamic-bundle.js!');
  } catch (err) {
    console.error('❌ Bundle error:', err);
    process.exit(1);
  }
}

build();
