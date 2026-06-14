// ===== FIREBASE CONFIG (same project as shop) =====
const firebaseConfig = {
  apiKey: "AIzaSyAee5w7VvHwp2vQTQ-tmMXTZq9A56cZrx8",
  authDomain: "shop-e1ee5.firebaseapp.com",
  projectId: "shop-e1ee5",
  storageBucket: "shop-e1ee5.firebasestorage.app",
  messagingSenderId: "134385752009",
  appId: "1:134385752009:web:ba94a13ceb01062f0b3a18"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ===== ADMIN CREDENTIALS =====
const ADMIN_EMAIL = "admin@quickshop.com";
const ADMIN_PASS  = "admin123";

// ===== STATE =====
let allOrders    = [];
let allCustomers = [];
let allPromos    = [];
let allArticles  = [];
let allProducts  = [];

// ===== AUTH =====
function adminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const pass  = document.getElementById('admin-password').value.trim();
  if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    bootAdmin();
  } else {
    toast('Invalid credentials', 'error');
  }
}

function adminLogout() {
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ===== BOOT =====
async function bootAdmin() {
  // Test DB connection first
  try {
    await db.collection('_ping').doc('test').set({ ts: Date.now() });
    toast('Database connected ✓', 'success');
  } catch(e) {
    toast('DB connection failed: ' + e.message, 'error');
    console.error('DB test failed:', e);
  }
  listenToOrders(); // real-time listener
  await Promise.all([fetchCustomers(), fetchPromos(), fetchArticles(), fetchProducts()]);
  renderDashboard();
}

// ===== REAL-TIME ORDERS LISTENER =====
let _snapshotCount = 0;
function listenToOrders() {
  db.collection('orders').onSnapshot(snap => {
    allOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    allOrders.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    updatePendingBadge();
    renderDashboard();
    if (document.getElementById('section-orders').classList.contains('active')) renderOrdersTable();
    fetchCustomers().then(() => {
      if (document.getElementById('section-customers').classList.contains('active')) renderCustomersTable();
    });
    // Only toast on first load or when count changes
    _snapshotCount++;
    if (_snapshotCount === 1) toast(`${snap.docs.length} order(s) found`, snap.docs.length ? 'success' : 'info');
  }, err => {
    console.error('Orders listener error:', err.code, err.message);
    toast('Orders error: ' + err.code + ' — ' + err.message, 'error');
  });
}

// kept for manual refresh
async function fetchOrders() {
  try {
    const snap = await db.collection('orders').get();
    allOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    allOrders.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
  } catch(e) {
    console.error('Orders fetch error:', e.code, e.message);
    toast('Orders fetch failed: ' + e.message, 'error');
    allOrders = [];
  }
  updatePendingBadge();
}

async function fetchCustomers() {
  // Try the dedicated customers collection first
  let firestoreCustomers = [];
  try {
    const snap = await db.collection('customers').get();
    firestoreCustomers = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('Customers collection fetch error:', e);
  }

  // Always also derive customers from orders (covers users who ordered before Firestore save was added)
  const orderCustomers = {};
  allOrders.forEach(o => {
    if (!o.customerEmail) return;
    if (!orderCustomers[o.customerEmail]) {
      orderCustomers[o.customerEmail] = {
        _id: o.customerEmail,
        name: o.customerName || '—',
        email: o.customerEmail,
        phone: o.customerPhone || '—',
        address: o.address || '—',
        joinedAt: o.date || null
      };
    }
  });

  // Merge: Firestore records take priority, orders fill gaps
  const merged = { ...orderCustomers };
  firestoreCustomers.forEach(c => {
    if (c.email) merged[c.email] = { ...merged[c.email], ...c };
  });

  allCustomers = Object.values(merged);
}

async function fetchPromos() {
  const snap = await db.collection('promoCodes').get().catch(()=>({docs:[]}));
  allPromos = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

async function fetchArticles() {
  const snap = await db.collection('articles').orderBy('createdAt','desc').get().catch(()=>({docs:[]}));
  allArticles = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

async function fetchProducts() {
  const snap = await db.collection('products').get().catch(()=>({docs:[]}));
  allProducts = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  if (!allProducts.length) {
    // seed from localStorage as fallback label
    allProducts = JSON.parse(localStorage.getItem('qs_products') || '[]');
  }
}

// ===== NAVIGATION =====
function goToSection(name) {
  document.querySelectorAll('.section').forEach(s => { s.classList.add('hidden'); s.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('section-' + name);
  if (sec) { sec.classList.remove('hidden'); sec.classList.add('active'); }
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = name.charAt(0).toUpperCase() + name.slice(1);

  if (name === 'orders')    renderOrdersTable();
  if (name === 'customers') renderCustomersTable();
  if (name === 'promos')    renderPromos();
  if (name === 'articles')  renderArticles();
  if (name === 'products')  renderProductsTable();
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== DASHBOARD =====
function renderDashboard() {
  const revenue = allOrders.reduce((s,o)=>s+(o.total||0),0);
  const pending = allOrders.filter(o=>o.status==='Pending').length;
  document.getElementById('stat-total-orders').textContent = allOrders.length;
  document.getElementById('stat-revenue').textContent = '₹'+revenue;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-customers').textContent = allCustomers.length;

  // Recent orders
  const recentOrders = allOrders.slice(0,5);
  const rot = document.getElementById('recent-orders-table');
  if (!recentOrders.length) { rot.innerHTML = emptyState('No orders yet'); return; }
  rot.innerHTML = `<table>
    <thead><tr><th>Order ID</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${recentOrders.map(o=>`<tr style="cursor:pointer" onclick="openOrderModal('${o._id}')">
      <td><span class="table-id">#${o.id||o._id}</span></td>
      <td class="table-name">${o.customerName||'—'}</td>
      <td>₹${o.total||0}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  // Dashboard articles
  const dal = document.getElementById('dashboard-articles-list');
  const arts = allArticles.slice(0,5);
  if (!arts.length) { dal.innerHTML = emptyState('No articles yet'); return; }
  dal.innerHTML = arts.map(a=>`
    <div class="dash-article-item" onclick="goToSection('articles')">
      <div class="dash-article-emoji">📰</div>
      <div><div class="dash-article-title">${a.title||'Untitled'}</div>
      <div class="dash-article-date">${a.category||''} · ${fmtDate(a.createdAt)}</div></div>
    </div>`).join('');
}

// ===== ORDERS =====
function renderOrdersTable() {
  const filter = document.getElementById('order-filter-status').value;
  const search = (document.getElementById('order-search').value||'').toLowerCase();
  let orders = allOrders;
  if (filter) orders = orders.filter(o=>o.status===filter);
  if (search) orders = orders.filter(o=>(o.customerName||'').toLowerCase().includes(search)||(o.id||o._id||'').toLowerCase().includes(search));

  const c = document.getElementById('orders-table-container');
  if (!orders.length) { c.innerHTML = emptyState('No orders found'); return; }
  c.innerHTML = `<table>
    <thead><tr><th>Order ID</th><th>Customer</th><th>Phone</th><th>Address</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
    <tbody>${orders.map(o=>`<tr>
      <td><span class="table-id">#${o.id||o._id}</span></td>
      <td class="table-name">${o.customerName||'—'}</td>
      <td>${o.customerPhone||'—'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.address||'—'}</td>
      <td>${(o.items||[]).length} item(s)</td>
      <td style="font-weight:700;color:#10b981">₹${o.total||0}</td>
      <td>${o.paymentMethod||'—'}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="white-space:nowrap;font-size:12px">${o.date||'—'}</td>
      <td><button class="btn-icon" onclick="openOrderModal('${o._id}')"><i class="fas fa-eye"></i></button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function openOrderModal(id) {
  const o = allOrders.find(x=>x._id===id);
  if (!o) return;
  const body = document.getElementById('order-modal-body');
  body.innerHTML = `
    <div class="order-detail-grid">
      <div class="detail-group"><label>Order ID</label><p>#${o.id||o._id}</p></div>
      <div class="detail-group"><label>Date</label><p>${o.date||'—'}</p></div>
      <div class="detail-group"><label>Customer</label><p>${o.customerName||'—'}</p></div>
      <div class="detail-group"><label>Email</label><p>${o.customerEmail||'—'}</p></div>
      <div class="detail-group"><label>Phone</label><p>${o.customerPhone||'—'}</p></div>
      <div class="detail-group"><label>Payment</label><p>${o.paymentMethod||'—'}</p></div>
      <div class="detail-group" style="grid-column:1/-1"><label>Delivery Address</label><p>${o.address||'—'}</p></div>
    </div>
    <div class="order-items-list">
      <h4 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Items Ordered</h4>
      ${(o.items||[]).map(i=>`<div class="order-item-row">
        <div class="order-item-emoji">${i.emoji||'📦'}</div>
        <div class="order-item-info">
          <div class="order-item-name">${i.name}</div>
          <div class="order-item-qty">Qty: ${i.quantity}</div>
        </div>
        <div class="order-item-price">₹${(i.price*i.quantity)||0}</div>
      </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:1px solid var(--border);margin-top:8px">
      <span style="color:var(--text-muted)">Subtotal</span><span>₹${o.subtotal||0}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:6px 0">
      <span style="color:var(--text-muted)">Delivery</span><span>₹${o.deliveryFee||0}</span>
    </div>
    ${o.discount?`<div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">Discount</span><span style="color:#10b981">-₹${o.discount}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border);font-weight:800;font-size:16px">
      <span>Total</span><span style="color:#10b981">₹${o.total||0}</span>
    </div>
    <div>
      <p style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px">Update Status:</p>
      <div class="status-selector">
        ${['Pending','Processing','Out for Delivery','Delivered','Cancelled'].map(s=>`
          <button class="status-btn ${o.status===s?'active':''}" onclick="updateOrderStatus('${o._id}','${s}',this)">${s}</button>
        `).join('')}
      </div>
    </div>`;
  openModal('order-modal');
}

async function updateOrderStatus(id, status, btn) {
  await db.collection('orders').doc(id).update({ status });
  const o = allOrders.find(x=>x._id===id);
  if (o) o.status = status;
  btn.closest('.status-selector').querySelectorAll('.status-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updatePendingBadge();
  renderOrdersTable();
  toast('Order status updated to ' + status);
}

function updatePendingBadge() {
  const p = allOrders.filter(o=>o.status==='Pending').length;
  document.getElementById('pending-badge').textContent = p;
}

// ===== CUSTOMERS =====
function renderCustomersTable() {
  const search = (document.getElementById('customer-search').value||'').toLowerCase();
  let custs = allCustomers;
  if (search) custs = custs.filter(c=>(c.name||'').toLowerCase().includes(search)||(c.email||'').toLowerCase().includes(search));
  const c = document.getElementById('customers-table-container');
  if (!custs.length) { c.innerHTML = emptyState('No customers yet'); return; }
  c.innerHTML = `<table>
    <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th>Joined</th><th>Orders</th><th>Action</th></tr></thead>
    <tbody>${custs.map(cu=>{
      const orderCount = allOrders.filter(o=>o.customerEmail===cu.email).length;
      return `<tr>
        <td class="table-name">${cu.name||'—'}</td>
        <td>${cu.email||'—'}</td>
        <td>${cu.phone||'—'}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cu.address||'—'}</td>
        <td style="font-size:12px">${fmtDate(cu.joinedAt)}</td>
        <td><span class="badge-status badge-active">${orderCount}</span></td>
        <td><button class="btn-icon" onclick="openCustomerModal('${cu._id}')"><i class="fas fa-eye"></i></button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function openCustomerModal(id) {
  const cu = allCustomers.find(x=>x._id===id);
  if (!cu) return;
  const orders = allOrders.filter(o=>o.customerEmail===cu.email);
  document.getElementById('customer-modal-body').innerHTML = `
    <div class="order-detail-grid">
      <div class="detail-group"><label>Full Name</label><p>${cu.name||'—'}</p></div>
      <div class="detail-group"><label>Email</label><p>${cu.email||'—'}</p></div>
      <div class="detail-group"><label>Phone</label><p>${cu.phone||'—'}</p></div>
      <div class="detail-group"><label>Joined</label><p>${fmtDate(cu.joinedAt)}</p></div>
      <div class="detail-group" style="grid-column:1/-1"><label>Delivery Address</label><p>${cu.address||'—'}</p></div>
    </div>
    <h4 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin:14px 0 10px">Order History (${orders.length})</h4>
    ${orders.length ? orders.map(o=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:700;font-size:14px">#${o.id||o._id}</div>
          <div style="font-size:12px;color:var(--text-muted)">${o.date||''}</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          ${statusBadge(o.status)}
          <span style="font-weight:700;color:#10b981">₹${o.total||0}</span>
        </div>
      </div>`).join('') : '<p style="color:var(--text-muted);font-size:14px">No orders yet.</p>'}`;
  openModal('customer-modal');
}

// ===== PROMO CODES =====
function renderPromos() {
  const c = document.getElementById('promos-table-container');
  if (!allPromos.length) { c.innerHTML = emptyState('No promo codes yet. Create one!'); return; }
  c.innerHTML = allPromos.map(p=>{
    const expired = p.expiry && new Date(p.expiry) < new Date();
    return `<div class="promo-card">
      <div class="promo-icon">🏷️</div>
      <div class="promo-info">
        <div class="promo-code">${p.code}</div>
        <div class="promo-meta">${p.discountPercent}% OFF · Min ₹${p.minOrder||0} · ${p.description||''} · Expires: ${p.expiry||'Never'}</div>
      </div>
      <div class="promo-actions">
        <span class="badge-status ${expired?'badge-expired':'badge-active'}">${expired?'Expired':'Active'}</span>
        <button class="btn-icon" onclick="editPromo('${p._id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-icon danger" onclick="deletePromo('${p._id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function openPromoModal(id) {
  document.getElementById('promo-edit-id').value = '';
  document.getElementById('promo-code').value = '';
  document.getElementById('promo-discount').value = '';
  document.getElementById('promo-min-order').value = '';
  document.getElementById('promo-expiry').value = '';
  document.getElementById('promo-description').value = '';
  document.getElementById('promo-modal-title').textContent = 'New Promo Code';
  openModal('promo-modal');
}

function editPromo(id) {
  const p = allPromos.find(x=>x._id===id);
  if (!p) return;
  document.getElementById('promo-edit-id').value = id;
  document.getElementById('promo-code').value = p.code||'';
  document.getElementById('promo-discount').value = p.discountPercent||'';
  document.getElementById('promo-min-order').value = p.minOrder||'';
  document.getElementById('promo-expiry').value = p.expiry||'';
  document.getElementById('promo-description').value = p.description||'';
  document.getElementById('promo-modal-title').textContent = 'Edit Promo Code';
  openModal('promo-modal');
}

async function savePromo() {
  const code = document.getElementById('promo-code').value.trim().toUpperCase();
  const disc = parseInt(document.getElementById('promo-discount').value);
  if (!code || !disc) { toast('Code and discount % are required','error'); return; }
  const data = {
    code,
    discountPercent: disc,
    minOrder: parseInt(document.getElementById('promo-min-order').value)||0,
    expiry: document.getElementById('promo-expiry').value||null,
    description: document.getElementById('promo-description').value.trim()
  };
  const editId = document.getElementById('promo-edit-id').value;
  if (editId) {
    await db.collection('promoCodes').doc(editId).update(data);
    const idx = allPromos.findIndex(x=>x._id===editId);
    if (idx!==-1) allPromos[idx] = { _id:editId, ...data };
    toast('Promo code updated!');
  } else {
    const ref = await db.collection('promoCodes').add(data);
    allPromos.push({ _id: ref.id, ...data });
    toast('Promo code created!');
  }
  closeModal('promo-modal');
  renderPromos();
}

async function deletePromo(id) {
  if (!confirm('Delete this promo code?')) return;
  await db.collection('promoCodes').doc(id).delete();
  allPromos = allPromos.filter(x=>x._id!==id);
  toast('Promo code deleted');
  renderPromos();
}

// ===== ARTICLES =====
function renderArticles() {
  const c = document.getElementById('articles-grid');
  if (!allArticles.length) { c.innerHTML = emptyState('No articles yet. Create your first one!'); return; }
  c.innerHTML = allArticles.map(a=>`
    <div class="article-card">
      <div class="article-img">
        ${a.imageUrl ? `<img src="${a.imageUrl}" alt="${a.title}">` : '📰'}
      </div>
      <div class="article-body">
        <div class="article-category">${a.category||'General'}</div>
        <div class="article-title">${a.title||'Untitled'}</div>
        <div class="article-excerpt">${a.content||''}</div>
        <div class="article-footer">
          <div class="article-meta">By ${a.author||'Admin'} · ${fmtDate(a.createdAt)}</div>
          <div class="article-actions">
            <span class="badge-status ${a.published?'badge-active':'badge-expired'}">${a.published?'Live':'Draft'}</span>
            <button class="btn-icon" onclick="editArticle('${a._id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-icon danger" onclick="deleteArticle('${a._id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function openArticleModal() {
  document.getElementById('article-edit-id').value='';
  document.getElementById('article-title').value='';
  document.getElementById('article-category').value='';
  document.getElementById('article-image').value='';
  document.getElementById('article-content').value='';
  document.getElementById('article-author').value='';
  document.getElementById('article-published').checked=true;
  document.getElementById('article-modal-title').textContent='New Article';
  document.getElementById('image-preview').style.display='none';
  document.getElementById('image-preview').src='';
  document.getElementById('article-file-input').value='';
  openModal('article-modal');
}

function editArticle(id) {
  const a = allArticles.find(x=>x._id===id);
  if (!a) return;
  document.getElementById('article-edit-id').value=id;
  document.getElementById('article-title').value=a.title||'';
  document.getElementById('article-category').value=a.category||'';
  document.getElementById('article-image').value=a.imageUrl||'';
  document.getElementById('article-content').value=a.content||'';
  document.getElementById('article-author').value=a.author||'';
  document.getElementById('article-published').checked=!!a.published;
  document.getElementById('article-modal-title').textContent='Edit Article';
  if (a.imageUrl) {
    document.getElementById('image-preview').src=a.imageUrl;
    document.getElementById('image-preview').style.display='block';
  } else {
    document.getElementById('image-preview').style.display='none';
    document.getElementById('image-preview').src='';
  }
  document.getElementById('article-file-input').value='';
  openModal('article-modal');
}

async function saveArticle() {
  const title = document.getElementById('article-title').value.trim();
  if (!title) { toast('Title is required','error'); return; }
  const data = {
    title,
    category: document.getElementById('article-category').value.trim()||'General',
    imageUrl: document.getElementById('article-image').value.trim()||null,
    content: document.getElementById('article-content').value.trim(),
    author: document.getElementById('article-author').value.trim()||'Admin',
    published: document.getElementById('article-published').checked,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const editId = document.getElementById('article-edit-id').value;
  if (editId) {
    delete data.createdAt;
    await db.collection('articles').doc(editId).update(data);
    const idx = allArticles.findIndex(x=>x._id===editId);
    if (idx!==-1) allArticles[idx] = { _id:editId, ...allArticles[idx], ...data };
    toast('Article updated!');
  } else {
    const ref = await db.collection('articles').add(data);
    allArticles.unshift({ _id: ref.id, ...data });
    toast('Article published!');
  }
  closeModal('article-modal');
  renderArticles();
  renderDashboard();
}

async function deleteArticle(id) {
  if (!confirm('Delete this article?')) return;
  await db.collection('articles').doc(id).delete();
  allArticles = allArticles.filter(x=>x._id!==id);
  toast('Article deleted');
  renderArticles();
}

// ===== PRODUCTS =====
function renderProductsTable() {
  const search = (document.getElementById('product-search').value||'').toLowerCase();
  let prods = allProducts;
  if (search) prods = prods.filter(p=>(p.name||'').toLowerCase().includes(search));
  const c = document.getElementById('products-table-container');
  if (!prods.length) { c.innerHTML = emptyState('No products found'); return; }
  c.innerHTML = `<table>
    <thead><tr><th>Emoji</th><th>Name</th><th>Category</th><th>Price</th><th>MRP</th><th>Stock</th></tr></thead>
    <tbody>${prods.map(p=>`<tr>
      <td style="font-size:24px">${p.emoji||'🛒'}</td>
      <td class="table-name">${p.name}</td>
      <td>${p.category||'—'}</td>
      <td style="font-weight:700;color:#10b981">₹${p.price}</td>
      <td style="text-decoration:line-through;color:var(--text-muted)">₹${p.mrp||p.price}</td>
      <td><span class="badge-status ${p.stock>0?'badge-active':'badge-expired'}">${p.stock||0}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ===== HELPERS =====
function statusBadge(s) {
  const map = { Pending:'badge-pending', Processing:'badge-processing', Delivered:'badge-delivered', Cancelled:'badge-cancelled', 'Out for Delivery':'badge-processing' };
  return `<span class="badge-status ${map[s]||'badge-pending'}">${s||'Pending'}</span>`;
}

function emptyState(msg) {
  return `<div class="empty-state"><i class="fas fa-inbox"></i><p>${msg}</p></div>`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  if (ts.toDate) return ts.toDate().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  return new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function toast(msg, type='success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', info:'fa-info-circle' };
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type]||icons.success}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='all 0.3s'; setTimeout(()=>t.remove(),300); }, 3000);
}

// Close modals on overlay click
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key==='Enter' && document.getElementById('login-screen') && !document.getElementById('login-screen').classList.contains('hidden')) {
    adminLogin();
  }
});

// ===== INIT UPLOADS =====
function initImageUploads() {
  const dropZone = document.getElementById('image-drop-zone');
  const fileInput = document.getElementById('article-file-input');
  const imgPreview = document.getElementById('image-preview');
  const urlInput = document.getElementById('article-image');
  const progressText = document.getElementById('upload-progress');

  if (!dropZone) return;

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
    dropZone.style.background = 'rgba(108, 92, 231, 0.1)';
  });

  ['dragleave', 'dragend'].forEach(type => {
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-input)';
    });
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = 'var(--bg-input)';
    if (e.dataTransfer.files.length) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleImageUpload(e.target.files[0]);
    }
  });

  async function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
      toast('Please upload an image file', 'error');
      return;
    }

    // Show preview immediately from local blob
    const reader = new FileReader();
    reader.onload = (e) => {
      imgPreview.src = e.target.result;
      imgPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    progressText.style.display = 'block';
    progressText.textContent = 'Uploading... 0%';

    try {
      const storageRef = storage.ref('articles/' + Date.now() + '_' + file.name);
      const task = storageRef.put(file);

      task.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          progressText.textContent = 'Uploading... ' + Math.round(progress) + '%';
        }, 
        (error) => {
          console.error(error);
          toast('Upload failed: ' + error.message, 'error');
          progressText.style.display = 'none';
        }, 
        async () => {
          const downloadURL = await task.snapshot.ref.getDownloadURL();
          urlInput.value = downloadURL;
          progressText.textContent = 'Upload complete!';
          progressText.style.color = '#00b894';
          toast('Image uploaded successfully', 'success');
          setTimeout(() => {
            progressText.style.display = 'none';
            progressText.style.color = 'var(--primary)';
          }, 3000);
        }
      );
    } catch (e) {
      toast('Upload failed: ' + e.message, 'error');
      progressText.style.display = 'none';
    }
  }
}

// Initialize things that rely on DOM elements
document.addEventListener('DOMContentLoaded', () => {
  initImageUploads();
});
