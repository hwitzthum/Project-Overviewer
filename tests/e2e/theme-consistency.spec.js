const { test, expect } = require('@playwright/test');
const { loginUI, loginAPI, createProjectAPI } = require('./helpers');

/**
 * Theme-specific CSS variable raw values (as they appear in theme.css).
 * getComputedStyle().getPropertyValue('--var') returns the raw authored value,
 * NOT the computed rgb() form. So hex values stay hex, triplets stay triplets.
 */
const THEME_RAW = {
  light: {
    '--danger': '#b93f3a',     '--danger-rgb': '185, 63, 58',
    '--warning': '#c88a1d',    '--warning-rgb': '200, 138, 29',
    '--success': '#3f8a5a',    '--success-rgb': '63, 138, 90',
    '--accent': '#b55233',     '--accent-rgb': '181, 82, 51',
    '--text-on-accent': '#fff',
    '--overlay': 'rgba(43, 29, 16, 0.5)',
  },
  dark: {
    '--danger': '#ff7676',     '--danger-rgb': '255, 118, 118',
    '--warning': '#ffb34d',    '--warning-rgb': '255, 179, 77',
    '--success': '#5bc488',    '--success-rgb': '91, 196, 136',
    '--accent': '#79d2ff',     '--accent-rgb': '121, 210, 255',
    '--text-on-accent': '#11161a',
    '--overlay': 'rgba(0, 0, 0, 0.6)',
  },
  ocean: {
    '--danger': '#ff8d7b',     '--danger-rgb': '255, 141, 123',
    '--warning': '#ffbf52',    '--warning-rgb': '255, 191, 82',
    '--success': '#5dd9a3',    '--success-rgb': '93, 217, 163',
    '--accent': '#3ed0f2',     '--accent-rgb': '62, 208, 242',
    '--text-on-accent': '#0d202a',
    '--overlay': 'rgba(1, 15, 20, 0.6)',
  },
  forest: {
    '--danger': '#ee8574',     '--danger-rgb': '238, 133, 116',
    '--warning': '#f1b04c',    '--warning-rgb': '241, 176, 76',
    '--success': '#62c985',    '--success-rgb': '98, 201, 133',
    '--accent': '#a8d35f',     '--accent-rgb': '168, 211, 95',
    '--text-on-accent': '#151d16',
    '--overlay': 'rgba(7, 12, 8, 0.6)',
  },
};

/**
 * Computed rgb() values for element-level color assertions.
 * getComputedStyle(element).color returns rgb() form.
 */
const THEME_RGB = {
  light: {
    danger:  'rgb(185, 63, 58)',
    success: 'rgb(63, 138, 90)',
    accent:  'rgb(181, 82, 51)',
    textOnAccent: 'rgb(255, 255, 255)',
  },
  dark: {
    danger:  'rgb(255, 118, 118)',
    success: 'rgb(91, 196, 136)',
    accent:  'rgb(121, 210, 255)',
    textOnAccent: 'rgb(17, 22, 26)',
  },
  ocean: {
    danger:  'rgb(255, 141, 123)',
    success: 'rgb(93, 217, 163)',
    accent:  'rgb(62, 208, 242)',
    textOnAccent: 'rgb(13, 32, 42)',
  },
  forest: {
    danger:  'rgb(238, 133, 116)',
    success: 'rgb(98, 201, 133)',
    accent:  'rgb(168, 211, 95)',
    textOnAccent: 'rgb(21, 29, 22)',
  },
};

/** Read a CSS custom property from <html> */
function getCSSVar(page, varName) {
  return page.evaluate(
    (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
    varName,
  );
}

/** Read a computed CSS property on a real element */
function getComputedProp(page, selector, prop) {
  return page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).getPropertyValue(p).trim() : null;
    },
    [selector, prop],
  );
}

// ───────────────────────────────────────────────────────
// 1. CSS Variables Are Defined Per Theme on Every Page
// ───────────────────────────────────────────────────────

test.describe('Theme CSS variables are defined on all pages', () => {
  const pages = ['/login.html', '/register.html'];

  for (const pagePath of pages) {
    for (const theme of ['light', 'dark', 'ocean', 'forest']) {
      test(`${pagePath} — ${theme} theme defines all semantic vars`, async ({ page }) => {
        await page.goto(pagePath);
        await page.click(`.theme-dot[data-theme="${theme}"]`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const expected = THEME_RAW[theme];
        for (const [varName, expectedVal] of Object.entries(expected)) {
          const actual = await getCSSVar(page, varName);
          expect(actual, `${varName} on ${pagePath} [${theme}]`).toBe(expectedVal);
        }
      });
    }
  }
});

test.describe('Theme CSS variables on authenticated pages', () => {
  for (const theme of ['light', 'dark', 'ocean', 'forest']) {
    test(`main app — ${theme} theme defines all semantic vars`, async ({ page }) => {
      await loginUI(page);
      await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

      await page.click('#openSettings');
      await page.click(`#settingsModal .settings-option[data-theme="${theme}"]`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.click('#settingsModal .modal-close');

      const expected = THEME_RAW[theme];
      for (const [varName, expectedVal] of Object.entries(expected)) {
        const actual = await getCSSVar(page, varName);
        expect(actual, `${varName} on main app [${theme}]`).toBe(expectedVal);
      }
    });

    test(`admin page — ${theme} theme defines all semantic vars`, async ({ page }) => {
      await loginUI(page);
      await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
      await page.goto('/admin.html');
      await page.click(`.theme-dot[data-theme="${theme}"]`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const expected = THEME_RAW[theme];
      for (const [varName, expectedVal] of Object.entries(expected)) {
        const actual = await getCSSVar(page, varName);
        expect(actual, `${varName} on admin [${theme}]`).toBe(expectedVal);
      }
    });
  }
});

// ───────────────────────────────────────────────────────
// 2. Auth Pages: Element Colors Follow the Active Theme
// ───────────────────────────────────────────────────────

test.describe('Auth page elements use theme-aware colors', () => {
  for (const theme of ['dark', 'ocean', 'forest']) {
    test(`login submit button text matches ${theme} text-on-accent`, async ({ page }) => {
      await page.goto('/login.html');
      await page.click(`.theme-dot[data-theme="${theme}"]`);

      const btnColor = await getComputedProp(page, '.auth-submit', 'color');
      expect(btnColor, `submit btn color [${theme}]`).toBe(THEME_RGB[theme].textOnAccent);
    });

    test(`login error message color matches ${theme} danger`, async ({ page }) => {
      await page.goto('/login.html');
      await page.click(`.theme-dot[data-theme="${theme}"]`);

      // Trigger a login error
      await page.fill('#username', 'nonexistent');
      await page.fill('#password', 'wrong');
      await page.click('#submitBtn');
      await page.waitForSelector('.auth-message.error.visible', { timeout: 5000 });

      const msgColor = await getComputedProp(page, '.auth-message.error', 'color');
      expect(msgColor, `error msg color [${theme}]`).toBe(THEME_RGB[theme].danger);
    });
  }
});

// ───────────────────────────────────────────────────────
// 3. Main App: Status Badges Use Theme Colors
// ───────────────────────────────────────────────────────

test.describe('App status badges use theme-aware colors', () => {
  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request);
    await createProjectAPI(request, login.token, { title: 'Theme In-Progress', status: 'in-progress' });
    await createProjectAPI(request, login.token, { title: 'Theme Completed', status: 'completed' });
  });

  for (const theme of ['dark', 'ocean', 'forest']) {
    test(`status badges match ${theme} theme`, async ({ page }) => {
      await loginUI(page);
      await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

      await page.click('#openSettings');
      await page.click(`#settingsModal .settings-option[data-theme="${theme}"]`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.click('#settingsModal .modal-close');

      await page.waitForSelector('.project-card', { timeout: 5000 });

      // In-progress badge should use theme accent
      const ipBadge = page.locator('.status-in-progress').first();
      if (await ipBadge.count() > 0) {
        const color = await ipBadge.evaluate((el) => getComputedStyle(el).color);
        expect(color, `in-progress [${theme}]`).toBe(THEME_RGB[theme].accent);
      }

      // Completed badge should use theme success
      const cBadge = page.locator('.status-completed').first();
      if (await cBadge.count() > 0) {
        const color = await cBadge.evaluate((el) => getComputedStyle(el).color);
        expect(color, `completed [${theme}]`).toBe(THEME_RGB[theme].success);
      }
    });
  }
});

// ───────────────────────────────────────────────────────
// 4. No Hardcoded iOS Colors Leak Through
// ───────────────────────────────────────────────────────

test.describe('No hardcoded iOS colors in themed elements', () => {
  const IOS_DANGER  = 'rgb(255, 59, 48)';
  const IOS_SUCCESS = 'rgb(52, 199, 89)';
  const IOS_BLUE    = 'rgb(0, 122, 255)';

  test('dark theme: status badges do not use iOS hardcoded colors', async ({ page }) => {
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

    await page.click('#openSettings');
    await page.click('#settingsModal .settings-option[data-theme="dark"]');
    await page.click('#settingsModal .modal-close');

    await page.waitForSelector('.project-card', { timeout: 5000 });

    const inProgress = page.locator('.status-in-progress').first();
    if (await inProgress.count() > 0) {
      const color = await inProgress.evaluate((el) => getComputedStyle(el).color);
      expect(color, 'in-progress must not use iOS blue').not.toBe(IOS_BLUE);
    }

    const completed = page.locator('.status-completed').first();
    if (await completed.count() > 0) {
      const color = await completed.evaluate((el) => getComputedStyle(el).color);
      expect(color, 'completed must not use iOS green').not.toBe(IOS_SUCCESS);
    }
  });

  test('dark theme: delete button hover rule uses theme danger, not iOS red', async ({ page }) => {
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

    await page.click('#openSettings');
    await page.click('#settingsModal .settings-option[data-theme="dark"]');
    await page.click('#settingsModal .modal-close');

    await page.waitForSelector('.project-card', { timeout: 5000 });

    // CSS :hover pseudo-class is unreliable in headless Playwright,
    // so verify the hover rule via stylesheet inspection instead
    const hoverColor = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === '.project-delete-btn:hover') {
              return rule.style.color;
            }
          }
        } catch { /* cross-origin sheets */ }
      }
      return null;
    });
    expect(hoverColor, 'hover rule should reference --danger var').toBe('var(--danger)');
  });

  test('ocean theme: login error uses theme danger, not iOS red', async ({ page }) => {
    await page.goto('/login.html');
    await page.click('.theme-dot[data-theme="ocean"]');

    await page.fill('#username', 'nonexistent');
    await page.fill('#password', 'wrong');
    await page.click('#submitBtn');
    await page.waitForSelector('.auth-message.error.visible', { timeout: 5000 });

    const color = await getComputedProp(page, '.auth-message.error', 'color');
    expect(color, 'error msg: not iOS red').not.toBe(IOS_DANGER);
    expect(color, 'error msg: theme danger').toBe(THEME_RGB.ocean.danger);
  });
});

// ───────────────────────────────────────────────────────
// 5. Modal Overlay Uses Themed Color
// ───────────────────────────────────────────────────────

test.describe('Modal overlay uses theme-aware color', () => {
  test('forest overlay is not hardcoded black', async ({ page }) => {
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

    await page.click('#openSettings');
    await page.click('#settingsModal .settings-option[data-theme="forest"]');
    await page.click('#settingsModal .modal-close');
    await page.waitForSelector('.project-card', { timeout: 5000 });

    // Open new project modal
    const newBtn = page.locator('#newProjectBtn, [data-action="new-project"], button:has-text("New Project")').first();
    if (await newBtn.count() > 0) {
      await newBtn.click();
      const overlay = page.locator('.modal-overlay').first();
      if (await overlay.count() > 0) {
        const bg = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg, 'overlay should not be plain black').not.toBe('rgba(0, 0, 0, 0.5)');
      }
    }
  });
});
