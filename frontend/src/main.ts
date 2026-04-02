import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { registerPermissionDirective } from "@/modules/auth/directives/permission";
import { vuetify } from "@/plugins/vuetify";
import { router } from "@/router";
import "./styles.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(vuetify);
registerPermissionDirective(app, pinia);
app.mount("#app");
