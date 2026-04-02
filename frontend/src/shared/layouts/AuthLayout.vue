<template>
  <div class="auth-layout">
    <main class="auth-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-main {
  width: min(100%, 420px);
}

@media (max-width: 640px) {
  .auth-layout {
    padding: 16px;
  }

  .auth-main {
    width: 100%;
  }
}
</style>
