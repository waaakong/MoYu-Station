<template><OverlayDialog :open="true" :label="title" alert @close="$emit('cancel')"><section class="admin-modal sr-glass sr-glass--floating"><p>CONFIRM ACTION</p><h2>{{ title }}</h2><span>{{ message }}</span><footer><button type="button" @click="$emit('cancel')">取消</button><button class="danger" type="button" @click="$emit('confirm')">确认</button></footer></section></OverlayDialog></template><script setup lang="ts">import OverlayDialog from '../../components/controls/OverlayDialog.vue';defineProps<{title:string;message:string}>();defineEmits<{cancel:[];confirm:[]}>();</script>
<style scoped>
.admin-modal button.danger{border-color:rgba(255,133,123,.3);background:rgba(154,54,48,.22);color:#ffd5d1}
</style>
