const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transform } = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const distDir = path.join(publicDir, 'dist');
const manifestPath = path.join(distDir, 'asset-manifest.json');

const bundles = [
  {
    output: 'app-shell.bundle.js',
    files: [
      'js/api-client.js',
      'js/index-guard.js'
    ]
  },
  {
    output: 'app.bundle.js',
    files: [
      'js/utils.js',
      'js/state.js',
      'js/toast.js',
      'js/theme.js',
      'js/filters.js',
      'js/render.js',
      'js/projects.js',
      'js/tasks.js',
      'js/modals.js',
      'js/commands.js',
      'js/dragdrop.js',
      'js/keyboard.js',
      'js/events.js',
      'js/team.js',
      'js/polling.js',
      'js/app.js'
    ]
  },
  {
    output: 'admin.bundle.js',
    files: [
      'js/api-client.js',
      'js/theme.js',
      'js/polling.js',
      'js/admin-page.js'
    ]
  },
  {
    output: 'login.bundle.js',
    files: [
      'js/api-client.js',
      'js/theme.js',
      'js/login-page.js'
    ]
  },
  {
    output: 'register.bundle.js',
    files: [
      'js/api-client.js',
      'js/theme.js',
      'js/register-page.js'
    ]
  }
];
const versionedCssFiles = [
  'css/theme.css',
  'css/app.css',
  'css/auth.css'
];

function readSource(relativePath) {
  return fs.readFileSync(path.join(publicDir, relativePath), 'utf8').trim();
}

function createContentHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 10);
}

function cleanupOldBundleFiles(baseName) {
  const basePrefix = baseName.replace(/\.js$/, '');
  for (const fileName of fs.readdirSync(distDir)) {
    if (fileName === 'asset-manifest.json') continue;
    if (fileName === baseName || fileName.startsWith(`${basePrefix}.`)) {
      fs.unlinkSync(path.join(distDir, fileName));
    }
  }
}

async function buildBundle(bundle) {
  const source = bundle.files
    .map(file => `/* ${file} */\n${readSource(file)}`)
    .join('\n;\n');

  const result = await transform(source, {
    loader: 'js',
    minify: true,
    target: 'es2020',
    legalComments: 'none'
  });

  const code = `${result.code}\n`;
  const hash = createContentHash(code);
  const hashedFileName = bundle.output.replace(/\.js$/, `.${hash}.js`);

  cleanupOldBundleFiles(bundle.output);
  fs.writeFileSync(path.join(distDir, hashedFileName), code, 'utf8');

  return {
    logicalName: bundle.output,
    fileName: hashedFileName,
    hash
  };
}

async function main() {
  fs.mkdirSync(distDir, { recursive: true });
  const manifest = { buildId: '', bundles: {} };
  const bundleHashes = [];

  for (const bundle of bundles) {
    const output = await buildBundle(bundle);
    manifest.bundles[output.logicalName] = output.fileName;
    bundleHashes.push(output.hash);
  }

  const cssHashes = versionedCssFiles.map(file => createContentHash(readSource(file)));
  manifest.buildId = createContentHash([...bundleHashes, ...cssHashes].join(':'));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stdout.write(`Built ${bundles.length} frontend bundles in ${path.relative(projectRoot, distDir)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
