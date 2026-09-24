const BASE = window.location.pathname.includes('/pages/') || window.location.pathname.includes('/admin/') ? '../' : '';

const pageData = {
  guardian: {
    name: 'Guardian',
    description: 'Una aventura cooperativa independiente.',
    genre: 'Aventura cooperativa',
    platform: 'Windows',
    status: 'En desarrollo',
    version: '0.1.0'
  }
};

const query = new URLSearchParams(location.search);
const game = pageData[query.get('id') || query.get('game') || 'guardian'] || pageData.guardian;

const NAV_LINKS = [
  ['Juegos', 'juegos.html', 'games'],
  ['Noticias', 'noticias.html', 'news'],
  ['Descargar', 'descargar.html?game=guardian', 'download'],
  ['Apoyar', 'donar.html', 'support'],
  ['Sobre nosotros', 'sobre-nosotros.html', 'about']
];

function currentSection() {
  const path = location.pathname.toLowerCase();
  if (path.includes('/juegos.html') || path.includes('/juego.html')) return 'games';
  if (path.includes('/noticias.html') || path.includes('/noticia.html')) return 'news';
  if (path.includes('/descargar.html')) return 'download';
  if (path.includes('/donar.html')) return 'support';
  if (path.includes('/sobre-nosotros.html')) return 'about';
  return '';
}

function navLink([label, href, section]) {
  const active = currentSection() === section;
  return `<a href="${BASE}pages/${href}"${active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
}

function header() {
  return `<header class="site-header" id="header">
    <div class="container nav">
      <a class="brand" href="${BASE}index.html" aria-label="EME GAMES — Inicio"><img src="${BASE}assets/images/eme-games-logo.png" alt="EME GAMES"><span>EME GAMES</span></a>
      <nav class="nav-links" aria-label="Navegación principal">${NAV_LINKS.map(navLink).join('')}</nav>
      <div class="nav-account" aria-label="Cuenta"><a href="${BASE}pages/login.html">Iniciar sesión</a><a href="${BASE}pages/registro.html" class="button button-primary nav-create">Crear cuenta</a></div>
      <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Abrir menú" aria-controls="mobile-menu" aria-expanded="false">☰</button>
    </div>
    <div class="mobile-menu" id="mobile-menu" aria-label="Navegación móvil">${NAV_LINKS.map(navLink).join('')}<a href="${BASE}pages/login.html">Iniciar sesión</a><a href="${BASE}pages/registro.html">Crear cuenta</a></div>
  </header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container"><div class="footer-top"><div class="footer-brand"><img src="${BASE}assets/images/eme-games-logo.png" alt="EME GAMES"><p>Estudio independiente. Juegos propios, experiencias compartidas.</p></div><div class="footer-links"><div><h4>Explorar</h4><a href="${BASE}pages/juegos.html">Juegos</a><a href="${BASE}pages/noticias.html">Noticias</a><a href="${BASE}pages/descargar.html?game=guardian">Descargar</a></div><div><h4>Estudio</h4><a href="${BASE}pages/donar.html">Apoyar</a><a href="${BASE}pages/sobre-nosotros.html">Sobre nosotros</a></div><div><h4>Cuenta</h4><a href="${BASE}pages/login.html">Iniciar sesión</a><a href="${BASE}pages/registro.html">Crear cuenta</a><a href="${BASE}pages/perfil.html">Perfil</a></div></div></div><div class="footer-bottom"><span>© <span data-current-year></span> EME GAMES</span><span><a href="${BASE}pages/privacidad.html">Política de privacidad</a> · <a href="${BASE}pages/terminos.html">Términos de uso</a></span></div></div></footer>`;
}

function setupNavigation() {
  const menu = document.getElementById('mobile-menu');
  const toggle = document.getElementById('menu-toggle');
  if (!menu || !toggle) return;
  const closeMenu = () => { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Abrir menú'); };
  toggle.addEventListener('click', () => { const open = menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
}

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
}

function setupHeaderScroll() {
  const headerEl = document.getElementById('header');
  if (!headerEl) return;
  const update = () => headerEl.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function shell() {
  document.getElementById('site-header').innerHTML = header();
  document.getElementById('site-footer').innerHTML = footer();
  setupNavigation();
  setupHeaderScroll();
  setCurrentYear();
  document.dispatchEvent(new CustomEvent("eme:header-ready"));
}

function boot() {
  shell();
  document.querySelectorAll('[data-game-name]').forEach(el => el.textContent = game.name);
  document.querySelectorAll('[data-game-desc]').forEach(el => el.textContent = game.description);
  document.querySelectorAll('[data-game-version]').forEach(el => el.textContent = game.version);
  document.querySelectorAll('[data-game-platform]').forEach(el => el.textContent = game.platform);
  document.querySelectorAll('[data-game-status]').forEach(el => el.textContent = game.status);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
