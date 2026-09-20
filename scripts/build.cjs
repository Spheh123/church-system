const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
async function build({ output = 'dist', preview = false } = {}) {
  const root = path.resolve(output);
  fs.mkdirSync(root, { recursive: true });
  // Manuals are delivered only by the authenticated function, never static files.
  fs.cpSync('main-app', path.join(root, 'main-app'), { recursive: true, filter: source => path.resolve(source) !== path.resolve('main-app/training') });
  const oldManuals = path.join(root, 'main-app', 'training');
  if (!oldManuals.startsWith(root + path.sep)) throw new Error('Invalid build output');
  fs.rmSync(oldManuals, { recursive: true, force: true });
  fs.copyFileSync('main-app/_headers', path.join(root, '_headers'));
  const plugins = [{ name: 'configuration', setup(builder) {
    if (preview) builder.onResolve({ filter: /shared\/supabase\.js$/ }, () => ({ path: path.resolve('tests/fixtures/supabase.js') }));
    builder.onLoad({ filter: /shared[\\/]config\.js$/ }, async args => {
      let contents = fs.readFileSync(args.path, 'utf8');
      const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        if (!url.startsWith('https://') || key.startsWith('sb_secret_')) throw new Error('Use the public Supabase URL and anon/publishable key.');
        if (key.startsWith('eyJ')) {
          const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
          if (payload.role !== 'anon') throw new Error('Never put a service-role key in the frontend.');
        }
        contents = contents.replace(/url: "[^"]+"/, 'url: ' + JSON.stringify(url)).replace(/anonKey: "[^"]+"/, 'anonKey: ' + JSON.stringify(key));
      }
      return { contents, loader: 'js' };
    });
  } }];
  await esbuild.build({ entryPoints: fs.readdirSync('main-app/js').filter(f => f.endsWith('.js')).map(f => 'main-app/js/' + f), outdir: path.join(root,'main-app/js'), bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', minify: !preview, plugins });
  console.log(`Built ${preview ? 'LOCAL FIXTURE PREVIEW' : 'production site'}: ${root}`);
}
module.exports = { build };
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
