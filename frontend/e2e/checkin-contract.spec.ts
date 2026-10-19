import {expect,test} from '@playwright/test';
import {validateCloudRequest} from '../../desktop/src/main/cloud/policy';

for(const drawType of ['FORTUNE','TAROT'] as const){
  test(`check-in ${drawType} sends a request accepted by the real desktop policy`,async({page},info)=>{
    let attempts=0;
    await page.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      let data:any=null;
      if(path==='/api/auth/me')data={id:'2',username:'fixture',userType:'NORMAL'};
      else if(path==='/api/auth/csrf')data={token:'checkin-test-token'};
      else if(path==='/api/focus/overview'||path==='/api/focus/checkin/today')data={checkedIn:false,level:1,exp:0,nextLevelExp:2,levelProgress:0};
      else if(path==='/api/focus/audio')data=[];
      else if(path==='/api/focus/checkin'){
        attempts++;
        const request=validateCloudRequest({method:req.method(),path:path.slice(4)+url.search});
        expect(request.path).toBe(`/focus/checkin?drawType=${drawType}`);
        expect(req.postData()).toBeFalsy();
        expect(req.headers()['x-csrf-token']).toBe('checkin-test-token');
        data={checkedIn:true,level:1,exp:1,nextLevelExp:2,levelProgress:50,drawType,title:'测试学习提示',explanation:'这是隔离接口回归数据。'};
      }
      await route.fulfill({json:{success:true,data}});
    });
    await page.goto('/focus');
    await page.getByRole('button',{name:'今日签到',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'今日签到'});
    await dialog.getByRole('button',{name:drawType==='FORTUNE'?/抽一支签/:/抽一张塔罗/}).click();
    await expect(dialog.getByRole('heading',{name:'测试学习提示'})).toBeVisible();
    await expect(dialog.getByText('1 / 2 EXP',{exact:true})).toBeVisible();
    await expect(dialog.locator('.inline-error')).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:/抽一支签/})).toBeDisabled();
    await expect(dialog.getByRole('button',{name:/抽一张塔罗/})).toBeDisabled();
    expect(attempts).toBe(1);
    await page.screenshot({path:info.outputPath(`checkin-${drawType}.png`)});
  });
}
