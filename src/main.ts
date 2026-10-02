import { mount } from 'svelte';
import App from './App.svelte';
import Tooltip from './components/Tooltip.svelte';

const app = mount(App, { target: document.getElementById('app')! });
mount(Tooltip, { target: document.body });

export default app;
