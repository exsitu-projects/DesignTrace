import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/main.css'
import 'bootstrap'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
const app = createApp(App)

app.use(createPinia())
app.mount('#app')
