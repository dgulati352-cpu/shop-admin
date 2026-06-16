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

// ===== ADMIN CREDENTIALS (stored in localStorage) =====
const CRED_VERSION = '2';
if (localStorage.getItem('qs_cred_version') !== CRED_VERSION) {
  localStorage.setItem('qs_admin_email', 'admin123');
  localStorage.setItem('qs_admin_pass',  'admin123');
  localStorage.setItem('qs_cred_version', CRED_VERSION);
}
function getAdminEmail() { return localStorage.getItem('qs_admin_email') || 'admin123'; }
function getAdminPass()  { return localStorage.getItem('qs_admin_pass')  || 'admin123'; }

// ===== STATE =====
let allOrders    = [];
let allCustomers = [];
let allPromos    = [];
let allArticles  = [];
let allProducts  = [];
let allCategories= [];
let allBanners   = [];
let allDeliveries = [];

// ===== AUTH =====
function adminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const pass  = document.getElementById('admin-password').value.trim();
  if (email === getAdminEmail() && pass === getAdminPass()) {
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
    await db.collection('orders').limit(1).get();
    toast('Database connected ✓', 'success');
  } catch(e) {
    toast('DB connection failed: ' + e.message, 'error');
    console.error('DB test failed:', e);
  }
  listenToOrders(); // real-time listener
  listenToDeliveries(); // real-time listener for delivery partners
  await Promise.all([fetchCustomers(), fetchPromos(), fetchArticles(), fetchProducts(), fetchCategories(), fetchBanners(), loadStoreSettings()]);
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
  // Use real-time listener so new articles appear immediately
  db.collection('articles').orderBy('createdAt','desc').onSnapshot(snap => {
    allArticles = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    // Re-render if the articles section is currently visible
    const sec = document.getElementById('section-articles');
    if (sec && !sec.classList.contains('hidden')) renderArticles();
  }, () => {
    // Fallback to one-time fetch if listener fails
    db.collection('articles').orderBy('createdAt','desc').get().then(s => {
      allArticles = s.docs.map(d => ({ _id: d.id, ...d.data() }));
    }).catch(()=>{});
  });
}

async function fetchProducts() {
  const snap = await db.collection('products').get().catch(()=>({docs:[]}));
  allProducts = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  if (!allProducts.length) {
    allProducts = JSON.parse(localStorage.getItem('qs_products') || '[]');
  }
}

async function fetchCategories() {
  // Use real-time listener so new categories appear immediately
  db.collection('categories').orderBy('order').onSnapshot(snap => {
    allCategories = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    const sec = document.getElementById('section-categories');
    if (sec && !sec.classList.contains('hidden')) renderCategoriesTable();
  }, () => {
    db.collection('categories').orderBy('order').get().then(s => {
      allCategories = s.docs.map(d => ({ _id: d.id, ...d.data() }));
    }).catch(()=>{});
  });
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
  if (name === 'products')  { fetchProducts().then(() => renderProductsTable()); }
  if (name === 'categories'){ renderCategoriesTable(); }
  if (name === 'banners')   { renderBannersTable(); }
  if (name === 'settings')  { loadStoreSettings(); }
  if (name === 'deliveries'){ renderDeliveriesTable(); }
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
      <td style="display:flex;gap:8px;">
        <button class="btn-icon" onclick="openOrderModal('${o._id}')"><i class="fas fa-eye"></i></button>
        <button class="btn-icon danger" onclick="deleteOrder('${o._id}', event)"><i class="fas fa-trash"></i></button>
      </td>
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
      <div class="detail-group" style="grid-column:1/-1">
        <label>Assigned Delivery Partner</label>
        <p>${o.deliveryBoyName ? `<b>${o.deliveryBoyName}</b> (${o.deliveryBoyPhone || ''})` : '<span style="color:var(--text-muted)">Not Assigned</span>'}</p>
      </div>
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
    
    <div style="display:flex; flex-direction:column; gap:16px; border-top:1px solid var(--border); padding-top:15px; margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:16px;">
        <div>
          <p style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px">Assign Delivery Partner:</p>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select id="assign-delivery-partner-select" style="padding: 8px 12px; border-radius: 8px; border: 1.5px solid var(--border); font-family: inherit; font-size: 14px; background: var(--bg-input); color: var(--text); min-width: 180px;">
              <option value="">Unassigned</option>
              ${allDeliveries.filter(d => d.status === 'approved').map(d => `
                <option value="${d._id}" ${o.deliveryBoyId === d.email ? 'selected' : ''}>${d.name} (${d.phone})</option>
              `).join('')}
            </select>
            <button class="btn-primary" onclick="assignDeliveryPartner('${o._id}')" style="padding: 8px 16px; border-radius: 8px; cursor:pointer;"><i class="fas fa-user-check"></i> Assign</button>
            
            ${o.deliveryBoyId ? `
              <button class="btn-primary" onclick="shareOrderWithPartner('${o._id}')" style="padding: 8px 16px; border-radius: 8px; background:#25d366; border:none; color:white; cursor:pointer;" title="Share via WhatsApp">
                <i class="fab fa-whatsapp"></i> Share
              </button>
              <button class="btn-primary" onclick="copyOrderDetails('${o._id}')" style="padding: 8px 16px; border-radius: 8px; background:#4b5563; border:none; color:white; cursor:pointer;" title="Copy to Clipboard">
                <i class="fas fa-copy"></i> Copy
              </button>
            ` : ''}
          </div>
        </div>
        
        <div>
          <p style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px">Update Status:</p>
          <div class="status-selector">
            ${['Pending','Processing','Out for Delivery','Delivered','Cancelled'].map(s=>`
              <button class="status-btn ${o.status===s?'active':''}" onclick="updateOrderStatus('${o._id}','${s}',this)">${s}</button>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div style="display:flex; justify-content:flex-end;">
        <button class="btn-icon danger" onclick="deleteOrder('${o._id}'); closeModal('order-modal');" style="padding: 10px; border-radius: 8px; border: 1px solid var(--danger); color: var(--danger);"><i class="fas fa-trash"></i> Delete Order</button>
        <button class="btn-icon" onclick="notifyWhatsApp('${o._id}');" style="padding: 10px; border-radius: 8px; border: 1px solid #25D366; background: #eafbee; color: #25D366; font-weight: 600;"><i class="fab fa-whatsapp"></i> Notify WhatsApp</button>
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

async function deleteOrder(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Are you sure you want to delete this order?')) return;
  try {
    await db.collection('orders').doc(id).delete();
    toast('Order deleted successfully', 'success');
    // Note: The onSnapshot listener will automatically remove it from the UI
  } catch (e) {
    console.error(e);
    toast('Failed to delete order', 'error');
  }
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

function populateArticleCategoryDropdown(selectedVal) {
  const sel = document.getElementById('article-category');
  if (!sel) return;
  const defaults = ["Sauces", "Frozen", "Seasoning", "Cakes Material", "Cake Mould", "Cake Premix", "Coffees", "Mojitos"];
  const existing = [...new Set(allArticles.map(a => a.category).filter(Boolean))];
  const allCats = [...new Set([...defaults, ...existing])];
  
  sel.innerHTML = allCats.map(c => `<option value="${c}">${c}</option>`).join('');
  if (selectedVal) {
    if (!allCats.includes(selectedVal)) {
      sel.innerHTML += `<option value="${selectedVal}">${selectedVal}</option>`;
    }
    sel.value = selectedVal;
  } else {
    sel.value = allCats[0] || "Sauces";
  }
}

function openArticleModal() {
  populateArticleCategoryDropdown(null);
  document.getElementById('article-edit-id').value='';
  document.getElementById('article-title').value='';
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
  populateArticleCategoryDropdown(a.category);
  document.getElementById('article-edit-id').value=id;
  document.getElementById('article-title').value=a.title||'';
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
  const category = document.getElementById('article-category').value.trim() || 'General';
  const data = {
    title,
    category,
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

  // Auto-create the article category in Firestore if it doesn't exist yet
  // This ensures the storefront immediately shows this category section
  await autoUpsertArticleCategory(category);

  closeModal('article-modal');
  renderArticles();
  renderDashboard();
}

async function autoUpsertArticleCategory(categoryName) {
  if (!categoryName) return;
  try {
    const catId = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const ref = db.collection('article_categories').doc(catId);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        name: categoryName,
        order: allArticles.filter(a => a.category === categoryName).length,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch(e) {
    console.warn('Could not auto-create article category:', e);
  }
}

async function deleteArticle(id) {
  if (!confirm('Delete this article?')) return;
  await db.collection('articles').doc(id).delete();
  allArticles = allArticles.filter(x=>x._id!==id);
  toast('Article deleted');
  renderArticles();
}

// ===== CATEGORIES =====
function renderCategoriesTable() {
  const c = document.getElementById('categories-table-container');
  if (!allCategories.length) { c.innerHTML = emptyState('No categories found'); return; }
  c.innerHTML = `<table>
    <thead><tr><th>Emoji</th><th>Name</th><th>Sort Order</th><th>Actions</th></tr></thead>
    <tbody>${allCategories.map(cat=>`<tr>
      <td style="font-size:24px">${cat.emoji||''}</td>
      <td class="table-name">${cat.name}</td>
      <td>${cat.order||1}</td>
      <td>
        <button class="btn-icon" onclick="editCategory('${cat._id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-icon danger" onclick="deleteCategory('${cat._id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function openCategoryModal() {
  document.getElementById('category-edit-id').value = '';
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-emoji').value = '';
  document.getElementById('cat-order').value = '1';
  document.getElementById('category-modal-title').textContent = 'New Category';
  openModal('category-modal');
}

function editCategory(id) {
  const c = allCategories.find(x => x._id === id);
  if(!c) return;
  document.getElementById('category-edit-id').value = id;
  document.getElementById('cat-name').value = c.name || '';
  document.getElementById('cat-emoji').value = c.emoji || '';
  document.getElementById('cat-order').value = c.order || 1;
  document.getElementById('category-modal-title').textContent = 'Edit Category';
  openModal('category-modal');
}

async function saveCategory() {
  const name = document.getElementById('cat-name').value.trim();
  if(!name) { toast('Category name required', 'error'); return; }
  
  const data = {
    name,
    emoji: document.getElementById('cat-emoji').value.trim(),
    order: parseInt(document.getElementById('cat-order').value) || 1
  };

  const editId = document.getElementById('category-edit-id').value;
  if (editId) {
    await db.collection('categories').doc(editId).update(data);
    const idx = allCategories.findIndex(x=>x._id===editId);
    if(idx!==-1) allCategories[idx] = { _id:editId, ...data };
    toast('Category updated');
  } else {
    const ref = await db.collection('categories').add(data);
    allCategories.push({ _id: ref.id, ...data });
    toast('Category created');
  }
  allCategories.sort((a,b)=>a.order - b.order);
  closeModal('category-modal');
  renderCategoriesTable();
}

async function deleteCategory(id) {
  if(!confirm('Delete this category? Products in it will still exist but may not display.')) return;
  await db.collection('categories').doc(id).delete();
  allCategories = allCategories.filter(x => x._id !== id);
  toast('Category deleted');
  renderCategoriesTable();
}

// ===== PRODUCTS =====
function populateCategoryDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const currentVal = sel.value;

  // Hardcoded defaults matching the storefront categories
  const defaults = ["Sauces", "Frozen", "Seasoning", "Cakes Material", "Cake Mould", "Cake Premix", "Coffees", "Mojitos"];

  // Use Firebase categories if they exist, merge with defaults
  let cats = [];
  if (allCategories.length > 0) {
    cats = allCategories.map(c => ({ name: c.name, emoji: c.emoji || '' }));
    // Add any defaults not already in Firebase categories
    defaults.forEach(d => {
      if (!cats.find(c => c.name.toLowerCase() === d.toLowerCase())) {
        cats.push({ name: d, emoji: '' });
      }
    });
  } else {
    // Fall back to defaults + any unique cats from products
    const productCats = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    const allNames = [...new Set([...defaults, ...productCats])];
    cats = allNames.map(name => ({ name, emoji: '' }));
  }

  sel.innerHTML = '<option value="">Select Category</option>' +
    cats.map(c => `<option value="${c.name}">${c.emoji ? c.emoji + ' ' : ''}${c.name}</option>`).join('');
  if (currentVal) sel.value = currentVal;
}

function renderProductsTable() {
  const search = (document.getElementById('product-search').value||'').toLowerCase();
  let prods = allProducts;
  if (search) prods = prods.filter(p=>(p.name||'').toLowerCase().includes(search));
  const c = document.getElementById('products-table-container');
  if (!prods.length) { c.innerHTML = emptyState('No products found'); return; }
  c.innerHTML = `<table>
    <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>MRP</th><th>Stock</th><th>Actions</th></tr></thead>
    <tbody>${prods.map(p=>`<tr>
      <td>${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">` : '<span style="font-size:24px">📦</span>'}</td>
      <td class="table-name">${p.name}</td>
      <td>${p.category||'—'}</td>
      <td style="font-weight:700;color:#10b981">₹${p.price||0}</td>
      <td style="text-decoration:line-through;color:var(--text-muted)">₹${p.mrp||p.price||0}</td>
      <td><span class="badge-status ${p.stock>0?'badge-active':'badge-expired'}">${p.stock||0}</span></td>
      <td>
        <button class="btn-icon" onclick="editProduct('${p._id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-icon danger" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function openProductModal() {
  populateCategoryDropdown('prod-category');
  document.getElementById('product-edit-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-category').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-mrp').value = '';
  document.getElementById('prod-unit').value = '';
  document.getElementById('prod-stock').value = '100';
  document.getElementById('prod-image').value = '';
  document.getElementById('prod-desc').value = '';
  document.getElementById('prod-image-preview').style.display = 'none';
  document.getElementById('prod-image-preview').src = '';
  document.getElementById('prod-file-input').value = '';
  document.getElementById('product-modal-title').textContent = 'New Product';
  
  // Reset sizes
  document.getElementById('prod-enable-sizes').checked = false;
  document.getElementById('sizes-tbody').innerHTML = '';
  toggleSizesSection();

  openModal('product-modal');
}

function editProduct(id) {
  populateCategoryDropdown('prod-category');
  const p = allProducts.find(x => x._id === id);
  if(!p) return;
  document.getElementById('product-edit-id').value = id;
  document.getElementById('prod-name').value = p.name || '';
  
  // if category isn't in dropdown, add it temporarily
  const sel = document.getElementById('prod-category');
  if(p.category && !Array.from(sel.options).find(o=>o.value===p.category)) {
    sel.innerHTML += `<option value="${p.category}">${p.category}</option>`;
  }
  
  document.getElementById('prod-category').value = p.category || '';
  document.getElementById('prod-price').value = p.price || 0;
  document.getElementById('prod-mrp').value = p.mrp || '';
  document.getElementById('prod-unit').value = p.unit || '';
  document.getElementById('prod-stock').value = p.stock || 0;
  document.getElementById('prod-image').value = p.imageUrl || '';
  document.getElementById('prod-desc').value = p.desc || '';
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  if (p.imageUrl) {
    document.getElementById('prod-image-preview').src = p.imageUrl;
    document.getElementById('prod-image-preview').style.display = 'block';
  } else {
    document.getElementById('prod-image-preview').style.display = 'none';
    document.getElementById('prod-image-preview').src = '';
  }
  document.getElementById('prod-file-input').value = '';
  
  // Set sizes
  const sizesTbody = document.getElementById('sizes-tbody');
  sizesTbody.innerHTML = '';
  
  if (p.hasSizes && Array.isArray(p.sizes)) {
    document.getElementById('prod-enable-sizes').checked = true;
    p.sizes.forEach(sz => {
      addSizeRow(sz.size, sz.price, sz.mrp, sz.stock);
    });
  } else {
    document.getElementById('prod-enable-sizes').checked = false;
  }
  toggleSizesSection();

  openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('prod-name').value.trim();
  if(!name) { toast('Product name is required', 'error'); return; }

  const enableSizes = document.getElementById('prod-enable-sizes').checked;
  let price = 0;
  let mrp = 0;
  let unit = '';
  let stock = 0;
  let sizes = [];

  if (enableSizes) {
    const rows = document.querySelectorAll('#sizes-tbody tr');
    rows.forEach(row => {
      const sizeVal = row.querySelector('.size-name').value.trim();
      const priceVal = parseInt(row.querySelector('.size-price').value) || 0;
      const mrpVal = parseInt(row.querySelector('.size-mrp').value) || priceVal;
      const stockVal = parseInt(row.querySelector('.size-stock').value) || 0;
      
      if (sizeVal) {
        sizes.push({
          size: sizeVal,
          price: priceVal,
          mrp: mrpVal,
          stock: stockVal
        });
      }
    });

    if (sizes.length === 0) {
      toast('Please add at least one size variant or disable multiple sizes', 'error');
      return;
    }

    // Set main product fields based on first size/variant for backward compatibility
    price = sizes[0].price;
    mrp = sizes[0].mrp;
    unit = sizes[0].size;
    stock = sizes[0].stock;
  } else {
    price = parseInt(document.getElementById('prod-price').value) || 0;
    mrp = parseInt(document.getElementById('prod-mrp').value) || price;
    unit = document.getElementById('prod-unit').value.trim() || '1 unit';
    stock = parseInt(document.getElementById('prod-stock').value) || 0;

    if(price <= 0) { toast('Valid Sale Price is required', 'error'); return; }
  }

  let imageUrl = document.getElementById('prod-image').value.trim() || null;

  // If base64 is somehow too large (>800KB), strip it to avoid Firestore limit
  if (imageUrl && imageUrl.startsWith('data:') && imageUrl.length > 800000) {
    toast('Image too large, saving without image', 'error');
    imageUrl = null;
  }

  const data = {
    name,
    category: document.getElementById('prod-category').value,
    price,
    mrp,
    unit,
    stock,
    imageUrl,
    desc: document.getElementById('prod-desc').value.trim(),
    hasSizes: enableSizes,
    sizes: enableSizes ? sizes : null,
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4)
  };

  try {
    const editId = document.getElementById('product-edit-id').value;
    if(editId) {
      const oldP = allProducts.find(x=>x._id===editId);
      if(oldP && oldP.id) data.id = oldP.id;
      
      await db.collection('products').doc(editId).set(data, {merge:true});
      const idx = allProducts.findIndex(x=>x._id===editId);
      if(idx!==-1) allProducts[idx] = { _id:editId, ...data };
      toast('Product updated');
    } else {
      const ref = await db.collection('products').add(data);
      allProducts.unshift({ _id: ref.id, ...data });
      toast('Product created');
    }
  } catch(e) {
    console.error('Product save failed:', e);
    toast('Save failed: ' + e.message, 'error');
    return;
  }

  // Auto-create category in Firestore if it doesn't exist
  if (data.category) {
    await autoUpsertCategory(data.category);
  }

  closeModal('product-modal');
  renderProductsTable();
}

async function autoUpsertCategory(categoryName) {
  try {
    const exists = allCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    if (!exists) {
      const data = {
        name: categoryName,
        emoji: '🛒',
        order: allCategories.length + 1
      };
      const ref = await db.collection('categories').add(data);
      // Wait for real-time listener to pick it up, or push locally:
      // allCategories.push({ _id: ref.id, ...data });
    }
  } catch (e) {
    console.warn('Auto-upsert category failed:', e);
  }
}

// ===== MULTIPLE SIZES / VARIANTS HELPERS =====
function toggleSizesSection() {
  const isEnabled = document.getElementById('prod-enable-sizes').checked;
  const section = document.getElementById('sizes-section');
  section.style.display = isEnabled ? 'block' : 'none';
  
  // Hide/show single pricing inputs
  const priceGroup = document.getElementById('prod-price').closest('.input-group');
  const mrpGroup = document.getElementById('prod-mrp').closest('.input-group');
  const unitGroup = document.getElementById('prod-unit').closest('.input-group');
  const stockGroup = document.getElementById('prod-stock').closest('.input-group');
  
  if (isEnabled) {
    priceGroup.style.display = 'none';
    mrpGroup.style.display = 'none';
    unitGroup.style.display = 'none';
    stockGroup.style.display = 'none';
  } else {
    priceGroup.style.display = 'flex';
    mrpGroup.style.display = 'flex';
    unitGroup.style.display = 'flex';
    stockGroup.style.display = 'flex';
  }
}

function addSizeRow(size = '', price = '', mrp = '', stock = '100') {
  const tbody = document.getElementById('sizes-tbody');
  const tr = document.createElement('tr');
  tr.style.borderBottom = '1px solid var(--border)';
  tr.innerHTML = `
    <td style="padding: 6px 4px;">
      <input type="text" class="size-name" value="${size}" placeholder="e.g. S, 1 Kg" style="width:90%; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-input); color:var(--text); outline:none;">
    </td>
    <td style="padding: 6px 4px;">
      <input type="number" class="size-price" value="${price}" placeholder="₹ Price" style="width:90%; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-input); color:var(--text); outline:none;">
    </td>
    <td style="padding: 6px 4px;">
      <input type="number" class="size-mrp" value="${mrp}" placeholder="₹ MRP" style="width:90%; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-input); color:var(--text); outline:none;">
    </td>
    <td style="padding: 6px 4px;">
      <input type="number" class="size-stock" value="${stock}" placeholder="Stock" style="width:90%; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-input); color:var(--text); outline:none;">
    </td>
    <td style="padding: 6px 4px; text-align: center;">
      <button type="button" onclick="this.closest('tr').remove()" class="btn-icon danger" style="padding: 8px;"><i class="fas fa-trash"></i></button>
    </td>
  `;
  tbody.appendChild(tr);
}


async function deleteProduct(id) {
  if(!confirm('Delete this product?')) return;
  await db.collection('products').doc(id).delete();
  allProducts = allProducts.filter(x => x._id !== id);
  toast('Product deleted');
  renderProductsTable();
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
function setupDropZone(dropZoneId, fileInputId, previewId, urlInputId, progressId) {
  const dropZone = document.getElementById(dropZoneId);
  const fileInput = document.getElementById(fileInputId);
  const imgPreview = document.getElementById(previewId);
  const urlInput = document.getElementById(urlInputId);
  const progressText = document.getElementById(progressId);

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
      handleImageUpload(e.dataTransfer.files[0], imgPreview, urlInput, progressText);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleImageUpload(e.target.files[0], imgPreview, urlInput, progressText);
    }
  });
}

async function handleImageUpload(file, imgPreview, urlInput, progressText) {
  if (!file.type.startsWith('image/')) {
    toast('Please upload an image file', 'error');
    return;
  }

  progressText.style.display = 'block';
  progressText.textContent = 'Processing... 0%';

  try {
    const compressed = await compressImage(file, 400, 0.5, (pct) => {
      progressText.textContent = `Processing... ${pct}%`;
    });

    // Show preview
    imgPreview.src = compressed;
    imgPreview.style.display = 'block';

    // Store base64 directly (no Firebase Storage needed)
    urlInput.value = compressed;

    progressText.textContent = 'Image ready ✓';
    progressText.style.color = '#00b894';
    toast('Image ready!', 'success');
    setTimeout(() => {
      progressText.style.display = 'none';
      progressText.style.color = 'var(--primary)';
    }, 2000);
  } catch (e) {
    toast('Could not process image: ' + e.message, 'error');
    progressText.style.display = 'none';
  }
}

function initImageUploads() {
  // Article image upload
  setupDropZone('image-drop-zone', 'article-file-input', 'image-preview', 'article-image', 'upload-progress');
  // Product image upload
  setupDropZone('prod-image-drop-zone', 'prod-file-input', 'prod-image-preview', 'prod-image', 'prod-upload-progress');
}

// Compress image to base64 using canvas (no external storage needed)
function compressImage(file, maxWidth, quality, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      if (onProgress) onProgress(30);
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        if (onProgress) onProgress(60);
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        if (onProgress) onProgress(90);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (onProgress) onProgress(100);
        resolve(dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Initialize things that rely on DOM elements
document.addEventListener('DOMContentLoaded', () => {
  initImageUploads();
  
  // Banner Live Preview
  const bannerBgInput = document.getElementById('banner-bg');
  const bannerTitleInput = document.getElementById('banner-title');
  const bannerDescInput = document.getElementById('banner-desc');
  
  const updatePreview = () => {
    const preview = document.getElementById('banner-preview');
    if(preview) {
      preview.style.background = bannerBgInput.value || '#333';
      document.getElementById('banner-preview-title').textContent = bannerTitleInput.value || 'Title Preview';
      document.getElementById('banner-preview-desc').textContent = bannerDescInput.value || 'Description Preview';
    }
  };
  
  if (bannerBgInput) bannerBgInput.addEventListener('input', updatePreview);
  if (bannerTitleInput) bannerTitleInput.addEventListener('input', updatePreview);
  if (bannerDescInput) bannerDescInput.addEventListener('input', updatePreview);
});

// ===== BANNERS =====
async function fetchBanners() {
  try {
    const snap = await db.collection('banners').get();
    
    if (snap.empty) {
      // Seed default banners if database is completely empty
      const defaultSlides = [
        { title: "Super Fast Delivery!", desc: "Get all your grocery essentials delivered in 10 minutes.", bg: "linear-gradient(135deg, #10b981, #059669)", order: 1 },
        { title: "Special Deal: 10% OFF", desc: "Use coupon SAVE10 to save on fruits & veg today.", bg: "linear-gradient(135deg, #f59e0b, #d97706)", order: 2 },
        { title: "Organic & Fresh", desc: "Straight from the local farm to your doorstep.", bg: "linear-gradient(135deg, #3b82f6, #2563eb)", order: 3 }
      ];
      const batch = db.batch();
      defaultSlides.forEach(slide => {
        const docRef = db.collection('banners').doc();
        batch.set(docRef, slide);
      });
      await batch.commit();
      
      // Fetch again after seeding
      const newSnap = await db.collection('banners').get();
      allBanners = newSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      allBanners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    
    allBanners.sort((a,b) => (a.order || 0) - (b.order || 0));
  } catch(e) { console.error('Fetch banners failed:', e); }
}

function renderBannersTable() {
  const container = document.getElementById('banners-table-container');
  if (!allBanners.length) { container.innerHTML = emptyState('No banners found'); return; }

  let html = `<table>
    <thead><tr><th>Order</th><th>Preview</th><th>Title</th><th>Description</th><th>Actions</th></tr></thead>
    <tbody>`;
  allBanners.forEach(b => {
    html += `<tr>
      <td>${b.order || 0}</td>
      <td>
        <div style="width:100px; height:40px; background:${b.bg}; border-radius:8px; border:1px solid var(--border);"></div>
      </td>
      <td class="table-name">${b.title}</td>
      <td><small style="color:var(--text-muted);">${b.desc}</small></td>
      <td>
        <button class="btn-icon" onclick="openBannerModal('${b.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-icon danger" onclick="deleteBanner('${b.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function openBannerModal(id = null) {
  document.getElementById('banner-edit-id').value = id || '';
  if (id) {
    const b = allBanners.find(x => x.id === id);
    document.getElementById('banner-modal-title').textContent = 'Edit Banner';
    document.getElementById('banner-title').value = b.title;
    document.getElementById('banner-desc').value = b.desc || '';
    document.getElementById('banner-bg').value = b.bg;
    document.getElementById('banner-order').value = b.order || 1;
  } else {
    document.getElementById('banner-modal-title').textContent = 'New Banner';
    document.getElementById('banner-title').value = '';
    document.getElementById('banner-desc').value = '';
    document.getElementById('banner-bg').value = 'linear-gradient(135deg, #10b981, #059669)';
    document.getElementById('banner-order').value = allBanners.length + 1;
  }
  
  // Trigger preview update
  document.getElementById('banner-title').dispatchEvent(new Event('input'));
  
  document.getElementById('banner-modal').classList.remove('hidden');
}

function setBannerBg(bg) {
  document.getElementById('banner-bg').value = bg;
  document.getElementById('banner-bg').dispatchEvent(new Event('input'));
}

async function saveBanner() {
  const id = document.getElementById('banner-edit-id').value;
  const title = document.getElementById('banner-title').value.trim();
  const desc = document.getElementById('banner-desc').value.trim();
  const bg = document.getElementById('banner-bg').value.trim();
  const order = parseInt(document.getElementById('banner-order').value) || 1;

  if (!title || !bg) return toast('Please fill title and background', 'error');

  const data = { title, desc, bg, order };

  try {
    if (id) {
      await db.collection('banners').doc(id).update(data);
      toast('Banner updated', 'success');
    } else {
      await db.collection('banners').add(data);
      toast('Banner created', 'success');
    }
    closeModal('banner-modal');
    await fetchBanners();
    renderBannersTable();
  } catch(e) {
    console.error(e);
    toast('Error saving banner', 'error');
  }
}

async function deleteBanner(id) {
  if (!confirm('Delete this banner?')) return;
  try {
    await db.collection('banners').doc(id).delete();
    toast('Banner deleted', 'success');
    await fetchBanners();
    renderBannersTable();
  } catch(e) {
    console.error(e);
    toast('Error deleting banner', 'error');
  }
}

// ===== STORE SETTINGS =====
async function loadStoreSettings() {
  try {
    const snap = await db.collection('settings').doc('store').get();
    if (snap.exists) {
      const s = snap.data();
      const pwaToggle = document.getElementById('setting-pwa-required');
      const deliveryFee = document.getElementById('setting-delivery-fee');
      const freeDelivery = document.getElementById('setting-free-delivery');
      const deliveryTime = document.getElementById('setting-delivery-time');
      if (pwaToggle) pwaToggle.checked = !!s.requirePwaInstall;
      if (deliveryFee) deliveryFee.value = s.deliveryFee ?? 25;
      if (freeDelivery) freeDelivery.value = s.freeDeliveryAbove ?? 300;
      if (deliveryTime) deliveryTime.value = s.deliveryTime || '10 min';
    }
  } catch(e) {
    console.warn('Could not load store settings:', e);
  }
}

async function saveStoreSettings() {
  const data = {
    requirePwaInstall: document.getElementById('setting-pwa-required').checked,
    deliveryFee: parseInt(document.getElementById('setting-delivery-fee').value) || 25,
    freeDeliveryAbove: parseInt(document.getElementById('setting-free-delivery').value) || 300,
    deliveryTime: document.getElementById('setting-delivery-time').value.trim() || '10 min'
  };
  try {
    await db.collection('settings').doc('store').set(data, { merge: true });
    toast('Settings saved ✓', 'success');
  } catch(e) {
    console.error('Settings save failed:', e);
    toast('Failed to save settings: ' + e.message, 'error');
  }
}

// ===== CHANGE CREDENTIALS =====
function togglePassVis(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

function openChangeCredentialsModal() {
  // Refresh display of current username
  const disp = document.getElementById('current-creds-display');
  if (disp) disp.textContent = getAdminEmail();

  document.getElementById('new-admin-email').value = getAdminEmail();
  document.getElementById('new-admin-pass').value = '';
  document.getElementById('new-admin-pass-confirm').value = '';
  document.getElementById('current-admin-pass-verify').value = '';
  openModal('credentials-modal');
}

function saveCredentials() {
  const currentPass    = document.getElementById('current-admin-pass-verify').value.trim();
  const newEmail       = document.getElementById('new-admin-email').value.trim();
  const newPass        = document.getElementById('new-admin-pass').value;
  const newPassConfirm = document.getElementById('new-admin-pass-confirm').value;

  if (currentPass !== getAdminPass()) {
    toast('Current password is incorrect', 'error');
    return;
  }
  if (!newEmail) {
    toast('Username / email cannot be empty', 'error');
    return;
  }
  if (newPass && newPass !== newPassConfirm) {
    toast('New passwords do not match', 'error');
    return;
  }
  if (newPass && newPass.length < 6) {
    toast('Password must be at least 6 characters', 'error');
    return;
  }

  localStorage.setItem('qs_admin_email', newEmail);
  if (newPass) localStorage.setItem('qs_admin_pass', newPass);

  toast('Credentials updated ✓', 'success');
  closeModal('credentials-modal');
}

async function clearAllOrders() {
  if (!confirm('⚠️ Are you sure you want to delete ALL orders? This cannot be undone.')) return;
  if (!confirm('This will permanently delete all order history and reset the counter to #1. Continue?')) return;

  const statusEl = document.getElementById('clear-orders-status');
  statusEl.textContent = 'Deleting orders...';
  statusEl.style.color = 'var(--warning)';

  try {
    // Delete all orders in batches
    let deleted = 0;
    let snap;
    do {
      snap = await db.collection('orders').limit(100).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += snap.docs.length;
      statusEl.textContent = `Deleted ${deleted} order(s)...`;
    } while (!snap.empty);

    // Reset the order counter
    await db.collection('counters').doc('orders').set({ lastOrderNumber: 0 });

    allOrders = [];
    renderDashboard();
    if (document.getElementById('section-orders').classList.contains('active')) renderOrdersTable();

    statusEl.textContent = `✓ All ${deleted} order(s) deleted. Counter reset to #1.`;
    statusEl.style.color = 'var(--success)';
    toast(`${deleted} order(s) deleted, counter reset`, 'success');
  } catch(e) {
    console.error('Clear orders failed:', e);
    statusEl.textContent = 'Failed: ' + e.message;
    statusEl.style.color = 'var(--danger)';
    toast('Failed to clear orders: ' + e.message, 'error');
  }
}

// ==================== DELIVERY PARTNERS ====================
function listenToDeliveries() {
  db.collection('delivery_partners').onSnapshot(snap => {
    allDeliveries = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    const sec = document.getElementById('section-deliveries');
    if (sec && !sec.classList.contains('hidden')) renderDeliveriesTable();
  }, err => {
    console.error('Deliveries listener error:', err);
  });
}

function renderDeliveriesTable() {
  const filter = document.getElementById('delivery-filter-status').value;
  const search = (document.getElementById('delivery-search').value || '').toLowerCase();
  
  let partners = allDeliveries;
  if (filter) partners = partners.filter(p => p.status === filter);
  if (search) partners = partners.filter(p => 
    (p.name || '').toLowerCase().includes(search) || 
    (p.phone || '').toLowerCase().includes(search) || 
    (p.email || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('deliveries-table-container');
  if (!partners.length) {
    container.innerHTML = emptyState('No delivery partners found');
    return;
  }

  container.innerHTML = `<table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Phone</th>
        <th>Email</th>
        <th>Vehicle No</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${partners.map(p => `
        <tr>
          <td class="table-name">${p.name || '—'}</td>
          <td>${p.phone || '—'}</td>
          <td>${p.email || '—'}</td>
          <td>${p.vehicleNumber || '—'}</td>
          <td>
            <span class="badge-status ${
              p.status === 'approved' ? 'badge-active' : 
              p.status === 'rejected' ? 'badge-expired' : 'badge-pending'
            }">${p.status || 'pending'}</span>
          </td>
          <td>
            <div style="display:flex; gap:8px;">
              ${p.status !== 'approved' ? `
                <button class="btn-sm success" onclick="updateDeliveryStatus('${p._id}', 'approved')" style="padding: 4px 8px; font-size:12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer;"><i class="fas fa-check"></i> Approve</button>
              ` : ''}
              ${p.status !== 'rejected' ? `
                <button class="btn-sm danger" onclick="updateDeliveryStatus('${p._id}', 'rejected')" style="padding: 4px 8px; font-size:12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer;"><i class="fas fa-times"></i> Reject</button>
              ` : ''}
              <button class="btn-icon danger" onclick="deleteDeliveryPartner('${p._id}')" style="margin-left:4px;"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

async function updateDeliveryStatus(id, status) {
  try {
    await db.collection('delivery_partners').doc(id).update({ status });
    toast(`Partner status updated to ${status}`, 'success');
  } catch (e) {
    console.error('Error updating status:', e);
    toast('Error updating status: ' + e.message, 'error');
  }
}

async function deleteDeliveryPartner(id) {
  if (!confirm('Are you sure you want to delete this delivery partner?')) return;
  try {
    await db.collection('delivery_partners').doc(id).delete();
    toast('Delivery partner deleted', 'success');
  } catch (e) {
    console.error('Error deleting partner:', e);
    toast('Error deleting partner: ' + e.message, 'error');
  }
}

async function assignDeliveryPartner(orderId) {
  const select = document.getElementById('assign-delivery-partner-select');
  const partnerId = select.value;
  
  let data = {
    deliveryBoyId: null,
    deliveryBoyName: null,
    deliveryBoyPhone: null
  };
  
  if (partnerId) {
    const partner = allDeliveries.find(d => d._id === partnerId);
    if (partner) {
      data = {
        deliveryBoyId: partner.email,
        deliveryBoyName: partner.name,
        deliveryBoyPhone: partner.phone
      };
    }
  }
  
  try {
    await db.collection('orders').doc(orderId).update(data);
    
    // Update local state
    const order = allOrders.find(o => o._id === orderId);
    if (order) {
      order.deliveryBoyId = data.deliveryBoyId;
      order.deliveryBoyName = data.deliveryBoyName;
      order.deliveryBoyPhone = data.deliveryBoyPhone;
    }
    
    toast(partnerId ? 'Delivery partner assigned ✓' : 'Delivery partner unassigned ✓', 'success');
    renderOrdersTable();
    openOrderModal(orderId);
  } catch (e) {
    console.error('Error assigning partner:', e);
    toast('Assignment failed: ' + e.message, 'error');
  }
}

function generateShareText(o) {
  const itemsText = (o.items || []).map(i => `- ${i.name} (Qty: ${i.quantity})`).join('\n');
  return `*Delivery Details for Order #${o.id || o._id}*
-----------------------------
*Customer:* ${o.customerName || '—'}
*Phone:* ${o.customerPhone || '—'}
*Email:* ${o.customerEmail || '—'}
*Address:* ${o.address || '—'}
-----------------------------
*Items to Deliver:*
${itemsText}
-----------------------------
*Total Amount:* ₹${o.total || 0} (${o.paymentMethod || '—'})
-----------------------------
Please deliver as soon as possible!`;
}

function shareOrderWithPartner(orderId) {
  const o = allOrders.find(x => x._id === orderId);
  if (!o) return;
  const text = encodeURIComponent(generateShareText(o));
  const phone = o.deliveryBoyPhone ? o.deliveryBoyPhone.replace(/\D/g, '') : '';
  const formattedPhone = phone.length === 10 ? '91' + phone : phone;
  window.open(`https://wa.me/${formattedPhone}?text=${text}`, '_blank');
}

function copyOrderDetails(orderId) {
  const o = allOrders.find(x => x._id === orderId);
  if (!o) return;
  const text = generateShareText(o);
  navigator.clipboard.writeText(text).then(() => {
    toast('Details copied to clipboard ✓', 'success');
  }).catch(err => {
    toast('Failed to copy: ' + err, 'error');
  });
}

// ==================== PWA & INSTALLATION ====================

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) installBtn.classList.remove('hidden');
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function promptAppInstall() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && !isStandalone()) {
    document.getElementById('ios-install-modal').classList.remove('hidden');
    return;
  }
  
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        const installBtn = document.getElementById('install-app-btn');
        if (installBtn) installBtn.classList.add('hidden');
      }
      deferredPrompt = null;
    });
  } else {
    alert("Please use your browser's menu (e.g., 'Add to Home Screen') to install this admin panel.");
  }
}

// Show install button for everyone not in standalone mode
window.addEventListener('DOMContentLoaded', () => {
  if (!isStandalone()) {
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) installBtn.classList.remove('hidden');
  }
});
