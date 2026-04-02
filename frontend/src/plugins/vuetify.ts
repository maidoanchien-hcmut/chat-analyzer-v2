import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";

export const vuetify = createVuetify({
  defaults: {
    global: {
      ripple: false
    },
    VAppBar: {
      flat: true,
      height: 76
    },
    VBtn: {
      rounded: "xl"
    },
    VCard: {
      rounded: "xl",
      elevation: 0
    },
    VNavigationDrawer: {
      elevation: 0
    },
    VSelect: {
      density: "comfortable",
      variant: "outlined"
    },
    VTextField: {
      density: "comfortable",
      variant: "outlined"
    }
  },
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: {
      mdi
    }
  },
  theme: {
    defaultTheme: "clinicConsole",
    themes: {
      clinicConsole: {
        dark: false,
        colors: {
          background: "#f5f1ea",
          surface: "#ffffff",
          primary: "#0f766e",
          secondary: "#c2410c",
          info: "#155e75",
          success: "#15803d",
          warning: "#b45309",
          error: "#b91c1c"
        }
      }
    }
  }
});
