import { expect, test } from '@playwright/test';

test('login page exposes accessible form controls and keyboard focus', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

  const email = page.getByRole('textbox', { name: /email/i });
  const password = page.getByLabel(/password/i);
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('autocomplete', 'email');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
});

test('access request page exposes labelled fields and keyboard order', async ({ page }) => {
  await page.goto('/request-access');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request Access' })).toBeVisible();
  for (const name of ['Name', 'Email', 'Stake', 'Ward', 'Message']) {
    await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('type', 'email');
  await expect(page.getByRole('button', { name: 'Submit request' })).toBeVisible();

  await page.getByLabel('Name', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Stake', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Ward', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Message', { exact: true })).toBeFocused();
});
