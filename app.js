'use strict';
// v17
console.log('El Timón v17 loaded');

// --- Configuración
const WA_NUMBER = '34662409381';
const CSV_PATH = 'productos.csv';
const IMG_BASE = 'Imagenes/';

// Marca/desmarca el estado de banners activos para CSS
function setBannersActive(active){
  try{
    (document.body || document.documentElement)
      .classList.toggle('banners-active', !!active);
  }catch(e){}
}
const PROFILE_KEY = 'elTimon.profile';

// Categorías (semilla inicial; se unirán a las detectadas en CSV)
const CATEGORIES_SEED = [
  'Verduras',
  'Salteados y Revueltos',
  'Precocinados',
  'Pescados Y Mariscos',
  'Postres y Helados',
  'Estuchados'
];
let CATS = CATEGORIES_SEED.slice();

// Normalización + sinónimos
const CAT_SYNONYMS = {
  // Precocinados / erratas
  'precocinados': 'precocinados',
  'pre cocinados': 'precocinados',
  'pre-cocinados': 'precocinados',
  'predocinados': 'precocinados',

  // Pescados y mariscos / variantes
  'pescados y mariscos': 'pescados y mariscos',
  'pescados y marisco':  'pescados y mariscos',
  'pescado y mariscos':  'pescados y mariscos',
  'pescado y marisco':   'pescados y mariscos'
};

const hasNormalize = () => { try { return typeof ''.normalize === 'function'; } catch(e){ return false; } };
const stripDiacritics = s => hasNormalize() ? (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'') : (s||'');
const norm = s => stripDiacritics((s||'').toLowerCase()).replace(/\s+/g,' ').trim();
const mapSyn = s => CAT_SYNONYMS[s] || s;
const sameCategory = (a,b) => {
  const na = mapSyn(norm(a)), nb = mapSyn(norm(b));
  return na === nb || na.includes(nb) || nb.includes(na);
};

// Reglas por categoría
function ruleForCategory(cat){
  const n = norm(mapSyn(cat));
  if(n==='estuchados' || n==='postres y helados') return 'solo_unidades';
  if(n==='precocinados' || n==='pescados y mariscos') return 'solo_peso';
  return 'solo_peso';
}

// Estado
let allProducts = [];
let filtered = [];
let cart = [];    // {id,categoria,nombre,precio,peso,imagen,unitType:'g'|'u', grams:number, units:number}
let lastAddedId = null;
let filteredByUser = false;
let afterProfileGoCheckout = false;
let __profileJustVerified = false;
let __profileSessionOK = false; // verificación de perfil en esta sesión

// Utilidades
const fmtEUR = v => (v||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
try{ __profileSessionOK = sessionStorage.getItem('profile_session_ok')==='1'; }catch(e){}
const slug = s => stripDiacritics((s||'').toLowerCase()).replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const weightOptions = () => [250,500,750,1000];
const clampWeight = v => { const o = weightOptions(); for(let i=0;i<o.length;i++) if(v<=o[i]) return o[i]; return o[o.length-1]; };

// Perfil (registro mínimo)
function getProfile(){
  try{ return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; }catch(e){ return {}; }
}
function saveProfile(p){ 
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    // Verificar que se guardó correctamente
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if(!saved || !saved.nombre || !saved.telefono){
      console.error('Error: Los datos no se guardaron correctamente');
      return false;
    }
    return true;
  } catch(e) {
    console.error('Error al guardar perfil:', e);
    return false;
  }
}
function isProfileComplete(p){ return p && p.nombre && p.telefono; }

// ---------- Consentimientos RGPD ----------
const CONSENT_LOCAL_KEY = 'elTimon.localDataConsent';
const CONSENT_PROMOS_KEY = 'elTimon.promosConsent';

function getLocalDataConsent(){
  try{ return localStorage.getItem(CONSENT_LOCAL_KEY) || null; }catch(e){ return null; }
}
function getPromosConsent(){
  try{ return localStorage.getItem(CONSENT_PROMOS_KEY) || null; }catch(e){ return null; }
}
function saveLocalDataConsent(value){
  try{ localStorage.setItem(CONSENT_LOCAL_KEY, value); }catch(e){}
  // Si el usuario rechaza guardar datos, borrar todos los datos existentes
  if(value==='no'){
    try{
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(ORDERS_KEY);
      localStorage.removeItem(FAVORITES_KEY);
    }catch(e){}
  }
}
function savePromosConsent(value){
  try{ localStorage.setItem(CONSENT_PROMOS_KEY, value); }catch(e){}
}
function hasLocalDataConsent(){
  const consent = getLocalDataConsent();
  // Si hay consentimiento explícito "yes", retornar true
  if(consent === 'yes') return true;
  // Si hay consentimiento explícito "no", retornar false
  if(consent === 'no') return false;
  // Si no hay consentimiento guardado pero hay datos existentes (perfil, pedidos o favoritos),
  // asumir consentimiento tácito previo y permitir continuar guardando
  const hasProfile = !!getProfile().nombre;
  const hasOrders = loadOrders().length > 0;
  const hasFavorites = loadFavorites().length > 0;
  if(hasProfile || hasOrders || hasFavorites){
    // Hay datos previos sin consentimiento explícito, permitir guardar (consentimiento tácito)
    return true;
  }
  // Sin consentimiento y sin datos previos, no permitir guardar
  return false;
}
function openProfile(goCheckout=false){
  afterProfileGoCheckout = !!goCheckout;
  const m = document.getElementById('profileModal'); if(!m) return;
  // Cargar datos del perfil si existe
  const profile = getProfile();
  document.getElementById('pf_nombre').value = profile.nombre || '';
  document.getElementById('pf_telefono').value = profile.telefono || '';
  document.getElementById('pf_direccion').value = profile.direccion || '';
  document.getElementById('pf_zona').value = profile.zona || '';
  document.getElementById('pf_notas').value = profile.notas || '';
  const entrega = document.getElementById('pf_entrega');
  if(entrega) entrega.value = profile.entrega || 'recogida';
  // Cargar consentimientos guardados
  const localConsent = getLocalDataConsent();
  if(localConsent){
    const localYes = document.getElementById('local-consent-yes');
    const localNo = document.getElementById('local-consent-no');
    if(localYes && localNo){
      localYes.checked = (localConsent==='yes');
      localNo.checked = (localConsent==='no');
    }
  }
  const promosConsent = getPromosConsent();
  if(promosConsent){
    const promosYes = document.getElementById('promo-consent-yes');
    const promosNo = document.getElementById('promo-consent-no');
    if(promosYes && promosNo){
      promosYes.checked = (promosConsent==='yes');
      promosNo.checked = (promosConsent==='no');
    }
  }
  m.classList.add('open');
}
function closeProfile(){
  afterProfileGoCheckout = false;
  document.getElementById('profileModal').classList.remove('open');
  scrollToTopSafe();
}
function bindProfile(){
  const btn = document.getElementById('profileBtn');
  if(btn) btn.addEventListener('click', ()=> openProfile(false));
  const cancel = document.getElementById('cancelProfileBtn');
  if(cancel) cancel.addEventListener('click', closeProfile);
  const form = document.getElementById('profileForm');
  if(form) form.addEventListener('submit', (e)=>{
    e.preventDefault();
    // Obtener consentimiento de almacenamiento local (obligatorio)
    const localConsentEl = document.querySelector('input[name="localDataConsent"]:checked');
    if(!localConsentEl){
      alert('Debes indicar si aceptas que se guarden tus datos en este dispositivo.');
      return;
    }
    const localConsent = localConsentEl.value;
    
    // Obtener consentimiento de promociones (obligatorio)
    const promosConsentEl = document.querySelector('input[name="promoConsent"]:checked');
    if(!promosConsentEl){
      alert('Debes indicar si deseas recibir promociones y ofertas.');
      return;
    }
    const promosConsent = promosConsentEl.value;
    
    // Guardar consentimientos
    saveLocalDataConsent(localConsent);
    savePromosConsent(promosConsent);
    
    // Validar perfil
    const p = {
      nombre: document.getElementById('pf_nombre').value.trim(),
      telefono: document.getElementById('pf_telefono').value.trim(),
      entrega: document.getElementById('pf_entrega').value,
      direccion: document.getElementById('pf_direccion').value.trim(),
      zona: document.getElementById('pf_zona').value.trim(),
      notas: document.getElementById('pf_notas').value.trim()
    };
    if(!isProfileComplete(p)){ alert('Completa al menos Nombre y Teléfono'); return; }
    
    // Guardar perfil si hay consentimiento para almacenamiento local
    if(localConsent === 'yes'){
      try {
        saveProfile(p);
        try{ sessionStorage.setItem('profile_session_ok','1'); __profileSessionOK = true; }catch(e){}
        // Verificar que se guardó correctamente
        const saved = getProfile();
        if(saved && saved.nombre && saved.telefono){
          showToast('Datos guardados correctamente');
        } else {
          showToast('Error al guardar los datos. Por favor, inténtalo de nuevo.');
          console.error('Error: Los datos no se guardaron correctamente');
        }
      } catch(e) {
        console.error('Error al guardar perfil:', e);
        showToast('Error al guardar los datos. Por favor, inténtalo de nuevo.');
      }
    }else{
      // Aunque no se guarden, mantener los datos en el formulario para poder usarlos en el pedido
      // Marcar como "verificado" temporalmente para permitir checkout
      try{ sessionStorage.setItem('profile_session_ok','1'); __profileSessionOK = true; }catch(e){}
      showToast('Datos listos para el pedido. Los datos no se guardarán en este dispositivo.');
    }
    
    closeProfile();
    if(afterProfileGoCheckout){ __profileJustVerified = true; openCheckout(); }
  });
}

// -------- Favoritos --------
const FAVORITES_KEY = 'elTimon.favorites';
function loadFavorites(){
  try{ return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; }catch(e){ return []; }
}
function saveFavorites(favs){
  // Solo guardar si hay consentimiento para almacenamiento local
  if(!hasLocalDataConsent()){
    console.warn('No hay consentimiento para guardar favoritos');
    return false;
  }
  try{ 
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    // Verificar que se guardó correctamente
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    if(JSON.stringify(saved) !== JSON.stringify(favs)){
      console.error('Error: Los favoritos no se guardaron correctamente');
      return false;
    }
    return true;
  }catch(e){
    console.error('Error al guardar favoritos:', e);
    return false;
  }
}
function isFavorite(id){ const favs = loadFavorites(); return favs.includes(id); }
function toggleFavorite(id){
  // Verificar consentimiento antes de guardar
  if(!hasLocalDataConsent()){
    showToast('Para guardar favoritos, acepta guardar datos en "Mis datos"');
    // Retornar el estado actual, no el nuevo estado
    return isFavorite(id);
  }
  const favs = loadFavorites();
  const idx = favs.indexOf(id);
  let newState;
  if(idx>-1){ 
    favs.splice(idx,1); 
    newState = false;
  } else{ 
    favs.push(id); 
    newState = true;
  }
  // Guardar y verificar que se guardó correctamente
  const saved = saveFavorites(favs);
  if(saved){
    // Verificar que realmente se guardó leyendo de nuevo
    const verified = isFavorite(id);
    if(verified !== newState){
      console.error('Error: El estado del favorito no coincide después de guardar');
      showToast('Error al guardar favorito. Por favor, inténtalo de nuevo.');
      return isFavorite(id); // Retornar el estado anterior
    }
    return verified;
  } else {
    console.error('Error: No se pudieron guardar los favoritos');
    showToast('Error al guardar favorito. Por favor, inténtalo de nuevo.');
    return isFavorite(id); // Retornar el estado anterior
  }
}

// -------- Histórico de Pedidos --------
const ORDERS_KEY = 'elTimon.orders';
function loadOrders(){
  try{ return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }catch(e){ return []; }
}
function saveOrders(orders){
  // Solo guardar si hay consentimiento para almacenamiento local
  if(!hasLocalDataConsent()){
    return;
  }
  try{ localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }catch(e){}
}
function buildOrderFromCart(source){
  // Obtener perfil: primero de localStorage, si no existe, intentar del formulario actual
  let p = getProfile();
  // Si no hay perfil guardado, intentar obtenerlo del formulario (para pedidos sin consentimiento)
  if(!p || !p.nombre || !p.telefono){
    const nombreEl = document.getElementById('pf_nombre');
    const telefonoEl = document.getElementById('pf_telefono');
    const entregaEl = document.getElementById('pf_entrega');
    const direccionEl = document.getElementById('pf_direccion');
    const zonaEl = document.getElementById('pf_zona');
    const notasEl = document.getElementById('pf_notas');
    if(nombreEl && telefonoEl){
      p = {
        nombre: nombreEl.value.trim() || p.nombre || '-',
        telefono: telefonoEl.value.trim() || p.telefono || '-',
        entrega: entregaEl ? entregaEl.value : (p.entrega || 'recogida'),
        direccion: direccionEl ? direccionEl.value.trim() : (p.direccion || ''),
        zona: zonaEl ? zonaEl.value.trim() : (p.zona || ''),
        notas: notasEl ? notasEl.value.trim() : (p.notas || '')
      };
    }
  }
  return {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    source: source || 'manual',
    customer: { nombre: p.nombre || '-', telefono: p.telefono || '-', entrega: p.entrega || 'recogida', direccion: p.direccion || '', zona: p.zona || '', notas: p.notas || '' },
    items: JSON.parse(JSON.stringify(cart)),
    total: estimateTotal()
  };
}
function addOrderFromCart(source){
  if(!cart || cart.length===0) return;
  // Construir el pedido ANTES de verificar el consentimiento, para asegurarnos de que tenemos los datos
  const order = buildOrderFromCart(source);
  // Solo guardar pedido en historial si hay consentimiento para almacenamiento local
  // Los pedidos por WhatsApp siempre funcionan (usan los datos sin guardarlos si no hay consentimiento)
  if(hasLocalDataConsent()){
    const orders = loadOrders();
    orders.unshift(order);
    saveOrders(orders);
  }
  // Si no hay consentimiento, el pedido se envía igual por WhatsApp pero no se guarda en historial
}

// -------- Render inicial (antes del CSV) --------
function renderSeedCategories(){
  const menus = document.querySelectorAll('#categoryMenuTop, #categoryMenu, #categoryMenuMobile');
  if(!menus.length) return;

  function makeButton(label, className, onClick){
    const b = document.createElement('button');
    b.type = 'button';
    if (className) b.className = className;
    b.textContent = label;
    b.addEventListener('click', function(){
      const menu = b.closest('.menu');
      if(menu){ menu.querySelectorAll('button').forEach(x => x.classList.remove('active')); }
      b.classList.add('active');
      onClick();
      // Cerrar panel de categorías móvil después de seleccionar
      closeCategoriesPanel();
    });
    return b;
  }

  // CATS canónico y único (por si viniera con duplicados)
  const seen = new Set();
  const cats = [];
  for(const raw of (CATS || [])){
    const canon = normalizeCategoryName(raw);
    if(!canon || seen.has(canon)) continue;
    seen.add(canon);
    const label = canon.charAt(0).toUpperCase() + canon.slice(1);
    cats.push({ canon, label });
  }

  menus.forEach(menu => {
    if(!menu) return;
    menu.innerHTML = '';

    // "Todos"
    const btnTodos = makeButton('Todos', 'cat', ()=>{
      filteredByUser = false;
      filtered = allProducts.slice();
      renderProducts();
    });
    if(!filteredByUser) btnTodos.classList.add('active');
    menu.appendChild(btnTodos);

    // Ofertas y Novedades
    const btnOfertas = makeButton('Ofertas', 'promo-btn', ()=>{
      filteredByUser = true;
      filtered = allProducts.filter(isOferta);
      renderProducts();
    });
    const btnNovedades = makeButton('Novedades', 'promo-btn', ()=>{
      filteredByUser = true;
      filtered = allProducts.filter(isNovedad);
      renderProducts();
    });
    menu.appendChild(btnOfertas);
    menu.appendChild(btnNovedades);

    // Categorías
    for(const c of cats){
      const btn = makeButton(c.label, 'cat', ()=>{
        filteredByUser = true;
        filtered = allProducts.filter(p => normalizeCategoryName(p.categoria) === c.canon);
        renderProducts();
      });
      menu.appendChild(btn);
    }

    // Favoritos
    const btnFavoritos = makeButton('Favoritos', 'promo-btn', ()=>{
      openFavoritesPanel();
    });
    menu.appendChild(btnFavoritos);
  });
}

// === Promos: utilidades y helpers (Ofertas/Novedades) ===
function hasTag(val, tag){
  if(!val) return false;
  const t = stripDiacritics(String(val).toLowerCase());
  const s = stripDiacritics(String(tag).toLowerCase());
  return new RegExp('(^|,|\s)'+s+'(,|\s|$)').test(t);
}
function isTrueish(v){
  if(v===true) return true;
  const s = String(v||'').trim().toLowerCase();
  return ['1','si','sí','true','ok','x'].includes(s);
}
function isOferta(p){
  if(isTrueish(p.oferta)) return true;
  if(hasTag(p.etiquetas,'oferta') || hasTag(p.tags,'oferta')) return true;
  const n = stripDiacritics((p.nombre||'').toLowerCase());
  if(/\boferta\b/.test(n) || n.includes('[oferta]') || n.includes('oferta:')) return true;
  return false;
}
function isNovedad(p){
  if(isTrueish(p.novedad)) return true;
  if(hasTag(p.etiquetas,'novedad') || hasTag(p.tags,'novedad')) return true;
  const n = stripDiacritics((p.nombre||'').toLowerCase());
  if(/\bnovedad\b/.test(n) || n.includes('[novedad]') || n.includes('novedad:')) return true;
  return false;
}


function normalizeCategoryName(name){
  if(!name) return '';
  const base = stripDiacritics(String(name).toLowerCase()).replace(/\s+/g,' ').trim();
  return CAT_SYNONYMS[base] || base;
}
// -------- Carga CSV --------
async function loadProducts(){
  try{
    const res = await fetch(CSV_PATH, {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status+' al solicitar '+CSV_PATH);
    const txt = await res.text();
    allProducts = parseCSV(txt);
CATS = deriveCategoriesFromCSV(allProducts);
renderSeedCategories();
renderProducts();
CATS = deriveCategoriesFromCSV(allProducts);
    renderSeedCategories(); // repinta categorías con CSV
    filtered = []; // mantiene __hero visible
    renderProducts();
  }catch(err){
    console.error('Error al cargar CSV:', err);
    const panel = document.getElementById('productGrid');
    if(panel){
      panel.innerHTML = '<div class="card" style="padding:1rem">'+
        '<strong>No se pudo cargar <code>'+CSV_PATH+'</code></strong><br>'+
        '<div class="muted" style="margin-top:.25rem">Abre con un servidor local (Live Server o <code>python -m http.server</code>) o revisa la ruta del CSV.</div>'+
      '</div>';
    }
  }
}

// -------- CSV parsing --------
function parseCSV(text){
  const raw = text.split(/\r?\n/).filter(l => l.trim().length);
  if(!raw.length) return [];
  const first = raw[0];
  const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
  const hasHeader = /categoria|categoría|nombre|precio|peso|imagen/i.test(first);
  const lines = hasHeader ? raw.slice(1) : raw;
  const rows = [];
  for(let i=0;i<lines.length;i++){
    const parts = lines[i].split(delim).map(x=>x.trim());
    if(parts.length < 5) continue;
    const [categoria,nombre,precioStr,peso,imagen] = parts;
    const precio = parseFloat((precioStr||'0').replace(',','.')) || 0;
    const id = `${slug(categoria)}-${slug(nombre)}-${rows.length}`;
    let extra = {}; try{ extra = r; }catch(_){}
    rows.push(Object.assign({id,categoria,nombre,precio,peso,imagen}, extra));
  }
  return rows;
}

// Derivar categorías del CSV
function deriveCategoriesFromCSV(list){
  const seen = new Set();
  const result = [];
  const present = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;

  // 1) Semilla primero (canónico)
  for(const raw of (typeof CATEGORIES_SEED!=='undefined' && CATEGORIES_SEED) ? CATEGORIES_SEED : []){
    const canon = normalizeCategoryName(raw);
    if(canon && !seen.has(canon)){ seen.add(canon); result.push(present(canon)); }
  }

  // 2) CSV después (canónico)
  for(const p of (list||[])){
    const canon = normalizeCategoryName(p.categoria);
    if(canon && !seen.has(canon)){ seen.add(canon); result.push(present(canon)); }
  }

  return result;
}

// -------- Búsqueda --------
function applyFilters(){
  const q = (document.getElementById('searchInput')?.value || '').trim();
  filteredByUser = true;
  if(!q){ filtered = allProducts.slice(); renderProducts(); return; }
  const nq = norm(q);
  filtered = allProducts.filter(p=> p.nombre.toLowerCase().includes(q.toLowerCase()) || norm(p.categoria).includes(nq));
  renderProducts();
}
function bindSearch(){
  const form = document.getElementById('search');
  if(!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    applyFilters();
  });
}

// -------- Productos (sin inline JS) --------
function productCard(p){
  const src = p.imagen ? (IMG_BASE + p.imagen) : 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=';
  const showOferta  = (typeof isOferta==='function')  ? isOferta(p)  : false;
  const showNovedad = (typeof isNovedad==='function') ? isNovedad(p) : false;
  const pesoTxt = p.peso ? p.peso : 'El Kilo';
  const fav = isFavorite(p.id);
  return ''+
    '<div class="card" id="prod-'+p.id+'">'+
      '<div class="badge-wrap">'+
        (showOferta  ? '<span class="badge badge--oferta"  aria-label="Oferta">OFERTA</span>'  : '')+
        (showNovedad ? '<span class="badge badge--novedad" aria-label="Novedad">NOVEDAD</span>' : '')+
        '<button class="favorite-btn'+(fav?' active':'')+'" data-id="'+p.id+'" aria-label="'+(fav?'Quitar de':'Añadir a')+' favoritos" title="'+(fav?'Quitar de':'Añadir a')+' favoritos">❤️</button>'+
        '<img src="'+src+'" alt="'+displayName(p.nombre)+'">'+
      '</div>'+
      '<div class="content">'+
        '<div class="name">'+displayName(p.nombre)+'</div>'+
        '<div class="buy-row">'+
          '<span class="price-inline"><span class="price-amount">'+fmtEUR(p.precio)+'</span> · '+pesoTxt+'</span>'+
          '<button class="btn add-btn" data-id="'+p.id+'">Añadir</button>'+
        '</div>'+
      '</div>'+
    '</div>';
}

// Variable para evitar múltiples listeners
let gridClicksBound = false;

function bindGridClicks(){
  const __grid = document.getElementById('productGrid');
  if(!__grid) return;
  
  // Usar event delegation a nivel de document para capturar todos los clics, incluso en tarjetas ampliadas
  // Solo agregar el listener una vez
  if(!gridClicksBound){
    gridClicksBound = true;
    document.addEventListener('click', function(e){
    // Manejar botón "Añadir"
    const addBtn = e.target.closest('.add-btn');
    if(addBtn){
      e.preventDefault();
      e.stopPropagation();
      const id = addBtn.getAttribute('data-id');
      if(id) openQuantitySelector(id);
      return;
    }
    
    // Manejar botón de favoritos
    const favBtn = e.target.closest('.favorite-btn');
    if(favBtn){
      e.preventDefault();
      e.stopPropagation();
      const id = favBtn.getAttribute('data-id');
      if(id){
        const oldState = isFavorite(id);
        const newState = toggleFavorite(id);
        // Actualizar el estado visual del botón basándose en el estado real guardado
        favBtn.classList.toggle('active', newState);
        favBtn.setAttribute('aria-label', newState ? 'Quitar de favoritos' : 'Añadir a favoritos');
        favBtn.setAttribute('title', newState ? 'Quitar de favoritos' : 'Añadir a favoritos');
        // Mostrar mensaje solo si el estado cambió exitosamente
        if(oldState !== newState){
          showToast(newState ? 'Añadido a favoritos' : 'Eliminado de favoritos');
        }
      }
      return;
    }
    }, true); // Usar captura para que se ejecute antes que otros listeners
  }
  
  // Listener específico para el grid (solo para ampliar tarjetas)
  __grid.addEventListener('click', function(e){
    // Detectar clic en la tarjeta (pero no en botones, badges, ni en el contenido de botones)
    const card = e.target.closest('.card');
    // Verificar que no se hizo clic en ningún botón o badge
    const clickedButton = e.target.closest('button');
    const clickedBadge = e.target.closest('.badge');
    
    if(card && !clickedButton && !clickedBadge){
      // Alternar estado ampliado
      const isExpanded = card.classList.contains('expanded');
      // Cerrar todas las tarjetas ampliadas primero
      document.querySelectorAll('.card.expanded').forEach(c => {
        if(c !== card) c.classList.remove('expanded');
      });
      // Alternar la tarjeta actual
      card.classList.toggle('expanded', !isExpanded);
      // Agregar/quitar overlay
    }
  });
  
  // Listener separado para el overlay (está fuera del grid)
  const overlay = document.getElementById('cardExpandOverlay');
  if(overlay){
    overlay.addEventListener('click', function(e){
      // No cerrar si se hizo clic en un botón o dentro de una tarjeta ampliada
      const clickedCard = e.target.closest('.card.expanded');
      const clickedButton = e.target.closest('button');
      if(clickedCard || clickedButton){
        e.stopPropagation(); // Detener propagación para que no interfiera
        return; // No hacer nada, dejar que el evento se propague
      }
      // Cerrar todas las tarjetas ampliadas solo si se hizo clic directamente en el overlay
      document.querySelectorAll('.card.expanded').forEach(c => {
        c.classList.remove('expanded');
      });
      document.body.classList.remove('card-expanded');
    });
  }
}

function renderProducts(){
  const __grid = document.getElementById('productGrid');
  const __hero = document.getElementById('hero');
  const __banners = document.querySelector('.banners-grid');
  if(!__grid) return;

  // Cerrar cualquier tarjeta ampliada al renderizar nuevos productos
  document.querySelectorAll('.card.expanded').forEach(c => {
    c.classList.remove('expanded');
  });
  document.body.classList.remove('card-expanded');

  if(!filtered.length){
    if(filteredByUser){
      if(__hero) __hero.style.display = 'none';
      if(__banners) __banners.style.display = 'none';
      setBannersActive(false);
      __grid.innerHTML = '<div class="muted">No hay productos en esta categoría.</div>';
    }else{
      if(__hero) __hero.style.display = 'block';
      if(__banners) __banners.style.display = '';
      setBannersActive(true);
      __grid.innerHTML = '';
    }
    return;
  }

  if(__hero) __hero.style.display = 'none';
  if(__banners) __banners.style.display = 'none';
  setBannersActive(false);
  __grid.innerHTML = filtered.map(productCard).join('');
}
// -------- Toasts --------
function showToast(msg){
  const c = document.getElementById('toastContainer');
  if(!c) return;
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=> t.classList.add('hide'), 1800);
  setTimeout(()=> { if(c.contains(t)) c.removeChild(t); }, 2200);
}

// -------- Carrito --------
function defaultCartItem(p){
  const rule = ruleForCategory(p.categoria);
  const item = { id:p.id, categoria:p.categoria, nombre:p.nombre, precio:p.precio, peso:p.peso, imagen:p.imagen };
  if(rule==='solo_unidades'){ item.unitType = 'u'; item.units = 1; item.grams = 0; }
  else { item.unitType = 'g'; item.grams = 500; item.units = 0; }
  return item;
}
function findCartItemByIdAndType(id, unitType){
  for(let i=0;i<cart.length;i++){ if(cart[i].id===id && cart[i].unitType===unitType) return i; }
  return -1;
}
function addToCart(id){
  const p = allProducts.find(x=>x.id===id);
  if(!p) return;
  const item = defaultCartItem(p);
  const idx = findCartItemByIdAndType(id, item.unitType);
  if(idx>-1){
    if(item.unitType==='u'){ cart[idx].units = (cart[idx].units||1) + 1; }
    else{ const inc = 250; cart[idx].grams = clampWeight((cart[idx].grams||500) + inc); }
  }else{
    cart.push(item);
  }
  lastAddedId = id;
  updateCartCount();
  showToast('Añadido: '+p.nombre);
}

// -------- Selector de Cantidad --------
let currentQuantityProductId = null;

function openQuantitySelector(productId){
  const p = allProducts.find(x=>x.id===productId);
  if(!p){
    showToast('Producto no encontrado');
    return;
  }
  
  currentQuantityProductId = productId;
  const rule = ruleForCategory(p.categoria);
  const isUnits = rule === 'solo_unidades';
  
  const modal = document.getElementById('quantityModal');
  const content = document.getElementById('quantityModalContent');
  if(!modal || !content) return;
  
  // Construir el contenido del modal
  let html = '<div style="margin-bottom:1.5rem;">';
  html += '<strong style="display:block; margin-bottom:0.5rem; font-size:1.1em;">'+displayName(p.nombre)+'</strong>';
  html += '<div class="muted">'+p.categoria+' · '+fmtEUR(p.precio);
  if(p.peso) html += ' · '+p.peso;
  html += '</div>';
  html += '</div>';
  
  if(isUnits){
    // Selector de unidades
    html += '<div style="margin-bottom:1.5rem;">';
    html += '<label style="display:block; margin-bottom:0.5rem; font-weight:600;">Cantidad (unidades):</label>';
    html += '<input type="number" id="quantityInput" min="1" step="1" value="1" style="width:100%; padding:0.75rem; font-size:1.1em; border:1px solid var(--border); border-radius:0.5rem; box-sizing:border-box;" />';
    html += '</div>';
  } else {
    // Selector de gramos
    html += '<div style="margin-bottom:1.5rem;">';
    html += '<label style="display:block; margin-bottom:0.5rem; font-weight:600;">Cantidad (gramos):</label>';
    html += '<input type="number" id="quantityInput" min="0" step="50" value="0" placeholder="0 gramos" style="width:50%; padding:0.75rem; font-size:1.1em; border:1px solid var(--border); border-radius:0.5rem; box-sizing:border-box; margin-bottom:0.75rem;" />';
    
    // Botones rápidos para gramos
    html += '<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">';
    const weightOpts = weightOptions();
    weightOpts.forEach(g => {
      const kg = g >= 1000 ? (g/1000).toFixed(1) + ' kg' : g + ' g';
      html += '<button type="button" class="btn secondary" onclick="setQuickWeight('+g+')" style="flex:1; min-width:80px;">'+kg+'</button>';
    });
    html += '</div>';
    html += '</div>';
  }
  
  // Botones de acción
  html += '<div style="display:flex; gap:0.75rem; margin-top:1.5rem;">';
  html += '<button type="button" class="btn secondary" onclick="closeQuantityModal()" style="flex:1;">Cancelar</button>';
  html += '<button type="button" class="btn success" onclick="confirmQuantitySelection()" style="flex:1;">Añadir a la cesta</button>';
  html += '</div>';
  
  content.innerHTML = html;
  
  // Abrir modal
  modal.classList.add('open');
  
  // NO enfocar ni seleccionar el input automáticamente
}

function setQuickWeight(grams){
  const input = document.getElementById('quantityInput');
  if(input){
    input.value = grams;
    input.focus();
  }
}

function confirmQuantitySelection(){
  if(!currentQuantityProductId){
    closeQuantityModal();
    return;
  }
  
  const p = allProducts.find(x=>x.id===currentQuantityProductId);
  if(!p){
    showToast('Producto no encontrado');
    closeQuantityModal();
    return;
  }
  
  const input = document.getElementById('quantityInput');
  if(!input){
    closeQuantityModal();
    return;
  }
  
  const rule = ruleForCategory(p.categoria);
  const isUnits = rule === 'solo_unidades';
  
  let value = parseFloat(input.value) || 0;
  
  // Validar
  if(isUnits){
    if(isNaN(value) || value <= 0){
      showToast('Por favor, introduce una cantidad válida (mínimo 1 unidad)');
      return;
    }
    value = Math.max(1, Math.floor(value));
  } else {
    // Para gramos, validar que sea mayor a 0
    if(isNaN(value) || value <= 0){
      showToast('Por favor, introduce una cantidad mayor a 0 gramos');
      return;
    }
    // Redondear a múltiplos de 50 si es mayor a 0
    value = Math.max(50, Math.floor(value / 50) * 50);
  }
  
  // Crear el item del carrito
  const item = {
    id: p.id,
    categoria: p.categoria,
    nombre: p.nombre,
    precio: p.precio,
    peso: p.peso,
    imagen: p.imagen
  };
  
  if(isUnits){
    item.unitType = 'u';
    item.units = value;
    item.grams = 0;
  } else {
    item.unitType = 'g';
    item.grams = value;
    item.units = 0;
  }
  
  // Buscar si ya existe un item igual en el carrito
  const idx = findCartItemByIdAndType(p.id, item.unitType);
  if(idx > -1){
    // Si existe, sumar la cantidad
    if(isUnits){
      cart[idx].units = (cart[idx].units || 1) + value;
    } else {
      cart[idx].grams = (cart[idx].grams || 500) + value;
    }
  } else {
    // Si no existe, añadir nuevo item
    cart.push(item);
  }
  
  // Actualizar (el carrito se guarda automáticamente en otros lugares)
  renderCart();
  updateCartCount();
  lastAddedId = currentQuantityProductId;
  
  // Mostrar mensaje
  const quantityText = isUnits ? value + 'u' : value + 'g';
  showToast('Añadido: '+displayName(p.nombre)+' ('+quantityText+')');
  
  // Cerrar modal
  closeQuantityModal();
}

function closeQuantityModal(){
  const modal = document.getElementById('quantityModal');
  if(modal){
    modal.classList.remove('open');
  }
  currentQuantityProductId = null;
}
function gramsSelectHTML(selected){
  // Usar un input numérico con flechas en lugar de select
  // El valor inicial es el que el usuario eligió (o 500 por defecto)
  const value = selected || 500;
  return '<input type="number" min="50" step="10" value="'+value+'" onchange="changeGramsInput(this)" class="grams-input" style="width:100px; padding:0.4rem; border:1px solid var(--border); border-radius:0.4rem; text-align:center;" />';
}
function renderCart(){
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  if(cart.length===0){
    list.innerHTML=''; if(empty) empty.style.display='block';
    const ct = document.getElementById('cartTotal'); if(ct) ct.textContent = fmtEUR(0);
    updateCartCount(); return;
  }
  if(empty) empty.style.display='none';
  list.innerHTML = cart.map((i,idx)=>{
    const rule = ruleForCategory(i.categoria);
    const subtotal = getItemSubtotal(i);
    const controls = (rule==='solo_unidades')
      ? '<div class="cart-controls">'+
           '<input type="number" min="1" step="1" value="'+(i.units||1)+'" onchange="changeUnits('+idx+', this.value)" />'+
           '<span class="muted">unid.</span>'+
           '<button class="btn danger" onclick="removeItem('+idx+')">🗑️</button>'+
         '</div>'
      : '<div class="cart-controls">'+
           gramsSelectHTML(i.grams||500)+
           '<span class="muted" style="margin-left:0.5rem;">g</span>'+
           '<button class="btn danger" onclick="removeItem('+idx+')">🗑️</button>'+
         '</div>';
    return ''+
      '<div class="cart-item" data-idx="'+idx+'">'+
        '<div>'+
          '<strong>'+i.nombre+'</strong>'+
          '<div><small class="muted">'+i.categoria+' · <span class="price-amount">'+fmtEUR(subtotal)+'</span>'+(rule==='solo_unidades'?' ('+(i.units||1)+'u)':' ('+(i.grams||500)+'g)')+'</small></div>'+
        '</div>'+
        controls+
      '</div>';
  }).join('');
  const ct = document.getElementById('cartTotal'); if(ct) ct.textContent = fmtEUR(estimateTotal());
  updateCartCount();
}
function changeUnits(idx, val){
  const v = Math.max(1, parseInt(val||'1',10));
  cart[idx].units = v;
  renderCart();
}
function changeGrams(sel){
  // Mantener compatibilidad con código antiguo si existe
  let parent = sel.parentNode;
  while(parent && !parent.classList.contains('cart-item')) parent = parent.parentNode;
  const idx = parseInt(parent.getAttribute('data-idx'), 10);
  cart[idx].grams = parseInt(sel.value,10);
  renderCart();
}

function changeGramsInput(input){
  let parent = input.parentNode;
  while(parent && !parent.classList.contains('cart-item')) parent = parent.parentNode;
  const idx = parseInt(parent.getAttribute('data-idx'), 10);
  const value = Math.max(50, parseInt(input.value, 10) || 50);
  // Permitir cualquier valor personalizado (no redondear)
  cart[idx].grams = value;
  renderCart();
}
function removeItem(idx){ cart.splice(idx,1); renderCart(); }
function clearCart(close, silent){
  cart = []; renderCart(); updateCartCount(); 
  if(!silent){ showToast('Pedido cancelado'); }
  if(close){ toggleCart(false); }
}
function toggleCart(force){
  const el = document.getElementById('cart');
  if(!el) return;
  const shouldOpen = (force===true) ? true : (force===false) ? false : !el.classList.contains('open');
  if(shouldOpen){ 
    el.classList.add('open'); 
    renderCart();
    // Añadir clase al body para el overlay en móvil
    document.body.classList.add('cart-open');
  } else { 
    el.classList.remove('open');
    // Quitar clase del body
    document.body.classList.remove('cart-open');
  }
}
function totalCount(){
  let total = 0;
  for(const i of cart){ if(i.unitType==='u') total += (i.units||1); else total += 1; }
  return total;
}
function updateCartCount(){ const cc = document.getElementById('cartCount'); if(cc) cc.textContent = totalCount(); }
function continueShopping(){ toggleCart(false); scrollToLastAdded(); }
function scrollToLastAdded(){
  if(!lastAddedId) return;
  const el = document.getElementById('prod-'+lastAddedId);
  if(el){ el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.outline='2px solid var(--brand)'; setTimeout(()=>{ el.style.outline='none'; }, 1200); }
}

// Subtotal de un item individual
function getItemSubtotal(item){
  let factor = 1;
  if(ruleForCategory(item.categoria)==='solo_unidades'){
    factor = item.units || 1;
  }else{
    const pack = (item.peso||'').toLowerCase();
    const m = pack.match(/(\d+[\.,]?\d*)\s*(kg|g)/);
    let gramsPack = 1000;
    if(m){
      const val = parseFloat(m[1].replace(',','.'));
      gramsPack = (m[2]==='kg') ? val*1000 : val;
    }
    const gramsSel = item.grams || 500;
    factor = gramsSel / gramsPack;
  }
  return item.precio * factor;
}

// Total
function estimateTotal(){
  return cart.reduce((sum,i)=>{
    return sum + getItemSubtotal(i);
  }, 0);
}

// Checkout
function openCheckout(){
  if(cart.length===0){ alert('La cesta está vacía'); return; }
  if(!__profileSessionOK){ openProfile(true); return; }
  __profileJustVerified = false; // consumir el pase
  buildCheckoutSummary();
  document.getElementById('checkoutModal').classList.add('open');
}
function closeCheckout(){
  document.getElementById('checkoutModal').classList.remove('open');
  scrollToTopSafe();
}
function buildCheckoutSummary(){
  const box = document.getElementById('checkoutSummary');
  const info = document.getElementById('customerSummary');
  if(!box || !info) return;
  // Obtener perfil: primero de localStorage, si no existe, intentar del formulario actual
  let p = getProfile();
  // Si no hay perfil guardado, intentar obtenerlo del formulario (para pedidos sin consentimiento)
  if(!p || !p.nombre || !p.telefono){
    const nombreEl = document.getElementById('pf_nombre');
    const telefonoEl = document.getElementById('pf_telefono');
    const entregaEl = document.getElementById('pf_entrega');
    const direccionEl = document.getElementById('pf_direccion');
    const zonaEl = document.getElementById('pf_zona');
    const notasEl = document.getElementById('pf_notas');
    if(nombreEl && telefonoEl){
      p = {
        nombre: nombreEl.value.trim() || p.nombre || '-',
        telefono: telefonoEl.value.trim() || p.telefono || '-',
        entrega: entregaEl ? entregaEl.value : (p.entrega || 'recogida'),
        direccion: direccionEl ? direccionEl.value.trim() : (p.direccion || ''),
        zona: zonaEl ? zonaEl.value.trim() : (p.zona || ''),
        notas: notasEl ? notasEl.value.trim() : (p.notas || '')
      };
    }
  }
  info.innerHTML = ''+
    '<strong>Cliente</strong><br>'+
    (p.nombre || '-')+' — '+(p.telefono || '-')+'<br>'+
    'Entrega: '+(p.entrega==='domicilio'?'A domicilio':'Recogida en tienda')+'<br>'+
    (p.direccion ? 'Dirección: '+p.direccion+'<br>' : '')+
    (p.zona ? 'Zona/CP: '+p.zona+'<br>' : '')+
    (p.notas ? 'Notas: '+p.notas : '');

  // Crear una lista de productos donde cada uno está en su propia línea
  const productsList = cart.map(i => {
    const itemText = (ruleForCategory(i.categoria)==='solo_unidades')
      ? i.nombre+' — '+(i.units||1)+'u ('+i.categoria+')'
      : i.nombre+' — '+(i.grams||500)+'g ('+i.categoria+')';
    return '<div class="checkout-item-line">• '+itemText+'</div>';
  }).join('');
  
  const total = fmtEUR(estimateTotal());
  box.innerHTML = '<div class="checkout-products-list">'+
                    '<strong style="display:block; margin-bottom:.5rem;">Productos del pedido:</strong>'+
                    productsList+
                  '</div>'+
                  '<hr style="margin:1rem 0; border:none; border-top:1px solid var(--border);"/>'+
                  '<div><strong>Total estimado:</strong> <span class="price-amount">'+total+'</span></div>';
}
function orderText(){
  // Obtener perfil: primero de localStorage, si no existe, intentar del formulario actual
  let p = getProfile();
  // Si no hay perfil guardado, intentar obtenerlo del formulario (para pedidos sin consentimiento)
  if(!p || !p.nombre || !p.telefono){
    const nombreEl = document.getElementById('pf_nombre');
    const telefonoEl = document.getElementById('pf_telefono');
    const entregaEl = document.getElementById('pf_entrega');
    const direccionEl = document.getElementById('pf_direccion');
    const zonaEl = document.getElementById('pf_zona');
    const notasEl = document.getElementById('pf_notas');
    if(nombreEl && telefonoEl){
      p = {
        nombre: nombreEl.value.trim() || p.nombre || '-',
        telefono: telefonoEl.value.trim() || p.telefono || '-',
        entrega: entregaEl ? entregaEl.value : (p.entrega || 'recogida'),
        direccion: direccionEl ? direccionEl.value.trim() : (p.direccion || ''),
        zona: zonaEl ? zonaEl.value.trim() : (p.zona || ''),
        notas: notasEl ? notasEl.value.trim() : (p.notas || '')
      };
    }
  }
  const header = 'Pedido desde la web Congelados El Timón:%0A';
  const cust = 'Cliente: '+encodeURIComponent(p.nombre||'-')+' — Tel: '+encodeURIComponent(p.telefono||'-')+'%0A'
    + 'Entrega: '+encodeURIComponent(p.entrega==='domicilio'?'A domicilio':'Recogida en tienda')+'%0A'
    + (p.direccion ? 'Dirección: '+encodeURIComponent(p.direccion)+'%0A' : '')
    + (p.zona ? 'Zona/CP: '+encodeURIComponent(p.zona)+'%0A' : '')
    + (p.notas ? 'Notas: '+encodeURIComponent(p.notas)+'%0A' : '');
  const body = cart.map(i =>
    '• '+encodeURIComponent(i.nombre)+' — ' + (
      ruleForCategory(i.categoria)==='solo_unidades'
        ? encodeURIComponent((i.units||1)+'u')
        : encodeURIComponent((i.grams||500)+'g')
    ) + ' ('+encodeURIComponent(i.categoria)+')'
  ).join('%0A');
  const total = '%0A%0ATotal estimado: '+encodeURIComponent(fmtEUR(estimateTotal()));
  return header + cust + body + total;
}
function sendWhatsApp(){ 
  // IMPORTANTE: Generar el mensaje de WhatsApp ANTES de limpiar el carrito
  // orderText() necesita leer el carrito para incluir los productos
  const whatsappMessage = orderText();
  
  // Guardar el pedido ANTES de limpiar el carrito
  // addOrderFromCart() construye el pedido usando el carrito actual, por lo que debe ejecutarse ANTES de clearCart()
  addOrderFromCart('whatsapp');
  
  // Limpiar el carrito después de guardar el pedido y generar el mensaje (sin mensaje)
  clearCart(false, true);
  try{ toggleCart(false); }catch(_){} 
  try{ closeCheckout(); }catch(_){} 
  const url = 'https://wa.me/'+WA_NUMBER+'?text='+whatsappMessage; 
  window.open(url, '_blank'); 
  showToast('Pedido enviado por WhatsApp');
}

// -------- Panel Mis Pedidos --------
function openOrdersPanel(){
  const panel = document.getElementById('orders-panel');
  if(!panel) return;
  panel.classList.add('is-open');
  document.body.classList.add('orders-panel-open');
  renderOrdersList();
  // Inicializar visibilidad del botón eliminar todos
  const deleteAllBtn = document.getElementById('deleteAllOrdersBtn');
  if(deleteAllBtn){
    const orders = loadOrders();
    deleteAllBtn.style.display = orders.length > 0 ? 'block' : 'none';
  }
}
function closeOrdersPanel(){
  const panel = document.getElementById('orders-panel');
  if(panel) panel.classList.remove('is-open');
  document.body.classList.remove('orders-panel-open');
  scrollToTopSafe();
}
function toggleOrdersPanel(){
  const panel = document.getElementById('orders-panel');
  if(!panel) return;
  if(panel.classList.contains('is-open')){
    closeOrdersPanel();
  } else {
    openOrdersPanel();
  }
}
function renderOrdersList(){
  const list = document.getElementById('orders-list');
  if(!list) return;
  const orders = loadOrders();
  if(orders.length===0){
    list.innerHTML = '<div class="muted" style="padding:1rem; text-align:center;">No hay pedidos guardados.</div>';
    return;
  }
  list.innerHTML = orders.map(order => {
    const date = new Date(order.timestamp);
    const dateStr = date.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const itemCount = order.items ? order.items.reduce((sum, i) => sum + (i.unitType==='u' ? (i.units||1) : 1), 0) : 0;
    return ''+
      '<li class="orders-item" data-order-id="'+order.id+'">'+
        '<div class="orders-item-header">'+
          '<div><strong>Pedido</strong><br><small class="muted">'+dateStr+'</small></div>'+
          '<div style="text-align:right;"><strong>'+fmtEUR(order.total||0)+'</strong><br><small class="muted">'+itemCount+' items</small></div>'+
        '</div>'+
        '<div class="orders-item-actions">'+
          '<button class="btn secondary" onclick="loadOrderIntoCart('+order.id+')">Repetir pedido</button>'+
          '<button class="btn" onclick="showOrderDetails('+order.id+')">Ver detalles</button>'+
          '<button class="btn danger" onclick="deleteOrder('+order.id+')" title="Eliminar pedido" aria-label="Eliminar pedido">🗑️</button>'+
        '</div>'+
      '</li>';
  }).join('');
  
  // Añadir botón para eliminar todos los pedidos al final de la lista
  const deleteAllBtn = document.getElementById('deleteAllOrdersBtn');
  if(deleteAllBtn){
    deleteAllBtn.style.display = orders.length > 0 ? 'block' : 'none';
  }
}
function deleteOrder(orderId){
  if(!confirm('¿Estás seguro de que quieres eliminar este pedido?')){
    return;
  }
  const orders = loadOrders();
  const filteredOrders = orders.filter(o => o.id !== orderId);
  saveOrders(filteredOrders);
  renderOrdersList();
  showToast('Pedido eliminado');
}

function deleteAllOrders(){
  const orders = loadOrders();
  if(orders.length === 0){
    showToast('No hay pedidos para eliminar');
    return;
  }
  if(!confirm('¿Estás seguro de que quieres eliminar TODOS los pedidos? Esta acción no se puede deshacer.')){
    return;
  }
  saveOrders([]);
  renderOrdersList();
  showToast('Todos los pedidos han sido eliminados');
}

function loadOrderIntoCart(orderId){
  const orders = loadOrders();
  const order = orders.find(o => o.id===orderId);
  if(!order || !order.items || order.items.length===0){
    showToast('No se pudo cargar el pedido');
    return;
  }
  cart = JSON.parse(JSON.stringify(order.items));
  renderCart();
  updateCartCount();
  closeOrdersPanel();
  toggleCart(true);
  showToast('Pedido cargado en la cesta');
}
function showOrderDetails(orderId){
  const orders = loadOrders();
  const order = orders.find(o => o.id===orderId);
  if(!order){
    showToast('Pedido no encontrado');
    return;
  }
  const date = new Date(order.timestamp);
  const dateStr = date.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  
  const content = document.getElementById('order-details-content');
  if(!content) return;
  
  // Datos de envío
  const shippingInfo = ''+
    '<div class="order-shipping-info">'+
      '<strong>Datos de envío</strong><br>'+
      'Cliente: '+(order.customer?.nombre||'-')+' — Tel: '+(order.customer?.telefono||'-')+'<br>'+
      'Entrega: '+(order.customer?.entrega==='domicilio'?'A domicilio':'Recogida en tienda')+'<br>'+
      (order.customer?.direccion ? 'Dirección: '+order.customer.direccion+'<br>' : '')+
      (order.customer?.zona ? 'Zona/CP: '+order.customer.zona+'<br>' : '')+
      (order.customer?.notas ? 'Notas: '+order.customer.notas+'<br>' : '')+
      '<div class="muted" style="margin-top:.5rem; font-size:.85rem;">Pedido del '+dateStr+'</div>'+
    '</div>';
  
  // Artículos uno por línea
  const itemsList = (order.items || []).map((i, idx) => {
    const itemText = ruleForCategory(i.categoria)==='solo_unidades'
      ? i.nombre+' — '+(i.units||1)+'u ('+i.categoria+')'
      : i.nombre+' — '+(i.grams||500)+'g ('+i.categoria+')';
    return ''+
      '<div class="order-item-line">'+
        '<span>'+itemText+'</span>'+
        '<button class="order-item-add-btn" onclick="addOrderItemToCart('+orderId+', '+idx+')" aria-label="Añadir a cesta" title="Añadir a cesta">🛒</button>'+
      '</div>';
  }).join('');
  
  content.innerHTML = shippingInfo +
    '<div class="order-items-section">'+
      '<strong style="display:block; margin-top:1rem; margin-bottom:.5rem;">Artículos del pedido</strong>'+
      '<div class="order-items-list">'+itemsList+'</div>'+
      '<div style="margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border);">'+
        '<strong>Total estimado: <span class="price-amount">'+fmtEUR(order.total||0)+'</span></strong>'+
      '</div>'+
    '</div>';
  
  const modal = document.getElementById('orderDetailsModal');
  if(modal) modal.classList.add('open');
}
function closeOrderDetails(){
  const modal = document.getElementById('orderDetailsModal');
  if(modal) modal.classList.remove('open');
  scrollToTopSafe();
}
// -------- Panel de Categorías Móvil --------
function openCategoriesPanel(){
  const panel = document.getElementById('categoriesMobilePanel');
  const overlay = document.getElementById('categoriesOverlay');
  if(!panel) return;
  
  // Asegurar que el overlay esté visible
  if(overlay){
    overlay.removeAttribute('aria-hidden');
    overlay.style.setProperty('opacity', '1', 'important');
    overlay.style.setProperty('visibility', 'visible', 'important');
  }
  
  // Quitar aria-hidden antes de añadir la clase
  panel.removeAttribute('aria-hidden');
  
  // Añadir la clase al body para mostrar el panel
  document.body.classList.add('categories-panel-open');
  
  // Forzar estilos para asegurar visibilidad
  panel.style.setProperty('transform', 'translateX(0)', 'important');
  panel.style.setProperty('visibility', 'visible', 'important');
  panel.style.setProperty('opacity', '1', 'important');
  panel.style.setProperty('pointer-events', 'auto', 'important');
  
  // Usar setTimeout para enfocar después de que el panel esté visible
  setTimeout(function(){
    const closeBtn = document.getElementById('categoriesCloseBtn');
    if(closeBtn) closeBtn.focus();
  }, 150);
}
function closeCategoriesPanel(){
  const panel = document.getElementById('categoriesMobilePanel');
  const overlay = document.getElementById('categoriesOverlay');
  if(!panel) return;
  
  // Quitar foco antes de ocultar
  const activeEl = document.activeElement;
  if(activeEl && panel.contains(activeEl)){
    activeEl.blur();
  }
  
  // Quitar la clase del body
  document.body.classList.remove('categories-panel-open');
  
  // Forzar estilos con !important para asegurar que esté oculto
  panel.style.setProperty('transform', 'translateX(-100%)', 'important');
  panel.style.setProperty('visibility', 'hidden', 'important');
  panel.style.setProperty('opacity', '0', 'important');
  panel.style.setProperty('pointer-events', 'none', 'important');
  
  if(overlay){
    overlay.style.setProperty('opacity', '0', 'important');
    overlay.style.setProperty('visibility', 'hidden', 'important');
  }
  
  // Establecer aria-hidden después de un pequeño delay
  setTimeout(function(){
    panel.setAttribute('aria-hidden', 'true');
    if(overlay) overlay.setAttribute('aria-hidden', 'true');
  }, 100);
  scrollToTopSafe();
}
function addOrderItemToCart(orderId, itemIndex){
  const orders = loadOrders();
  const order = orders.find(o => o.id===orderId);
  if(!order || !order.items || !order.items[itemIndex]){
    showToast('No se pudo cargar el artículo');
    return;
  }
  const item = order.items[itemIndex];
  // Añadir directamente al carrito con la cantidad que tenía
  const existingIdx = findCartItemByIdAndType(item.id, item.unitType);
  if(existingIdx>-1){
    // Si ya existe, actualizar cantidad
    if(item.unitType==='u'){
      cart[existingIdx].units = (cart[existingIdx].units||1) + (item.units||1);
    }else{
      cart[existingIdx].grams = clampWeight((cart[existingIdx].grams||500) + (item.grams||500));
    }
  }else{
    cart.push(JSON.parse(JSON.stringify(item)));
  }
  renderCart();
  updateCartCount();
  showToast('Añadido a la cesta: '+item.nombre);
}

// -------- Panel Favoritos --------
function openFavoritesPanel(){
  const modal = document.getElementById('favoritesModal');
  if(!modal) return;
  modal.classList.add('open');
  renderFavoritesList();
}
function closeFavoritesPanel(){
  const modal = document.getElementById('favoritesModal');
  if(modal) modal.classList.remove('open');
  scrollToTopSafe();
}
function renderFavoritesList(){
  const list = document.getElementById('favorites-list');
  if(!list) return;
  const favorites = loadFavorites();
  if(favorites.length===0){
    list.innerHTML = '<div class="muted" style="padding:2rem; text-align:center;">No hay productos favoritos.</div>';
    return;
  }
  const favoriteProducts = allProducts.filter(p => favorites.includes(p.id));
  list.innerHTML = favoriteProducts.map(p => {
    const pesoTxt = p.peso ? p.peso : 'El Kilo';
    return ''+
      '<div class="favorite-item" data-id="'+p.id+'">'+
        '<div class="favorite-item-info">'+
          '<strong>'+displayName(p.nombre)+'</strong>'+
          '<div class="muted">'+p.categoria+' · <span class="price-amount">'+fmtEUR(p.precio)+'</span> · '+pesoTxt+'</div>'+
        '</div>'+
        '<div class="favorite-item-actions">'+
          '<button class="btn-icon" onclick="addFavoriteToCart(\''+p.id+'\')" aria-label="Añadir a cesta" title="Añadir a cesta">🛒</button>'+
          '<button class="btn-icon" onclick="removeFavorite(\''+p.id+'\')" aria-label="Eliminar de favoritos" title="Eliminar de favoritos">🗑️</button>'+
        '</div>'+
      '</div>';
  }).join('');
}
function addFavoriteToCart(id){
  addToCart(id);
  showToast('Añadido a la cesta');
}
function removeFavorite(id){
  toggleFavorite(id);
  renderFavoritesList();
  renderProducts();
  showToast('Eliminado de favoritos');
}

// Home
function goHome(){
  filtered = []; filteredByUser = false;
  document.querySelectorAll('.menu button').forEach(b=>b.classList.remove('active'));
  
  // Cerrar todos los paneles y modales abiertos
  try{
    if(typeof closeCategoriesPanel === 'function') closeCategoriesPanel();
  }catch(e){}
  try{
    if(typeof closeOrdersPanel === 'function') closeOrdersPanel();
  }catch(e){}
  try{
    if(typeof closeFavoritesPanel === 'function') closeFavoritesPanel();
  }catch(e){}
  try{
    if(typeof closeCheckout === 'function') closeCheckout();
  }catch(e){}
  
  // Cerrar tarjetas ampliadas
  document.querySelectorAll('.card.expanded').forEach(c => {
    c.classList.remove('expanded');
  });
  document.body.classList.remove('card-expanded');
  
  // Cerrar formulario de búsqueda si está abierto
  try{
    const searchForm = document.getElementById('search');
    if(searchForm && searchForm.classList.contains('active')){
      searchForm.classList.remove('active');
    }
  }catch(e){}
  
  renderProducts();
  try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(e){ window.scrollTo(0,0); }
}

// Función para cerrar el formulario de búsqueda
function closeSearchForm(){
  const searchForm = document.getElementById('search');
  if(searchForm){
    searchForm.classList.remove('active');
    // Limpiar el input si se desea
    const input = document.getElementById('searchInput');
    if(input) input.value = '';
  }
}

function scrollToTopSafe(){
  try{
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }catch(e){
    try{ window.scrollTo(0,0); }catch(_){}
  }
}

// Carrusel JS (autoplay y flechas; dots ya funcionan sin JS)
function initCarousel(){
  const root = document.getElementById('heroCarousel'); if(!root) return;
  const radios = Array.from(root.querySelectorAll('.c-slide'));
  const prevBtn = root.querySelector('.prev');
  const nextBtn = root.querySelector('.next');
  let idx = 0, timer = null, delay = 5000;
  const show = i => { idx = (i + radios.length) % radios.length; radios[idx].checked = true; };
  const next = () => show(idx+1);
  const prev = () => show(idx-1);
  const start = () => { if(radios.length>1) timer = setInterval(next, delay); };
  const stop = () => { if(timer){ clearInterval(timer); timer=null; } };

  if(prevBtn) prevBtn.addEventListener('click', ()=>{ prev(); stop(); start(); });
  if(nextBtn) nextBtn.addEventListener('click', ()=>{ next(); stop(); start(); });

  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  root.addEventListener('focusin', stop);
  root.addEventListener('focusout', start);

  radios.forEach((r,i)=> r.addEventListener('change', ()=>{ if(r.checked){ idx = i; stop(); start(); } }));

  show(0); start();
}

// Desplegable "Como Comprar": ajustar aria-expanded
function initHowTo(){
  const d = document.getElementById('howto'); if(!d) return;
  const s = d.querySelector('summary');
  d.addEventListener('toggle', ()=>{ if(s) s.setAttribute('aria-expanded', d.open ? 'true' : 'false'); });
}

// Binds de cabecera y carrito
function bindHeader(){
  const home = document.getElementById('homeBtn');
  if(home) {
    // Si es un enlace, añadir event listener
    if(home.tagName === 'A'){
      home.addEventListener('click', (e)=>{
        e.preventDefault();
        goHome();
      });
    } else {
      home.addEventListener('click', goHome);
    }
  }
  // Botón de búsqueda toggle para móvil
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const searchForm = document.getElementById('search');
  if(searchToggleBtn && searchForm){
    searchToggleBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      searchForm.classList.toggle('active');
      if(searchForm.classList.contains('active')){
        // Enfocar el input cuando se muestra
        setTimeout(()=>{
          const input = document.getElementById('searchInput');
          if(input) input.focus();
        }, 100);
      }
    });
    // Cerrar el formulario de búsqueda al hacer clic fuera
    document.addEventListener('click', (e)=>{
      if(searchForm.classList.contains('active') && 
         !searchForm.contains(e.target) && 
         e.target !== searchToggleBtn){
        searchForm.classList.remove('active');
      }
    });
  }
  
  // Botón de cierre del formulario de búsqueda
  const searchCloseBtn = document.getElementById('searchCloseBtn');
  if(searchCloseBtn && searchForm){
    searchCloseBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      closeSearchForm();
    });
  }
  const cartBtn = document.getElementById('cartBtn');
  if(cartBtn) cartBtn.addEventListener('click', ()=> toggleCart());
  const continueBtn = document.getElementById('continueBtn');
  if(continueBtn) continueBtn.addEventListener('click', ()=> toggleCart(false));
  const cancelBtn = document.getElementById('cancelBtn');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=> clearCart(true));
  const checkoutBtn = document.getElementById('checkoutBtn');
  if(checkoutBtn) checkoutBtn.addEventListener('click', openCheckout);
  const editCartBtn = document.getElementById('editCartBtn');
  if(editCartBtn) editCartBtn.addEventListener('click', (e)=>{
  try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
  closeCheckout();
  setTimeout(()=>{
    toggleCart(true);
    const el = document.getElementById('cart');
    if(el){ try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch(_){} }
    try{ location.hash = '#cart'; }catch(_){}
  },0);
});
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');
  if(cancelOrderBtn) cancelOrderBtn.addEventListener('click', ()=>{ clearCart(true); closeCheckout(); });
  const sendWaBtn = document.getElementById('sendWaBtn');
  if(sendWaBtn) sendWaBtn.addEventListener('click', sendWhatsApp);
}


// === Cierre por clic-fuera y ESC para modales, cesta y "Como Comprar" ===
function setupGlobalDismiss(){
  document.addEventListener('click', (e)=>{
    // Modales
    document.querySelectorAll('.modal.open').forEach(modal=>{
      if(e.target === modal){
        if(modal.id==='profileModal'){ closeProfile(); }
        else if(modal.id==='checkoutModal'){ closeCheckout(); }
        else if(modal.id==='favoritesModal'){ closeFavoritesPanel(); }
        else if(modal.id==='orderDetailsModal'){ closeOrderDetails(); }
        else if(modal.id==='quantityModal'){ closeQuantityModal(); }
        else if(modal.id==='aviso-legal' || modal.id==='politica-privacidad' || modal.id==='politica-cookies'){ closeLegalModal(modal.id); }
        else { modal.classList.remove('open'); }
      }
    });
    // Cesta
    const cartEl = document.getElementById('cart');
    const cartBtn = document.getElementById('cartBtn');
    if(cartEl && cartEl.classList.contains('open')){
      const inside = cartEl.contains(e.target);
      const onBtn = cartBtn && cartBtn.contains(e.target);
      // Cerrar si se hace clic fuera de la cesta o en el overlay
      if(!inside && !onBtn){ toggleCart(false); }
    }
    // Panel Mis Pedidos
    const ordersPanel = document.getElementById('orders-panel');
    const ordersBtn = document.getElementById('btn-orders');
    if(ordersPanel && ordersPanel.classList.contains('is-open')){
      const inside = ordersPanel.contains(e.target);
      const onBtn = ordersBtn && ordersBtn.contains(e.target);
      if(!inside && !onBtn){ closeOrdersPanel(); }
    }
    // Panel de Categorías Móvil
    const categoriesPanel = document.getElementById('categoriesMobilePanel');
    const categoriesBtn = document.getElementById('mobileCatsBtn');
    if(document.body.classList.contains('categories-panel-open')){
      const inside = categoriesPanel && categoriesPanel.contains(e.target);
      const onBtn = categoriesBtn && categoriesBtn.contains(e.target);
      const onCloseBtn = e.target.closest('#categoriesCloseBtn');
      if(!inside && !onBtn && !onCloseBtn){ closeCategoriesPanel(); }
    }
    // Como Comprar
    const howto = document.getElementById('howto');
    if(howto && howto.open && !howto.contains(e.target)){ howto.open = false; }
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){
      // Cerrar modal de cantidad si está abierto
      const quantityModal = document.getElementById('quantityModal');
      if(quantityModal && quantityModal.classList.contains('open')){
        closeQuantityModal();
        return;
      }
      // Cerrar tarjetas ampliadas si hay alguna
      const expandedCards = document.querySelectorAll('.card.expanded');
      if(expandedCards.length > 0){
        expandedCards.forEach(c => c.classList.remove('expanded'));
        document.body.classList.remove('card-expanded');
        return;
      }
      // Cerrar panel de categorías si está abierto
      if(document.body.classList.contains('categories-panel-open')){
        try{ closeCategoriesPanel(); }catch(_){}
        return;
      }
      try{ closeProfile(); }catch(_){}
      try{ closeCheckout(); }catch(_){}
      try{ closeFavoritesPanel(); }catch(_){}
      try{ closeOrderDetails(); }catch(_){}
      try{ closeLegalModal('aviso-legal'); }catch(_){}
      try{ closeLegalModal('politica-privacidad'); }catch(_){}
      try{ closeLegalModal('politica-cookies'); }catch(_){}
      try{ toggleCart(false); }catch(_){}
      try{ closeOrdersPanel(); }catch(_){}
      const howto = document.getElementById('howto'); if(howto) howto.open=false;
    }
  });
}


// === Banner dinámico (T1+G3) — SIN texto por defecto ===
async function initBannerDynamic(){
  const container = document.getElementById('offerBanner');
  const textEl = document.getElementById('offerBannerText');
  if(!container || !textEl) return; // si el HTML aún no tiene banner, no hacemos nada
  const offers = await loadOffersCSV('ofertas.csv').catch(()=>[]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const active = offers
    .filter(o => o.desde && o.hasta && o.mensaje)
    .filter(o => today >= o.desde && today <= o.hasta)
    .sort((a,b)=> (b.prioridad||0) - (a.prioridad||0));
  const pick = active.length ? active[0] : null;
  textEl.textContent = pick ? pick.mensaje : '';
  // Imagen de fondo
  const defaultImg = 'Banners/banner-bg.jpg';
  const img = (pick && pick.imagen) ? pick.imagen : defaultImg;
  container.style.setProperty('--banner-image', `url('${img}')`);
  // Ocultar texto si vacío
  if(!textEl.textContent.trim()){ textEl.style.display = 'none'; } else { textEl.style.display = ''; }
}
// CSV helper
async function loadOffersCSV(path){
  const res = await fetch(path, {cache:'no-store'});
  if(!res.ok) throw new Error('ofertas.csv no accesible');
  const raw = await res.text();
  return parseOffersCSV(raw);
}
function parseOffersCSV(raw){
  const lines = raw.split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length===0) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map(h=>h.trim().toLowerCase());
  const idxMsg = header.indexOf('mensaje');
  const idxDesde = header.indexOf('desde');
  const idxHasta = header.indexOf('hasta');
  const idxPrio = header.indexOf('prioridad');
  const idxImg = header.indexOf('imagen');
  const parseYMD = s => {
    const m = (s||'').match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if(!m) return null;
    return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
  };
  const out = [];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(sep);
    const msg = (cols[idxMsg]||'').trim();
    const d1 = parseYMD((cols[idxDesde]||'').trim());
    const d2 = parseYMD((cols[idxHasta]||'').trim());
    const pr = parseInt((cols[idxPrio]||'0').trim(),10) || 0;
    const im = idxImg>=0 ? (cols[idxImg]||'').trim() : '';
    if(msg && d1 && d2) out.push({mensaje:msg, desde:d1, hasta:d2, prioridad:pr, imagen:im});
  }
  return out;
}

// -------- UI inicial
function initUI(){
  setupGlobalDismiss();
  initBannerDynamic();
  renderSeedCategories();
  renderProducts(); // deja el __hero visible
  bindSearch();
  bindGridClicks();
  bindHeader();
  bindProfile();
}

// -------- Inicio
initUI();
initCarousel();
initHowTo();
loadProducts();



// ===== Aside móvil toggle =====
document.addEventListener('DOMContentLoaded', function(){
  var btnInfo = document.getElementById('mobileAsideBtn');
  if(btnInfo){
    btnInfo.addEventListener('click', function(){
      document.body.classList.toggle('aside-open');
    });
  }
  // Cerrar con ESC
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ document.body.classList.remove('aside-open'); }
  });
  // Cerrar al tocar fuera
  document.addEventListener('click', function(e){
    if(document.body.classList.contains('aside-open')){
      var aside = document.querySelector('aside');
      if(aside && !aside.contains(e.target) && e.target !== btnInfo){
        document.body.classList.remove('aside-open');
      }
    }
  }, true);

  // Asegurar que el panel de categorías esté cerrado al cargar
  document.body.classList.remove('categories-panel-open');
  document.body.classList.remove('card-expanded');
  document.body.classList.remove('orders-panel-open');
  const initPanel = document.getElementById('categoriesMobilePanel');
  if(initPanel){
    initPanel.setAttribute('aria-hidden', 'true');
    initPanel.style.setProperty('transform', 'translateX(-100%)', 'important');
    initPanel.style.setProperty('visibility', 'hidden', 'important');
    initPanel.style.setProperty('opacity', '0', 'important');
    initPanel.style.setProperty('pointer-events', 'none', 'important');
  }
  const initOverlay = document.getElementById('categoriesOverlay');
  if(initOverlay){
    initOverlay.setAttribute('aria-hidden', 'true');
    initOverlay.style.setProperty('opacity', '0', 'important');
    initOverlay.style.setProperty('visibility', 'hidden', 'important');
  }
  // Asegurar que el overlay de tarjetas ampliadas esté cerrado
  const cardOverlay = document.getElementById('cardExpandOverlay');
  if(cardOverlay){
    cardOverlay.style.setProperty('opacity', '0', 'important');
    cardOverlay.style.setProperty('visibility', 'hidden', 'important');
    cardOverlay.style.setProperty('pointer-events', 'none', 'important');
  }
  // Cerrar todas las tarjetas ampliadas
  document.querySelectorAll('.card.expanded').forEach(card => {
    card.classList.remove('expanded');
  });

  // Abrir panel de categorías móvil
  var catsBtn = document.getElementById('mobileCatsBtn');
  if(catsBtn){
    catsBtn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove('aside-open');
      openCategoriesPanel();
    });
  }

  // Header elevated on scroll
  var hdr = document.querySelector('header');
  function upd(){ if(!hdr) return; var y = window.scrollY || 0; if(y>2) hdr.classList.add('elevated'); else hdr.classList.remove('elevated'); }
  window.addEventListener('scroll', upd, {passive:true}); upd();
});


document.addEventListener('DOMContentLoaded', function(){
  var clearBtn = document.getElementById('clearProfileBtn');
  if(clearBtn){
    clearBtn.addEventListener('click', function(){
      try{ localStorage.removeItem(PROFILE_KEY); }catch(e){}
      try{ sessionStorage.removeItem('profile_session_ok'); __profileSessionOK = false; }catch(e){}
      ['pf_nombre','pf_telefono','pf_direccion','pf_zona','pf_notas'].forEach(function(id){
        var el = document.getElementById(id); if(el) el.value='';
      });
      var entrega = document.getElementById('pf_entrega'); if(entrega) entrega.value = 'recogida';
      if(typeof showToast==='function'){ showToast('Datos borrados'); }
    });
  }
});

// Mostrar nombre sin marcadores de oferta/novedad (solo visual)
function displayName(name){
  if(!name) return '';
  let n = String(name);
  n = n.replace(/\s*\[(oferta|novedad)\]\s*/ig, '');
  n = n.replace(/\s*(oferta|novedad)\s*:\s*/ig, '');
  n = n.replace(/\s+\b(oferta|novedad)\b\s*$/ig, '');
  return n.trim();
}


document.addEventListener('DOMContentLoaded', function(){ var h=document.getElementById('hero'); setBannersActive(!!(h && h.style.display!=='none')); });

// ---------- Protección de datos: borrado de datos locales ----------
function clearLocalUserData(){
  try{
    localStorage.removeItem('elTimon.profile');
    localStorage.removeItem('elTimon.orders');
    localStorage.removeItem('elTimon.favorites');
    // También borrar consentimientos
    localStorage.removeItem(CONSENT_LOCAL_KEY);
    localStorage.removeItem(CONSENT_PROMOS_KEY);
    // También borrar sesión de perfil si existe
    try{ sessionStorage.removeItem('profile_session_ok'); __profileSessionOK = false; }catch(_){}
  }catch(e){
    console.error('Error al borrar datos:', e);
  }
  // Limpiar los campos del formulario de perfil
  ['pf_nombre','pf_telefono','pf_direccion','pf_zona','pf_notas'].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.value='';
  });
  const entregaEl = document.getElementById('pf_entrega');
  if(entregaEl) entregaEl.value = 'recogida';
  // Limpiar los radio buttons de consentimiento
  const localYes = document.getElementById('local-consent-yes');
  const localNo = document.getElementById('local-consent-no');
  if(localYes) localYes.checked = false;
  if(localNo) localNo.checked = false;
  const promosYes = document.getElementById('promo-consent-yes');
  const promosNo = document.getElementById('promo-consent-no');
  if(promosYes) promosYes.checked = false;
  if(promosNo) promosNo.checked = false;
  showToast('Se han borrado los datos guardados en este dispositivo. Si quieres eliminar más datos, puedes hacerlo desde la configuración de tu navegador.');
  // Limpiar también el carrito actual si está vacío
  if(cart.length===0){
    renderCart();
    updateCartCount();
  }
  // Cerrar el modal de perfil si está abierto
  closeProfile();
}

// ---------- Modales legales ----------
function openLegalModal(modalId){
  const modal = document.getElementById(modalId);
  if(modal) modal.classList.add('open');
}
function closeLegalModal(modalId){
  const modal = document.getElementById(modalId);
  if(modal) modal.classList.remove('open');
  scrollToTopSafe();
}
function openHowTo(){
  const howto = document.getElementById('howto');
  if(howto){
    howto.open = true;
    // Asegurar que el popover sea visible y hacer scroll hacia él
    const summary = howto.querySelector('summary');
    if(summary){
      setTimeout(()=>{
        howto.scrollIntoView({behavior:'smooth', block:'center'});
        summary.setAttribute('aria-expanded', 'true');
      }, 100);
    }
  }
}

// Enganchar botón de borrar datos
document.addEventListener('DOMContentLoaded', function(){
  const clearBtn = document.getElementById('btn-clear-local-data');
  if(clearBtn){
    clearBtn.addEventListener('click', function(){
      if(confirm('¿Estás seguro de que quieres borrar todos los datos almacenados en este dispositivo? Esto incluye tu perfil, historial de pedidos y favoritos.')){
        clearLocalUserData();
      }
    });
  }
});