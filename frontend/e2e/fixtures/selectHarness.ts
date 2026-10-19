import {createApp,h,nextTick,ref} from 'vue';
import AppSelect from '../../src/components/controls/AppSelect.vue';
export function mountSelectHarness(){
  const host=document.createElement('div');host.id='select-harness';document.body.append(host);
  Object.assign(host.style,{position:'fixed',inset:'130px 20px auto auto',zIndex:'999',background:'#222',padding:'20px'});
  const selected=ref(2),busy=ref(false),message=ref(''),more=ref(false);
  const app=createApp({setup(){return()=>h('form',{onSubmit:(e:Event)=>{e.preventDefault();message.value='submitted';}},[
    h(AppSelect,{modelValue:selected.value,modelModifiers:{number:true},'aria-label':'数字选择',name:'duration','onUpdate:modelValue':(v:number)=>{selected.value=v;}},()=>[h('option',{value:1},'One'),h('option',{value:2},'Two'),h('option',{value:3,disabled:true},'Disabled'),h('option',{value:4},'Four'),...(more.value?[h('option',{value:5},'Five')]:[])]),
    h('output',{'aria-label':'值与类型'},`${selected.value}:${typeof selected.value}`),
    h(AppSelect,{value:'ask',disabled:busy.value,'aria-label':'异步偏好',onChange:async(e:Event)=>{busy.value=true;await new Promise(r=>setTimeout(r,50));(e.target as HTMLSelectElement).value='ask';busy.value=false;message.value='保存失败';}},()=>[h('option',{value:'ask'},'每次询问'),h('option',{value:'quit'},'退出程序')]),
    h(AppSelect,{required:true,'aria-label':'必选项',name:'required'},()=>[h('option',{value:''},'请选择'),h('option',{value:'ok'},'Okay')]),
    h('button',{type:'button',onClick:()=>{more.value=!more.value;}},'更新选项'),h('button',{type:'reset'},'重置表单'),h('button',{type:'submit'},'提交表单'),h('p',{role:'status','aria-label':'表单反馈'},message.value)
  ]);}});
  app.mount(host);return nextTick();
}
