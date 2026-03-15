const fs = require('fs');
const path = require('path');
const { transform } = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const distDir = path.join(publicDir, 'dist');

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

function readSource(relativePath) {
  return fs.readFileSync(path.join(publicDir, relativePath), 'utf8').trim();
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

  fs.writeFileSync(path.join(distDir, bundle.output), `${result.code}\n`, 'utf8');
}

async function main() {
  fs.mkdirSync(distDir, { recursive: true });

  for (const bundle of bundles) {
    await buildBundle(bundle);
  }

  process.stdout.write(`Built ${bundles.length} frontend bundles in ${path.relative(projectRoot, distDir)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
