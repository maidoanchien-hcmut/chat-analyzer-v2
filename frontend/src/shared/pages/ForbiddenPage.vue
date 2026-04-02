<template>
  <section class="content-card stack-md" style="max-width: 720px; margin: 0 auto">
    <div class="pill">403</div>
    <PageHeader
      eyebrow="Không có quyền"
      title="Bạn không có quyền vào màn này"
      description="Permission gate ở frontend đã chặn route này. Backend vẫn là nguồn sự thật cuối cùng."
    />
    <div class="button-row">
      <RouterLink class="button button-primary" :to="{ name: 'dashboard' }">
        Về tổng quan
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
</script>
