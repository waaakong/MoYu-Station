<template>
  <dialog ref="dialog" class="admin-modal sr-glass sr-glass--floating" aria-labelledby="reverify-title" @keydown="containDialogFocus" @cancel.prevent="cancel">
    <form @submit.prevent="submit">
      <h2 id="reverify-title">确认管理员身份</h2>
      <p>“{{ action }}”属于高风险操作。请输入当前账号密码；通过后仅重放这一次操作。</p>
      <label>当前密码<div class="admin-password-wrap"><input ref="input" v-model="password" :type="visible?'text':'password'" autocomplete="current-password" required :disabled="busy" @keyup="caps=$event.getModifierState('CapsLock')"/><button type="button" :aria-pressed="visible" @click="visible=!visible">{{ visible?'隐藏':'显示' }}</button></div></label>
      <small v-if="caps">大写锁定已开启</small>
      <span v-if="error" class="admin-form-error" role="alert">{{ error }}</span>
      <footer><button type="button" :disabled="busy" @click="cancel">取消</button><button class="primary" type="submit" :disabled="busy">{{ busy?'验证中…':'验证并继续' }}</button></footer>
    </form>
  </dialog>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import { nextTick,onBeforeUnmount,onMounted,ref } from "vue";
import { containDialogFocus } from "./dialogFocus";
const props=defineProps<{action:string;busy:boolean;error:string}>();
const emit=defineEmits<{cancel:[];confirm:[password:string]}>();
const password=ref(""),visible=ref(false),caps=ref(false),input=ref<HTMLInputElement>(),dialog=ref<HTMLDialogElement>();
let trigger:HTMLElement|null=null;
function submit(){if(password.value&&!props.busy)emit("confirm",password.value);}
function cancel(){if(!props.busy){password.value='';closeMotionDialog(dialog.value,false,()=>emit("cancel"));}}
onMounted(async()=>{trigger=document.activeElement as HTMLElement;openMotionDialog(dialog.value);await nextTick();input.value?.focus();});
onBeforeUnmount(()=>{closeMotionDialog(dialog.value, true);password.value="";trigger?.focus();});
</script>
<style scoped>
form{display:grid;gap:16px}p{margin:0;color:var(--sr-color-text-muted);font-size:14px;line-height:1.7}footer{margin-top:4px}
</style>
