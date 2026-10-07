import { mount } from 'svelte';
import './app.css';
import Auth from './Auth.svelte';
import Tooltip from './components/Tooltip.svelte';

const app = mount(Auth, { target: document.getElementById('app')! });
mount(Tooltip, { target: document.body });

export default app;
