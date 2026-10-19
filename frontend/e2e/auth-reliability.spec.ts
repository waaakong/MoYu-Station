import { expect, test, type Page } from '@playwright/test';
const member={id:72,username:'fixture_member',nickname:'原昵称',userType:'NORMAL',passwordChangeRequired:false};
const ok=(data:unknown)=>({success:true,code:'OK',data});
async function base(page:Page,user:unknown=null){
  await page.route('**/api/**',route=>route.fulfill({json:ok(null)}));
  await page.route('**/api/auth/csrf',route=>route.fulfill({json:ok({token:'isolated-test-token'})}));
  await page.route('**/api/auth/me',route=>route.fulfill({json:ok(user)}));
}
async function registration(page:Page){
  await page.goto('/register');
  await page.getByLabel('邀请码',{exact:true}).fill('isolated-invitation');
  await page.getByLabel('用户名',{exact:true}).fill(member.username);
  await page.getByLabel('密码',{exact:true}).fill('isolated-password');
  await page.getByLabel('确认密码',{exact:true}).fill('isolated-password');
}
for (const width of [1440, 390]) {
  test(`login failure has a single error owner at ${width}px`, async ({ page }, info) => {
    await base(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', event => {
      if (event.type() === 'error' && !event.text().includes('Failed to load resource')) errors.push(event.text());
    });
    let calls = 0;
    await page.route('**/api/auth/login', route => {
      calls++;
      return route.fulfill({ status: 401, json: { success: false, code: 'AUTH_INVALID_CREDENTIALS', message: '用户名或密码不正确。' } });
    });
    await page.goto('/login?reason=session-ended');
    await expect(page).toHaveURL(/\/login\?reason=session-ended$/);
    expect(await page.title()).not.toBe('');
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
    await page.getByLabel('用户名', { exact: true }).fill(member.username);
    const password = page.getByLabel('密码', { exact: true });
    await password.fill('isolated-invalid-password');
    const submit = page.getByRole('button', { name: '进入墨屿', exact: true });
    await submit.click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByText('用户名或密码不正确。', { exact: true })).toHaveCount(1);
    await expect(password).toHaveAttribute('aria-errormessage', 'login-password-error');
    await expect(password).toBeFocused();
    await expect(submit).toBeEnabled();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`login-single-error-${width}.png`) });
    await submit.click();
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByRole('alert')).toHaveCount(1);
    // A different failure must remain visible, without a stale credential error.
    await page.route('**/api/auth/login', route => route.fulfill({ status: 403, json: { success: false, code: 'AUTH_CSRF_INVALID', message: '请求验证已失效，请刷新后重试。' } }));
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveText('请求验证已失效，请刷新后重试。');
    await expect(page.locator('#login-password-error')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
test('username is not silently changed and validation is shown only once',async({page})=>{
  await base(page);let calls=0;
  await page.route('**/api/auth/login',route=>{calls++;return route.fulfill({json:ok(member)});});
  await page.goto('/login');await page.getByLabel('用户名',{exact:true}).fill('ab 中');
  await page.getByLabel('密码',{exact:true}).fill('isolated-password');
  await page.getByRole('button',{name:'进入墨屿',exact:true}).click();
  await expect(page.getByLabel('用户名',{exact:true})).toHaveValue('ab 中');
  await expect(page.getByRole('alert')).toHaveCount(1);expect(calls).toBe(0);
});
test('login rate limit blocks requests and uses a wall-clock deadline',async({page})=>{
  await base(page);let calls=0;
  await page.route('**/api/auth/login',route=>{calls++;return route.fulfill({status:429,headers:{'Retry-After':'30'},json:{success:false,code:'AUTH_RATE_LIMITED',message:'稍后再试'}});});
  await page.clock.install();await page.goto('/login');
  await page.getByLabel('用户名',{exact:true}).fill(member.username);await page.getByLabel('密码',{exact:true}).fill('fixture');
  const submit=page.getByRole('button',{name:'进入墨屿',exact:true});await submit.click();
  await expect(submit).toBeDisabled();
  await page.locator('form.login-card').dispatchEvent('submit');expect(calls).toBe(1);
  await page.clock.fastForward(31000);await expect(submit).toBeEnabled();
});
test('created account plus failed automatic login never repeats registration',async({page})=>{
  await base(page);let calls=0;
  await page.route('**/api/auth/register',route=>{calls++;return route.fulfill({json:ok(member)});});
  await page.route('**/api/auth/login',route=>route.fulfill({status:503,json:{success:false,code:'AUTH_UNAVAILABLE',message:'暂不可用'}}));
  await registration(page);await page.getByRole('button',{name:'创建墨屿账号'}).click();
  await expect(page.getByText('账号已创建，但自动登录未完成。请前往登录，不要重复注册。')).toBeVisible();
  await expect(page.getByLabel('密码',{exact:true})).toHaveValue('');await expect(page.getByLabel('邀请码',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'前往登录核对'}).click();await expect(page).toHaveURL(/login/);expect(calls).toBe(1);
});
test('unknown registration clears secrets and offers verification instead of another creation',async({page},info)=>{
  await base(page);
  await page.route('**/api/auth/register',route=>route.abort('failed'));
  await page.setViewportSize({width:390,height:844});await registration(page);
  await page.getByRole('button',{name:'创建墨屿账号'}).click();
  await expect(page.getByText(/注册结果尚未确认/)).toBeVisible();
  await expect(page.getByLabel('确认密码',{exact:true})).toHaveValue('');
  await page.screenshot({path:info.outputPath('registration-unknown-390.png')});
});
test('nickname waits for the real response and failure preserves draft',async({page},info)=>{
  await base(page,member);
  await page.route('**/api/profile/**',route=>route.fulfill({json:ok(route.request().url().endsWith('/me')?member:[])}));
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/profile/nickname',async route=>{await gate;await route.fulfill({status:400,json:{success:false,code:'INVALID_NICKNAME',message:'昵称未保存'}});});
  await page.goto('/profile?module=account');await page.getByLabel('昵称',{exact:true}).fill('保留这份草稿');
  const submit=page.getByRole('button',{name:'保存昵称',exact:true});await submit.click();await expect(submit).toBeDisabled();
  await expect(page.getByText('昵称已保存。',{exact:true})).toHaveCount(0);release();
  await expect(page.getByRole('alert')).toHaveText('昵称未保存');await expect(submit).toBeEnabled();
  await expect(page.getByLabel('昵称',{exact:true})).toHaveValue('保留这份草稿');
  await page.screenshot({path:info.outputPath('nickname-failure.png')});
});
test('leaving pending registration never triggers a late automatic login',async({page})=>{
  await base(page);let loginCalls=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/auth/register',async route=>{await gate;await route.fulfill({json:ok(member)});});
  await page.route('**/api/auth/login',route=>{loginCalls++;return route.fulfill({json:ok(member)});});
  await registration(page);const response=page.waitForResponse('**/api/auth/register');
  await page.getByRole('button',{name:'创建墨屿账号'}).click();await page.getByRole('button',{name:'已有账号',exact:true}).click();
  await expect(page).toHaveURL(/login/);release();await response;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(loginCalls).toBe(0);
});
test('password is concealed when focus leaves its control',async({page})=>{
  await base(page);await page.goto('/login');
  const password=page.getByLabel('密码',{exact:true});await password.fill('fixture');
  await page.getByRole('button',{name:'显示密码',exact:true}).click();await expect(password).toHaveAttribute('type','text');
  await page.getByLabel('用户名',{exact:true}).click();await expect(password).toHaveAttribute('type','password');
});
