import { test, expect } from '@playwright/test';

test('temporary restoration failure can be retried without posting a password', async({page})=>{
  let available=false,loginWrites=0;
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/auth/login'))loginWrites++;
    if(path.endsWith('/auth/me')&&!available)return route.fulfill({status:503,json:{success:false,code:'SERVICE_UNAVAILABLE'}});
    const data=path.endsWith('/auth/me')?{id:'2',username:'fixture',userType:'NORMAL'}:null;
    return route.fulfill({json:{success:true,data}});
  });
  await page.goto('/chat');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('暂时无法确认登录状态，请联网后重试。',{exact:true})).toBeVisible();
  available=true;
  await page.getByRole('button',{name:'重新确认原登录（不提交密码）',exact:true}).click();
  await expect(page).toHaveURL(/\/chat$/);
  expect(loginWrites).toBe(0);
});
