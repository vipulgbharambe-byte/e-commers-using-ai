(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cartKey = 'cbb_cart_v1';
  let products = [];
  let currentUser = null;
  let toastTimer;

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD') headers['X-CBB-Request'] = '1';
    if (options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function notify(message) {
    let el = $('.cbb-toast');
    if (!el) { el = document.createElement('div'); el.className = 'cbb-toast'; document.body.appendChild(el); }
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function getCart() { try { return JSON.parse(localStorage.getItem(cartKey) || '[]'); } catch { return []; } }
  function setCart(items) { localStorage.setItem(cartKey, JSON.stringify(items)); updateCartCount(); }
  function updateCartCount() {
    const count = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    $$('.cbb-count').forEach(el => { el.textContent = String(count); el.hidden = count === 0; });
  }
  function addToCart(productId, quantity = 1) {
    const product = products.find(item => item.id === productId);
    if (!product || !product.available) return notify('This item is currently unavailable.');
    const cart = getCart(); const existing = cart.find(item => item.productId === productId);
    if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
    else cart.push({ productId, quantity });
    setCart(cart); notify(`${product.name} added to your cart.`);
  }
  function productForName(name) {
    const key = normalize(name);
    return products.find(p => normalize(p.name) === key) || (key === 'classic cold coffee' ? products.find(p => p.id === 'cold-coffee') : null);
  }
  function injectNavigation() {
    const header = $('header.navbar');
    if (!header || $('.cbb-utility-links', header)) return;
    const utilities = document.createElement('div'); utilities.className = 'cbb-utility-links';
    utilities.innerHTML = `
      <a class="cbb-nav-link" href="cart.html">Cart <span class="cbb-count" hidden>0</span></a>
      <a class="cbb-nav-link cbb-account-link" href="account.html">Sign in</a>
      <a class="cbb-nav-link" href="support.html">Help</a>
    `;
    header.appendChild(utilities);
    updateCartCount();
  }
  function appendAddButton(container, product) {
    if ($('.cbb-add-button', container)) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cbb-add-button'; button.textContent = product.available ? 'Add to cart' : 'Unavailable';
    button.disabled = !product.available; button.addEventListener('click', () => addToCart(product.id));
    container.appendChild(button);
  }
  function initOriginalPages() {
    injectNavigation();
    const menuItems = $$('.menu-item');
    if (menuItems.length) {
      const main = $('main');
      const toolbar = document.createElement('div'); toolbar.className = 'cbb-toolbar';
      toolbar.innerHTML = `<input class="cbb-search" type="search" aria-label="Search menu" placeholder="Search coffee, drinks, food and desserts"><button class="cbb-filter active" data-category="all" type="button">All items</button><button class="cbb-filter" data-category="coffee" type="button">Coffee</button><button class="cbb-filter" data-category="drinks" type="button">Drinks</button><button class="cbb-filter" data-category="food" type="button">Food</button><button class="cbb-filter" data-category="desserts" type="button">Desserts</button>`;
      const tabs = $('.menu-tabs'); if (tabs) tabs.insertAdjacentElement('afterend', toolbar); else if (main) main.insertAdjacentElement('afterbegin', toolbar);
      const seen = new Set();
      menuItems.forEach(item => {
        const title = $('h3', item); const strong = $('strong', item); if (!title || !strong) return;
        const product = productForName(title.textContent);
        if (!product) return;
        seen.add(product.id); strong.textContent = money(product.price);
        if (product.available) appendAddButton(item, product);
        else { const stock = document.createElement('span'); stock.className = 'cbb-stock'; stock.textContent = 'Currently unavailable'; item.appendChild(stock); }
      });
      // New admin-created menu products are appended under their matching original category.
      products.filter(p => !seen.has(p.id) && !p.archived).forEach(product => {
        const section = $(`#${CSS.escape(normalize(product.category).replace(/\s+/g, '-'))}`) || $(`#${CSS.escape(String(product.category).toLowerCase())}`);
        const grid = section && $('.menu-grid', section); if (!grid) return;
        const card = document.createElement('article'); card.className = 'menu-item cbb-new-menu-item';
        card.innerHTML = `<p class="menu-label">NEW</p><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description)}</p><strong>${money(product.price)}</strong>`;
        appendAddButton(card, product); grid.appendChild(card);
      });
      const search = $('.cbb-search', toolbar); let category = 'all';
      const filter = () => menuItems.concat($$('.cbb-new-menu-item')).forEach(item => {
        const text = normalize(item.textContent); const section = item.closest('.menu-category'); const sectionName = section?.id || '';
        const categoryMatch = category === 'all' || category === sectionName || (category === 'drinks' && sectionName === 'drinks');
        item.hidden = !(categoryMatch && text.includes(normalize(search.value)));
      });
      search?.addEventListener('input', filter);
      $$('.cbb-filter', toolbar).forEach(button => button.addEventListener('click', () => { category = button.dataset.category; $$('.cbb-filter', toolbar).forEach(b => b.classList.toggle('active', b === button)); filter(); }));
    }
    $$('.product-card').forEach(card => {
      const title = $('h3', card); if (!title) return;
      const product = productForName(title.textContent); if (product) appendAddButton(card, product);
    });
    $$('a[href="contact.html"].nav-button').forEach(link => { if (link.textContent.toLowerCase().includes('location')) return; });
  }
  function installChat() {
    if ($('.cbb-chat')) return;
    const widget = document.createElement('aside'); widget.className = 'cbb-chat'; widget.innerHTML = `
      <section class="cbb-chat-window" aria-label="Customer care chat">
        <div class="cbb-chat-head"><strong>Brew & Bloom Assistant</strong><button class="cbb-chat-close" type="button" aria-label="Close chat">×</button></div>
        <div class="cbb-chat-messages"><div class="cbb-chat-message">Hello. Ask me about menu items, prices, delivery or reservations.</div></div>
        <form class="cbb-chat-form"><input name="message" autocomplete="off" placeholder="Ask a question..." required><button type="submit">Send</button></form>
      </section>
      <button class="cbb-chat-toggle" type="button" aria-label="Open customer care chat">Chat</button>`;
    document.body.appendChild(widget);
    const windowEl = $('.cbb-chat-window', widget); const messages = $('.cbb-chat-messages', widget);
    $('.cbb-chat-toggle', widget).addEventListener('click', () => windowEl.classList.toggle('open'));
    $('.cbb-chat-close', widget).addEventListener('click', () => windowEl.classList.remove('open'));
    $('.cbb-chat-form', widget).addEventListener('submit', async event => {
      event.preventDefault(); const input = $('input[name="message"]', event.currentTarget); const message = input.value.trim(); if (!message) return;
      const mine = document.createElement('div'); mine.className = 'cbb-chat-message mine'; mine.textContent = message; messages.appendChild(mine); input.value = '';
      const pending = document.createElement('div'); pending.className = 'cbb-chat-message'; pending.textContent = 'Checking verified café information…'; messages.appendChild(pending); messages.scrollTop = messages.scrollHeight;
      try { const response = await api('/api/chat', { method: 'POST', body: { message } }); pending.textContent = response.answer; }
      catch (error) { pending.textContent = error.message; }
      messages.scrollTop = messages.scrollHeight;
    });
  }
  function pageShell(eyebrow, title, description, content) {
    return `<div class="cbb-page"><header class="cbb-page-heading"><p class="cbb-eyebrow">${escapeHTML(eyebrow)}</p><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></header>${content}</div>`;
  }
  function setPage(id, html) { const root = $('[data-cbb-page]'); if (root) { root.dataset.cbbPage = id; root.innerHTML = html; } }
  async function loadCartPage() {
    const root = $('[data-cbb-page="cart"]'); if (!root) return;
    try {
      const cart = getCart(); const byId = new Map(products.map(p => [p.id, p]));
      const rows = cart.map(item => ({ ...item, product: byId.get(item.productId) })).filter(x => x.product);
      const subtotal = rows.reduce((s, x) => s + x.product.price * x.quantity, 0);
      const content = rows.length ? `<div class="cbb-cart-layout"><section class="cbb-panel">${rows.map(x => `<div class="cbb-cart-row"><div><strong>${escapeHTML(x.product.name)}</strong><div class="cbb-hint">${escapeHTML(x.product.category)} · ${money(x.product.price)} each</div></div><div class="cbb-qty"><button data-action="minus" data-id="${escapeHTML(x.productId)}" aria-label="Decrease quantity">−</button><strong>${x.quantity}</strong><button data-action="plus" data-id="${escapeHTML(x.productId)}" aria-label="Increase quantity">+</button></div><div><strong>${money(x.product.price * x.quantity)}</strong><button class="cbb-button secondary" data-action="remove" data-id="${escapeHTML(x.productId)}" style="margin-top:7px">Remove</button></div></div>`).join('')}</section><aside class="cbb-panel"><h2>Order summary</h2><div class="cbb-total-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><p class="cbb-hint">Delivery and applicable taxes are calculated at checkout.</p><a class="cbb-button" href="checkout.html" style="width:100%;margin-top:18px">Continue to checkout</a><a class="cbb-button secondary" href="menu.html" style="width:100%;margin-top:9px">Continue shopping</a></aside></div>` : `<div class="cbb-panel cbb-empty"><h2>Your cart is empty</h2><p>Explore the original Brew & Bloom menu and add something you like.</p><a class="cbb-button" href="menu.html" style="margin-top:15px">Browse menu</a></div>`;
      root.innerHTML = pageShell('Your selection', 'Shopping cart', 'Review your items before checkout.', content);
      $$('[data-action]', root).forEach(button => button.addEventListener('click', () => {
        const id = button.dataset.id; let next = getCart(); const item = next.find(x => x.productId === id);
        if (button.dataset.action === 'remove') next = next.filter(x => x.productId !== id);
        else if (item) { item.quantity += button.dataset.action === 'plus' ? 1 : -1; if (item.quantity <= 0) next = next.filter(x => x.productId !== id); }
        setCart(next); loadCartPage();
      }));
    } catch (error) { root.innerHTML = pageShell('Your selection', 'Shopping cart', 'Cart unavailable.', `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`); }
  }
  async function loadCheckoutPage() {
    const root = $('[data-cbb-page="checkout"]'); if (!root) return;
    const cart = getCart(); if (!cart.length) { root.innerHTML = pageShell('Checkout', 'Your cart is empty', 'Add menu items before proceeding.', `<a class="cbb-button" href="menu.html">Browse menu</a>`); return; }
    try {
      const me = await api('/api/auth/me'); currentUser = me.user;
      if (!currentUser) { root.innerHTML = pageShell('Checkout', 'Sign in to checkout', 'Your cart will stay saved in this browser.', `<div class="cbb-panel"><p>Please sign in or create a customer account to place an order.</p><a class="cbb-button" href="account.html" style="margin-top:14px">Sign in / Register</a></div>`); return; }
      const settings = await api('/api/settings/public'); const total = cart.reduce((s, x) => { const p = products.find(y => y.id === x.productId); return s + (p ? p.price * x.quantity : 0); }, 0);
      root.innerHTML = pageShell('Secure checkout', 'Complete your order', 'Prices are revalidated on the server before an order is created.', `
        <div class="cbb-grid"><form class="cbb-panel cbb-form" id="cbb-checkout-form">
          <div class="cbb-field"><label>Order type</label><select class="cbb-select" name="orderType"><option value="delivery" ${settings.razorpayEnabled ? "" : "disabled"}>Delivery${settings.razorpayEnabled ? "" : " (online payment not configured)"}</option><option value="takeaway" ${settings.razorpayEnabled ? "" : "selected"}>Takeaway</option><option value="dine_in">Dine-in</option></select></div>
          <div class="cbb-field" id="cbb-address-field"><label>Delivery address</label><textarea class="cbb-textarea" name="address" placeholder="House / building, street, area, city and PIN code"></textarea></div>
          <div class="cbb-field"><label>Instructions (optional)</label><textarea class="cbb-textarea" name="instructions" placeholder="Landmark or order notes"></textarea></div>
          <div class="cbb-field"><label>Coupon code</label><input class="cbb-input" name="coupon" placeholder="${escapeHTML(settings.welcomeCoupon)}"><span class="cbb-hint">First-order offer: ${settings.welcomePercent}% off, up to ${money(settings.welcomeMaxDiscount)} on orders above ${money(settings.welcomeMinimum)}. Eligibility is checked server-side.</span></div>
          <div class="cbb-field"><label>Payment method</label><select class="cbb-select" name="paymentMethod">${settings.razorpayEnabled ? '<option value="razorpay">Online payment (Razorpay)</option><option value="pay_at_counter">Pay at café (takeaway / dine-in only)</option>' : '<option value="pay_at_counter">Pay at café (takeaway / dine-in only)</option>'}</select><span class="cbb-hint">${settings.razorpayEnabled ? "Razorpay is configured on this server." : "Online payment is not enabled yet. The café must add Razorpay test credentials before accepting delivery orders."}</span></div>
          <button class="cbb-button" type="submit">Place order</button><div id="cbb-checkout-message" aria-live="polite"></div>
        </form><aside class="cbb-panel"><h2>Order summary</h2>${cart.map(x => { const p = products.find(y => y.id === x.productId); return p ? `<div class="cbb-total-line"><span>${escapeHTML(p.name)} × ${x.quantity}</span><strong>${money(p.price * x.quantity)}</strong></div>` : ''; }).join('')}<div class="cbb-total-line"><span>Subtotal (before delivery / tax)</span><strong>${money(total)}</strong></div><div class="cbb-total-line"><span>Delivery fee (delivery orders)</span><strong>${money(settings.deliveryFee)}</strong></div><p class="cbb-hint">Tax rate configured by the café: ${settings.taxRate}%. Final payable amount is calculated on the server.</p></aside></div>`);
      const form = $('#cbb-checkout-form'); const orderType = $('[name="orderType"]', form); const addressField = $('#cbb-address-field', form);
      const syncAddress = () => { addressField.hidden = orderType.value !== 'delivery'; };
      orderType.addEventListener('change', syncAddress); syncAddress();
      form.addEventListener('submit', async event => {
        event.preventDefault(); const submit = $('button[type="submit"]', form); const msg = $('#cbb-checkout-message'); submit.disabled = true; msg.textContent = 'Creating your order…';
        try {
          if (form.paymentMethod.value === 'pay_at_counter' && orderType.value === 'delivery') throw new Error('Pay at café is available for takeaway or dine-in. Select Razorpay for delivery.');
          const created = await api('/api/orders', { method: 'POST', body: { idempotencyKey: (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`), items: cart, orderType: orderType.value, address: form.address.value, instructions: form.instructions.value, coupon: form.coupon.value, paymentMethod: form.paymentMethod.value } });
          const order = created.order;
          if (order.paymentMethod === 'pay_at_counter') {
            localStorage.removeItem(cartKey); localStorage.setItem('cbb_last_order', order.orderNumber); location.href = `order-confirmation.html?order=${encodeURIComponent(order.orderNumber)}`; return;
          }
          msg.innerHTML = '<div class="cbb-notice">Connecting to Razorpay test / live checkout…</div>';
          const payment = await api('/api/payments/razorpay/create', { method: 'POST', body: { orderId: order.id } });
          await loadRazorpayScript();
          const checkout = new window.Razorpay({ key: payment.keyId, amount: payment.amount, currency: payment.currency, name: payment.name, description: payment.description, order_id: payment.paymentOrderId,
            handler: async response => {
              try { const verified = await api('/api/payments/razorpay/verify', { method: 'POST', body: { orderId: order.id, ...response } });
                localStorage.removeItem(cartKey); localStorage.setItem('cbb_last_order', verified.orderNumber); location.href = `order-confirmation.html?order=${encodeURIComponent(verified.orderNumber)}`;
              } catch (error) { msg.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)} Your order is saved as pending payment. Contact support before retrying.</div>`; submit.disabled = false; }
            }, modal: { ondismiss: () => { msg.innerHTML = '<div class="cbb-notice">Payment window closed. Your order remains pending payment; do not place a duplicate order.</div>'; submit.disabled = false; } }
          });
          checkout.on('payment.failed', response => { msg.innerHTML = `<div class="cbb-notice error">Payment failed: ${escapeHTML(response.error?.description || 'Please try again.')}. Your order remains pending payment.</div>`; submit.disabled = false; });
          checkout.open();
        } catch (error) { msg.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; submit.disabled = false; }
      });
    } catch (error) { root.innerHTML = pageShell('Checkout', 'Checkout unavailable', 'Please refresh and try again.', `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`); }
  }
  function loadRazorpayScript() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve(); const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = resolve; script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your internet connection.')); document.head.appendChild(script);
    });
  }
  async function loadAccountPage() {
    const root = $('[data-cbb-page="account"]'); if (!root) return;
    try {
      const me = await api('/api/auth/me'); currentUser = me.user;
      if (currentUser?.role === 'delivery_partner') { location.href = 'partner.html'; return; }
      if (currentUser?.role === 'admin') { location.href = 'admin.html'; return; }
      if (currentUser) {
        const orders = await api('/api/orders');
        root.innerHTML = pageShell('Your account', `Welcome, ${currentUser.name}`, 'Manage your account and review your orders.', `
          <div class="cbb-grid"><section class="cbb-panel"><p><strong>${escapeHTML(currentUser.email || currentUser.mobile || 'Customer')}</strong></p><p class="cbb-hint">Account type: ${escapeHTML(currentUser.role.replace('_', ' '))}</p><p class="cbb-hint">Loyalty points are credited after eligible completed orders.</p><div class="cbb-actions" style="margin-top:18px"><a href="orders.html" class="cbb-button">View orders</a><button id="cbb-logout" class="cbb-button secondary">Sign out</button></div></section><section class="cbb-panel"><h2>Quick links</h2><p><a href="support.html">Customer care and support</a></p><p><a href="partner.html">Delivery partner portal</a></p><p><a href="reservations.html">Request a table</a></p>${currentUser.role === 'admin' ? '<p><a href="admin.html">Administration</a></p>' : ''}<p class="cbb-hint" style="margin-top:15px">${orders.orders.length} order(s) on this account.</p></section></div>`);
        $('#cbb-logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); location.reload(); });
        return;
      }
      const authSettings = await api('/api/settings/public');
      root.innerHTML = pageShell('Customer account', 'Sign in to Brew & Bloom', 'Create an account to save orders, check progress and contact customer care.', `
        <div class="cbb-panel" style="max-width:650px"><div class="cbb-admin-nav"><button type="button" class="active" data-tab="login">Sign in</button><button type="button" data-tab="register">Create account</button></div>
          <form id="cbb-login-form" class="cbb-form"><div class="cbb-field"><label>Email address</label><input class="cbb-input" name="email" type="email" autocomplete="email" required></div><div class="cbb-field"><label>Password</label><input class="cbb-input" name="password" type="password" autocomplete="current-password" required></div><button class="cbb-button">Sign in</button><div id="cbb-login-message"></div>${authSettings.googleOAuthEnabled ? '<a class="cbb-button secondary" href="/auth/google">Continue with Google</a>' : '<p class="cbb-hint">Google sign-in is available after Google OAuth credentials and an authorized callback URL are configured.</p>'}${authSettings.developmentOtpEnabled ? '<div class="cbb-field"><label>Mobile OTP sign-in (development only)</label><input class="cbb-input" id="cbb-otp-mobile" type="tel" placeholder="Mobile number with country code"></div><div class="cbb-actions"><button class="cbb-button secondary" id="cbb-request-otp" type="button">Request OTP</button></div><div class="cbb-field"><label>6-digit OTP</label><input class="cbb-input" id="cbb-otp-code" inputmode="numeric" maxlength="6" placeholder="OTP from server terminal"></div><button class="cbb-button secondary" id="cbb-verify-otp" type="button">Verify OTP and sign in</button><div id="cbb-otp-message"></div><p class="cbb-hint">Development OTP is printed in the server terminal. A production SMS provider is required before mobile OTP can be offered to customers.</p>' : '<p class="cbb-hint">Mobile OTP sign-in is disabled until a production SMS provider is connected and verified.</p>'}</form>
          <form id="cbb-register-form" class="cbb-form" hidden><div class="cbb-field"><label>Full name</label><input class="cbb-input" name="name" required minlength="2"></div><div class="cbb-field"><label>Email address</label><input class="cbb-input" name="email" type="email" required></div><div class="cbb-field"><label>Mobile number</label><input class="cbb-input" name="mobile" type="tel" placeholder="10-digit mobile number"></div><div class="cbb-field"><label>Password</label><input class="cbb-input" name="password" type="password" minlength="8" required></div><button class="cbb-button">Create customer account</button><div id="cbb-register-message"></div></form>
        </div>`);
      $$('[data-tab]', root).forEach(button => button.addEventListener('click', () => { $$('[data-tab]', root).forEach(b => b.classList.toggle('active', b === button)); $('#cbb-login-form').hidden = button.dataset.tab !== 'login'; $('#cbb-register-form').hidden = button.dataset.tab !== 'register'; }));
      $('#cbb-login-form').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const msg = $('#cbb-login-message'); try { await api('/api/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } }); location.reload(); } catch (error) { msg.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
      $('#cbb-register-form').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const msg = $('#cbb-register-message'); try { await api('/api/auth/register', { method: 'POST', body: { name: form.name.value, email: form.email.value, mobile: form.mobile.value, password: form.password.value } }); location.reload(); } catch (error) { msg.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
      $('#cbb-request-otp')?.addEventListener('click', async () => { const message = $('#cbb-otp-message'); try { const result = await api('/api/auth/request-otp', { method: 'POST', body: { mobile: $('#cbb-otp-mobile').value } }); message.innerHTML = `<div class="cbb-notice success">${escapeHTML(result.message)}${result.developmentCode ? ` Test code: <strong>${escapeHTML(result.developmentCode)}</strong> (development only).` : ''}</div>`; } catch (error) { message.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
      $('#cbb-verify-otp')?.addEventListener('click', async () => { const message = $('#cbb-otp-message'); try { await api('/api/auth/verify-otp', { method: 'POST', body: { mobile: $('#cbb-otp-mobile').value, code: $('#cbb-otp-code').value } }); location.reload(); } catch (error) { message.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
    } catch (error) { root.innerHTML = pageShell('Customer account', 'Account unavailable', '', `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`); }
  }
  async function loadOrdersPage() {
    const root = $('[data-cbb-page="orders"]'); if (!root) return;
    try {
      const me = await api('/api/auth/me'); if (!me.user) { root.innerHTML = pageShell('Your orders', 'Sign in to view orders', 'Orders are private to each customer account.', `<a class="cbb-button" href="account.html">Sign in</a>`); return; }
      const data = await api('/api/orders');
      const rows = data.orders.map(o => `<tr><td><strong>${escapeHTML(o.orderNumber)}</strong><div class="cbb-hint">${new Date(o.createdAt).toLocaleString()}</div></td><td>${money(o.total)}</td><td><span class="cbb-status ${escapeHTML(o.status)}">${escapeHTML(o.status.replaceAll('_', ' '))}</span></td><td><span class="cbb-status ${escapeHTML(o.paymentStatus)}">${escapeHTML(o.paymentStatus)}</span></td><td><a class="cbb-button secondary" href="order-confirmation.html?order=${encodeURIComponent(o.orderNumber)}">Details</a></td></tr>`).join('');
      root.innerHTML = pageShell('Your orders', 'Order history', 'Track the progress and payment state of your orders.', rows ? `<div class="cbb-panel cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Order</th><th>Total</th><th>Fulfilment</th><th>Payment</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="cbb-panel cbb-empty">No orders have been placed from this account yet. <a href="menu.html">Browse the menu</a>.</div>`);
    } catch (error) { root.innerHTML = pageShell('Your orders', 'Orders unavailable', '', `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`); }
  }
  async function loadConfirmationPage() {
    const root = $('[data-cbb-page="confirmation"]'); if (!root) return;
    const reference = new URLSearchParams(location.search).get('order') || localStorage.getItem('cbb_last_order');
    if (!reference) { root.innerHTML = pageShell('Order', 'No order selected', 'Your order reference was not found.', `<a class="cbb-button" href="menu.html">Return to menu</a>`); return; }
    try {
      const data = await api(`/api/orders/${encodeURIComponent(reference)}`); const o = data.order;
      root.innerHTML = pageShell('Order received', `Thank you. ${o.orderNumber}`, 'Your order has been recorded. The order status and payment status are shown separately.', `<div class="cbb-grid"><section class="cbb-panel"><h2>Order details</h2>${o.items.map(i => `<div class="cbb-total-line"><span>${escapeHTML(i.name)} × ${i.quantity}</span><strong>${money(i.lineTotal)}</strong></div>`).join('')}<div class="cbb-total-line"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div class="cbb-total-line"><span>Discount</span><strong>−${money(o.discount)}</strong></div><div class="cbb-total-line"><span>Delivery</span><strong>${money(o.deliveryFee)}</strong></div><div class="cbb-total-line"><span>Tax</span><strong>${money(o.tax)}</strong></div><div class="cbb-total-line grand"><span>Total</span><strong>${money(o.total)}</strong></div></section><section class="cbb-panel"><h2>Current status</h2><p><span class="cbb-status ${escapeHTML(o.status)}">${escapeHTML(o.status.replaceAll('_', ' '))}</span></p><p style="margin-top:13px">Payment: <span class="cbb-status ${escapeHTML(o.paymentStatus)}">${escapeHTML(o.paymentStatus)}</span></p><p class="cbb-hint" style="margin-top:18px">If payment is pending, do not place a duplicate order. Contact customer care with your order number.</p>${o.orderType === 'delivery' && o.deliveryOtp ? `<div class="cbb-notice" style="margin-top:15px">Share this delivery confirmation code with your assigned delivery partner only when your order arrives: <strong>${escapeHTML(o.deliveryOtp)}</strong>.</div>` : ''}<a class="cbb-button" href="orders.html" style="margin-top:15px">View all orders</a></section></div>`);
    } catch (error) { root.innerHTML = pageShell('Order', 'Order details unavailable', 'Sign in with the account that placed this order.', `<div class="cbb-notice error">${escapeHTML(error.message)}</div><a href="account.html" class="cbb-button">Sign in</a>`); }
  }
  async function loadPartnerPage() {
    const root = $('[data-cbb-page="partner"]'); if (!root) return;
    try {
      const me = await api('/api/auth/me'); currentUser = me.user;
      if (currentUser?.role === 'delivery_partner') {
        if (!currentUser.partnerApproved) { root.innerHTML = pageShell('Delivery partner', 'Application under review', 'Your account will be enabled after the café administrator approves the submitted application.', `<div class="cbb-panel">Application is pending. <button id="cbb-partner-logout" class="cbb-button secondary">Sign out</button></div>`); $('#cbb-partner-logout').addEventListener('click', () => api('/api/auth/logout', { method: 'POST', body: {} }).then(() => location.reload())); return; }
        const data = await api('/api/partner/deliveries');
        const cards = data.orders.map(o => `<article class="cbb-panel"><div class="cbb-inline"><strong>${escapeHTML(o.orderNumber)}</strong><span class="cbb-status ${escapeHTML(o.status)}">${escapeHTML(o.status.replaceAll('_', ' '))}</span></div><p class="cbb-hint">${escapeHTML(o.address || 'Pickup order')} · ${money(o.total)}</p><div class="cbb-actions">${o.status === 'delivery_assigned' ? `<button class="cbb-button" data-partner-status="picked_up" data-id="${o.id}">Mark picked up</button>` : ''}${o.status === 'picked_up' ? `<button class="cbb-button" data-partner-status="out_for_delivery" data-id="${o.id}">Out for delivery</button>` : ''}${o.status === 'out_for_delivery' ? `<button class="cbb-button secondary" data-partner-status="delivered" data-id="${o.id}">Complete delivery</button>` : ''}</div></article>`).join('');
        root.innerHTML = pageShell('Delivery partner', `Welcome, ${currentUser.name}`, 'Only deliveries assigned to your account are shown here.', `<div class="cbb-inline"><p class="cbb-hint">${data.orders.length} assigned delivery record(s).</p><button id="cbb-partner-logout" class="cbb-button secondary">Sign out</button></div><div class="cbb-grid" style="margin-top:18px">${cards || '<div class="cbb-panel cbb-empty">No deliveries are assigned to you yet.</div>'}</div><p class="cbb-hint" style="margin-top:18px">For final delivery confirmation, ask the customer for the order delivery code and enter it when prompted. Customer contact and address details are shown only for your assigned orders.</p>`);
        $('#cbb-partner-logout').addEventListener('click', () => api('/api/auth/logout', { method: 'POST', body: {} }).then(() => location.reload()));
        $$('[data-partner-status]').forEach(btn => btn.addEventListener('click', async () => { let otp = ''; if (btn.dataset.partnerStatus === 'delivered') { otp = prompt('Enter the delivery OTP shared by the customer:') || ''; if (!otp) return; } try { await api('/api/partner/deliveries/status', { method: 'POST', body: { orderId: btn.dataset.id, status: btn.dataset.partnerStatus, otp } }); loadPartnerPage(); } catch (error) { notify(error.message); } }));
        return;
      }
      root.innerHTML = pageShell('Delivery partner programme', 'Work with Brew & Bloom', 'Submit an application. Delivery access is enabled only after the café reviews and approves your details.', `<div class="cbb-grid"><form id="cbb-partner-form" class="cbb-panel cbb-form"><div class="cbb-field"><label>Full name</label><input class="cbb-input" name="name" required></div><div class="cbb-field"><label>Email</label><input class="cbb-input" name="email" type="email" required></div><div class="cbb-field"><label>Mobile number</label><input class="cbb-input" name="mobile" required></div><div class="cbb-field"><label>Vehicle type</label><select class="cbb-select" name="vehicle"><option>Two-wheeler</option><option>Bicycle</option><option>Four-wheeler</option></select></div><div class="cbb-field"><label>Create password</label><input class="cbb-input" name="password" type="password" minlength="8" required></div><button class="cbb-button">Submit partner application</button><div id="cbb-partner-message"></div></form><aside class="cbb-panel"><h2>Approval process</h2><p>1. Submit your information.</p><p>2. The administrator reviews your application.</p><p>3. Once approved, sign in using the email and password you registered.</p><p class="cbb-hint" style="margin-top:18px">Identity documents and licence verification must be reviewed by the café before enabling live delivery operations. Do not upload sensitive documents through this initial form.</p><a href="account.html">Customer sign in</a></aside></div>`);
      $('#cbb-partner-form').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; try { const result = await api('/api/partner/apply', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); $('#cbb-partner-message').innerHTML = `<div class="cbb-notice success">${escapeHTML(result.message)}</div>`; form.reset(); } catch (error) { $('#cbb-partner-message').innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
    } catch (error) { root.innerHTML = pageShell('Delivery partner', 'Portal unavailable', '', `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`); }
  }
  async function loadSupportPage() {
    const root = $('[data-cbb-page="support"]'); if (!root) return;
    const me = await api('/api/auth/me').catch(() => ({ user: null }));
    if (!me.user) { root.innerHTML = pageShell('Customer care', 'How can we help?', 'Sign in to create and track a support request.', `<div class="cbb-panel"><a class="cbb-button" href="account.html">Sign in to customer care</a><p class="cbb-hint" style="margin-top:14px">You can also use the chat button for menu and general café questions.</p><p style="margin-top:14px"><a href="partner.html">Apply as a delivery partner</a> · <a href="reservations.html">Request a table</a></p></div>`); return; }
    if (me.user.role === 'admin') { root.innerHTML = pageShell('Customer care', 'Support administration', 'Manage customer tickets from the Admin dashboard.', `<a class="cbb-button" href="admin.html">Open administration</a>`); return; }
    const data = await api('/api/support/tickets');
    const list = data.tickets.map(t => `<article class="cbb-panel"><div class="cbb-inline"><strong>${escapeHTML(t.ticketNumber)} · ${escapeHTML(t.subject)}</strong><span class="cbb-status">${escapeHTML(t.status.replaceAll('_', ' '))}</span></div><p class="cbb-hint">${escapeHTML(t.category)} · ${new Date(t.createdAt).toLocaleString()}</p>${t.messages.map(m => `<p style="margin-top:10px"><strong>${escapeHTML(m.senderName)}:</strong> ${escapeHTML(m.message)}</p>`).join('')}</article>`).join('');
    root.innerHTML = pageShell('Customer care', 'Talk to our team', 'Create a support ticket for an order, payment, delivery or product issue.', `<div class="cbb-grid"><form id="cbb-ticket-form" class="cbb-panel cbb-form"><div class="cbb-field"><label>Issue category</label><select class="cbb-select" name="category"><option>Order issue</option><option>Payment issue</option><option>Delivery complaint</option><option>Product quality</option><option>Missing / incorrect item</option><option>Account issue</option><option>General enquiry</option></select></div><div class="cbb-field"><label>Subject</label><input class="cbb-input" name="subject" required minlength="4"></div><div class="cbb-field"><label>Message</label><textarea class="cbb-textarea" name="message" required minlength="10"></textarea></div><button class="cbb-button">Create support ticket</button><div id="cbb-ticket-message"></div></form><aside class="cbb-panel"><h2>Support guidance</h2><p>Include your order number, the item involved and a short explanation. Do not share passwords, OTPs or full payment card details.</p><p class="cbb-hint" style="margin-top:16px">Ticket replies are visible in your account here. Email and SMS notifications can be connected after provider configuration.</p></aside></div><h2 class="cbb-section-title">Your support requests</h2><div class="cbb-grid">${list || '<div class="cbb-panel cbb-empty">You have no support tickets yet.</div>'}</div>`);
    $('#cbb-ticket-form').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; try { await api('/api/support/tickets', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); loadSupportPage(); } catch (error) { $('#cbb-ticket-message').innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
  }
  async function loadReservationPage() {
    const root = $('[data-cbb-page="reservations"]'); if (!root) return;
    root.innerHTML = pageShell('Dine with us', 'Request a table', 'Send a reservation request. Your booking is not confirmed until the café team reviews it.', `<div class="cbb-grid"><form id="cbb-reservation-form" class="cbb-panel cbb-form"><div class="cbb-field"><label>Full name</label><input class="cbb-input" name="name" required></div><div class="cbb-field"><label>Email</label><input class="cbb-input" name="email" type="email" required></div><div class="cbb-field"><label>Mobile number</label><input class="cbb-input" name="mobile" required></div><div class="cbb-field"><label>Date</label><input class="cbb-input" name="date" type="date" min="${new Date().toISOString().slice(0,10)}" required></div><div class="cbb-field"><label>Time</label><input class="cbb-input" name="time" type="time" required></div><div class="cbb-field"><label>Number of guests</label><input class="cbb-input" name="guests" type="number" min="1" max="20" value="2" required></div><div class="cbb-field"><label>Special request (optional)</label><textarea class="cbb-textarea" name="notes"></textarea></div><button class="cbb-button">Request reservation</button><div id="cbb-reservation-message"></div></form><aside class="cbb-panel"><h2>Reservation request</h2><p>The café team must confirm availability. This form does not guarantee a table or a reservation.</p></aside></div>`);
    $('#cbb-reservation-form').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const body = Object.fromEntries(new FormData(form)); body.guests = Number(body.guests); try { const result = await api('/api/reservations', { method: 'POST', body }); $('#cbb-reservation-message').innerHTML = `<div class="cbb-notice success">Request received. Reference: ${escapeHTML(result.reservation.reference)}. Await café confirmation.</div>`; form.reset(); } catch (error) { $('#cbb-reservation-message').innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } });
  }
  async function loadAdminPage() {
    const root = $('[data-cbb-page="admin"]'); if (!root) return;
    try {
      const me = await api('/api/auth/me'); currentUser = me.user;
      if (!currentUser || currentUser.role !== 'admin') { root.innerHTML = pageShell('Administration', 'Administrator sign in required', 'This private area is restricted to the café administrator.', `<div class="cbb-panel" style="max-width:520px"><form id="cbb-admin-login" class="cbb-form"><div class="cbb-field"><label>Administrator email</label><input class="cbb-input" name="email" type="email" required></div><div class="cbb-field"><label>Password</label><input class="cbb-input" name="password" type="password" required></div><button class="cbb-button">Sign in</button><div id="cbb-admin-message"></div></form><p class="cbb-hint" style="margin-top:12px">Local default credentials are listed in README. Change them before any deployment.</p></div>`);
        $('#cbb-admin-login').addEventListener('submit', async e => { e.preventDefault(); const f = e.currentTarget; try { await api('/api/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); loadAdminPage(); } catch (error) { $('#cbb-admin-message').innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; } }); return;
      }
      const overview = await api('/api/admin/overview');
      root.innerHTML = pageShell('Management console', 'Cafe operations', 'Manage menu products, orders, partners, support, reservations and inventory.', `
        <div class="cbb-inline"><p class="cbb-hint">Signed in as ${escapeHTML(currentUser.email)}</p><button id="cbb-admin-logout" class="cbb-button secondary">Sign out</button></div>
        <div class="cbb-stat-grid" style="margin-top:18px">${[['Orders today',overview.metrics.ordersToday],['Sales recorded',money(overview.metrics.salesToday)],['Open orders',overview.metrics.pendingOrders],['Open tickets',overview.metrics.openTickets],['Pending partners',overview.metrics.pendingPartners],['Active products',overview.metrics.products]].map(([label,value]) => `<div class="cbb-stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join('')}</div>
        <nav class="cbb-admin-nav" aria-label="Admin sections"><button class="active" data-admin-tab="orders">Orders</button><button data-admin-tab="products">Products</button><button data-admin-tab="partners">Partners</button><button data-admin-tab="tickets">Support</button><button data-admin-tab="inventory">Inventory</button><button data-admin-tab="reservations">Reservations</button><button data-admin-tab="settings">Settings</button><button data-admin-tab="users">Users</button><button data-admin-tab="audit">Audit log</button></nav><section id="cbb-admin-content" class="cbb-panel">Loading management data…</section>`);
      $('#cbb-admin-logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); location.reload(); });
      $$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => { $$('[data-admin-tab]').forEach(b => b.classList.toggle('active', b === button)); loadAdminTab(button.dataset.adminTab); }));
      loadAdminTab('orders');
    } catch (error) { root.innerHTML = pageShell('Administration', 'Dashboard unavailable', '', `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`); }
  }
  async function loadAdminTab(tab) {
    const panel = $('#cbb-admin-content'); if (!panel) return; panel.textContent = 'Loading…';
    try {
      if (tab === 'orders') {
        const [data, userData] = await Promise.all([api('/api/admin/orders'), api('/api/admin/users')]); const partners = userData.users.filter(u => u.role === 'delivery_partner' && u.partnerApproved);
        panel.innerHTML = `<h2>Order management</h2><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>${data.orders.map(o => `<tr><td>${escapeHTML(o.orderNumber)}<div class="cbb-hint">${new Date(o.createdAt).toLocaleString()}</div></td><td>${escapeHTML(o.customerName)}<div class="cbb-hint">${escapeHTML(o.orderType)}</div></td><td>${money(o.total)}</td><td>${escapeHTML(o.paymentStatus)}${o.refundStatus && o.refundStatus !== 'none' ? `<div class="cbb-hint">Refund: ${escapeHTML(o.refundStatus)}</div>` : ''}</td><td>${escapeHTML(o.status.replaceAll('_',' '))}</td><td><div class="cbb-actions"><select class="cbb-select" data-order-status="${escapeHTML(o.id)}"><option value="">Change status…</option>${['accepted','preparing','ready','cancelled'].map(s => `<option value="${s}">${s.replaceAll('_',' ')}</option>`).join('')}</select>${o.orderType === 'delivery' && o.status === 'ready' && o.paymentStatus === 'paid' ? `<select class="cbb-select" data-assign-partner="${escapeHTML(o.id)}"><option value="">Assign partner…</option>${partners.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select>` : ''}${o.paymentStatus === 'paid' && o.razorpayPaymentId && !['initiated','processed'].includes(o.refundStatus) ? `<button class="cbb-button danger" data-refund-order="${escapeHTML(o.id)}">Refund</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6">No orders yet.</td></tr>'}</tbody></table></div><p class="cbb-hint" style="margin-top:14px">Assign delivery only after a delivery order is marked Ready and Razorpay payment is verified as Paid. Razorpay refunds can only be initiated for captured payments with a verified payment reference.</p>`;
        $$('[data-order-status]', panel).forEach(select => select.addEventListener('change', async () => { if (!select.value) return; try { await api('/api/admin/orders/status', { method:'POST', body:{orderId:select.dataset.orderStatus,status:select.value} }); notify('Order status updated.'); loadAdminTab('orders'); } catch (error) { notify(error.message); } }));
        $$('[data-assign-partner]', panel).forEach(select => select.addEventListener('change', async () => { if (!select.value) return; try { await api('/api/admin/delivery/assign', { method:'POST', body:{orderId:select.dataset.assignPartner,partnerId:select.value} }); notify('Delivery partner assigned.'); loadAdminTab('orders'); } catch (error) { notify(error.message); } }));
        $$('[data-refund-order]', panel).forEach(button => button.addEventListener('click', async () => { const reason = prompt('Refund reason:'); if (!reason) return; const amount = prompt('Refund amount in INR (leave blank for full refund):'); if (amount === null) return; try { const result = await api('/api/admin/refunds', { method:'POST', body:{orderId:button.dataset.refundOrder,reason,amount} }); notify(`Refund submitted: ${result.refundStatus}`); loadAdminTab('orders'); } catch (error) { notify(error.message); } }));
      } else if (tab === 'products') {
        const data = await api('/api/admin/products'); panel.innerHTML = `<h2>Product catalogue</h2><form id="cbb-product-form" class="cbb-grid" style="margin:16px 0"><div class="cbb-field"><label>Product name</label><input class="cbb-input" name="name" required></div><div class="cbb-field"><label>Category</label><select class="cbb-select" name="category"><option>Coffee</option><option>Drinks</option><option>Food</option><option>Desserts</option></select></div><div class="cbb-field"><label>Price (₹)</label><input class="cbb-input" name="price" type="number" min="1" required></div><div class="cbb-field"><label>Description</label><input class="cbb-input" name="description"></div><div><button class="cbb-button">Add product</button></div></form><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th></th></tr></thead><tbody>${data.products.map(p => `<tr><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.category)}</td><td>${money(p.price)}</td><td>${p.available === false ? 'Unavailable' : p.archived ? 'Archived' : 'Available'}</td><td class="cbb-actions"><button class="cbb-button secondary" data-product-price="${escapeHTML(p.id)}" data-price="${p.price}">Edit price</button><button class="cbb-button secondary" data-product-availability="${escapeHTML(p.id)}" data-value="${p.available === false ? 'true' : 'false'}">${p.available === false ? 'Enable' : 'Disable'}</button><button class="cbb-button secondary" data-product-archive="${escapeHTML(p.id)}">Archive</button></td></tr>`).join('')}</tbody></table></div>`;
        $('#cbb-product-form').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; try { await api('/api/admin/products',{method:'POST',body:Object.fromEntries(new FormData(f))}); notify('Product added.'); loadAdminTab('products'); } catch(error){notify(error.message);} });
        $$('[data-product-price]', panel).forEach(b => b.addEventListener('click', async () => { const value = prompt('Set new price in INR:', b.dataset.price); if (value === null) return; const price = Number(value); if (!Number.isFinite(price) || price <= 0) return notify('Enter a valid price greater than zero.'); try { await api(`/api/admin/products/${encodeURIComponent(b.dataset.productPrice)}`,{method:'PATCH',body:{price}}); notify('Price updated.'); loadAdminTab('products'); }catch(e){notify(e.message);} }));
        $$('[data-product-availability]', panel).forEach(b => b.addEventListener('click', async () => { try { await api(`/api/admin/products/${encodeURIComponent(b.dataset.productAvailability)}`,{method:'PATCH',body:{available:b.dataset.value==='true'}}); loadAdminTab('products'); }catch(e){notify(e.message);} }));
        $$('[data-product-archive]', panel).forEach(b => b.addEventListener('click', async () => { if(!confirm('Archive this product?')) return; try { await api(`/api/admin/products/${encodeURIComponent(b.dataset.productArchive)}`,{method:'PATCH',body:{archived:true}}); loadAdminTab('products'); }catch(e){notify(e.message);} }));
      } else if (tab === 'partners') {
        const data=await api('/api/admin/partners'); panel.innerHTML=`<h2>Delivery partner applications</h2><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Applicant</th><th>Contact</th><th>Vehicle</th><th>Status</th><th>Review</th></tr></thead><tbody>${data.applications.map(a=>`<tr><td>${escapeHTML(a.name)}</td><td>${escapeHTML(a.email)}<br>${escapeHTML(a.mobile)}</td><td>${escapeHTML(a.vehicle)}</td><td>${escapeHTML(a.status)}</td><td class="cbb-actions">${a.status==='pending'?`<button class="cbb-button" data-partner-review="approved" data-id="${a.id}">Approve</button><button class="cbb-button danger" data-partner-review="rejected" data-id="${a.id}">Reject</button>`:'Reviewed'}</td></tr>`).join('')||'<tr><td colspan="5">No applications.</td></tr>'}</tbody></table></div>`;
        $$('[data-partner-review]',panel).forEach(b=>b.addEventListener('click',async()=>{try{await api('/api/admin/partners/review',{method:'POST',body:{applicationId:b.dataset.id,status:b.dataset.partnerReview}});loadAdminTab('partners');}catch(e){notify(e.message);}}));
      } else if (tab === 'tickets') {
        const data=await api('/api/admin/tickets'); panel.innerHTML=`<h2>Customer support tickets</h2>${data.tickets.map(t=>`<article style="padding:15px 0;border-bottom:1px solid var(--cbb-line)"><div class="cbb-inline"><strong>${escapeHTML(t.ticketNumber)} · ${escapeHTML(t.subject)}</strong><span class="cbb-status">${escapeHTML(t.status)}</span></div><p class="cbb-hint">${escapeHTML(t.customerName)} · ${escapeHTML(t.category)}</p>${t.messages.map(m=>`<p style="margin-top:9px"><strong>${escapeHTML(m.senderName)}:</strong> ${escapeHTML(m.message)}</p>`).join('')}<form class="cbb-inline" data-ticket-reply="${t.id}" style="margin-top:12px"><input class="cbb-input" name="message" placeholder="Write a reply" required style="flex:1"><button class="cbb-button">Reply</button></form></article>`).join('')||'<div class="cbb-empty">No support tickets.</div>'}`;
        $$('[data-ticket-reply]',panel).forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/tickets/reply',{method:'POST',body:{ticketId:f.dataset.ticketReply,message:f.message.value}});loadAdminTab('tickets');}catch(err){notify(err.message);}}));
      } else if (tab === 'inventory') {
        const data=await api('/api/admin/inventory'); panel.innerHTML=`<h2>Inventory</h2><form id="cbb-inventory-form" class="cbb-grid" style="margin:16px 0"><div class="cbb-field"><label>Item / ingredient</label><input class="cbb-input" name="name" required></div><div class="cbb-field"><label>Unit (kg, L, pcs)</label><input class="cbb-input" name="unit" required></div><div class="cbb-field"><label>Quantity</label><input class="cbb-input" name="quantity" type="number" min="0" step="0.01" required></div><div class="cbb-field"><label>Reorder level</label><input class="cbb-input" name="reorderLevel" type="number" min="0" step="0.01" value="0"></div><div class="cbb-field"><label>Expiry date (optional)</label><input class="cbb-input" name="expiryDate" type="date"></div><div><button class="cbb-button">Add inventory item</button></div></form><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Item</th><th>Quantity</th><th>Reorder level</th><th>Expiry</th><th>Alert</th></tr></thead><tbody>${data.inventory.map(i=>`<tr><td>${escapeHTML(i.name)}</td><td>${i.quantity} ${escapeHTML(i.unit)}</td><td>${i.reorderLevel}</td><td>${escapeHTML(i.expiryDate||'—')}</td><td>${i.quantity<=i.reorderLevel?'<span class="cbb-status failed">Low stock</span>':'OK'}</td></tr>`).join('')||'<tr><td colspan="5">No inventory records. Add your first item above.</td></tr>'}</tbody></table></div>`;
        $('#cbb-inventory-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const body=Object.fromEntries(new FormData(f));body.quantity=Number(body.quantity);body.reorderLevel=Number(body.reorderLevel);try{await api('/api/admin/inventory',{method:'POST',body});loadAdminTab('inventory');}catch(err){notify(err.message);}});
      } else if (tab === 'reservations') {
        const data=await api('/api/admin/reservations'); panel.innerHTML=`<h2>Reservation requests</h2><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Guest</th><th>Contact</th><th>Date / time</th><th>Guests</th><th>Status</th><th>Review</th></tr></thead><tbody>${data.reservations.map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${escapeHTML(r.email)}<br>${escapeHTML(r.mobile)}</td><td>${escapeHTML(r.date)} ${escapeHTML(r.time)}</td><td>${r.guests}</td><td>${escapeHTML(r.status)}</td><td>${r.status==='requested'?`<div class="cbb-actions"><button class="cbb-button" data-reservation-status="confirmed" data-id="${r.id}">Confirm</button><button class="cbb-button danger" data-reservation-status="declined" data-id="${r.id}">Decline</button></div>`:'Reviewed'}</td></tr>`).join('')||'<tr><td colspan="6">No reservation requests.</td></tr>'}</tbody></table></div>`;
        $$('[data-reservation-status]',panel).forEach(b=>b.addEventListener('click',async()=>{try{await api('/api/admin/reservations/status',{method:'POST',body:{reservationId:b.dataset.id,status:b.dataset.reservationStatus}});loadAdminTab('reservations');}catch(e){notify(e.message);}}));
      } else if (tab === 'settings') {
        const data=await api('/api/settings/public'); panel.innerHTML=`<h2>Business settings</h2><form id="cbb-settings-form" class="cbb-grid" style="margin-top:16px"><div class="cbb-field"><label>Delivery fee (₹)</label><input class="cbb-input" name="deliveryFee" type="number" min="0" step="1" value="${data.deliveryFee}"></div><div class="cbb-field"><label>Tax rate (%)</label><input class="cbb-input" name="taxRate" type="number" min="0" max="100" step="0.01" value="${data.taxRate}"></div><div class="cbb-field"><label>Welcome coupon code</label><input class="cbb-input" name="welcomeCoupon" value="${escapeHTML(data.welcomeCoupon)}"></div><div class="cbb-field"><label>Welcome discount (%)</label><input class="cbb-input" name="welcomePercent" type="number" min="0" max="100" value="${data.welcomePercent}"></div><div class="cbb-field"><label>Maximum discount (₹)</label><input class="cbb-input" name="welcomeMaxDiscount" type="number" min="0" value="${data.welcomeMaxDiscount}"></div><div class="cbb-field"><label>Minimum basket (₹)</label><input class="cbb-input" name="welcomeMinimum" type="number" min="0" value="${data.welcomeMinimum}"></div><div><button class="cbb-button">Save settings</button></div></form><p class="cbb-hint" style="margin-top:15px">Tax settings must be reviewed by your accountant before production. A zero tax rate is only a setup default, not a tax recommendation.</p>`;
        $('#cbb-settings-form').addEventListener('submit',async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));for(const k of ['deliveryFee','taxRate','welcomePercent','welcomeMaxDiscount','welcomeMinimum'])body[k]=Number(body[k]);try{await api('/api/admin/settings',{method:'PATCH',body});notify('Settings saved.');}catch(err){notify(err.message);}});
      } else if (tab === 'users') {
        const data=await api('/api/admin/users'); panel.innerHTML=`<h2>Platform accounts</h2><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Name</th><th>Email / Mobile</th><th>Role</th><th>Created</th></tr></thead><tbody>${data.users.map(u=>`<tr><td>${escapeHTML(u.name)}</td><td>${escapeHTML(u.email||'—')}<br>${escapeHTML(u.mobile||'')}</td><td>${escapeHTML(u.role)}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>`;
      } else if (tab === 'audit') {
        const data=await api('/api/admin/audit'); panel.innerHTML=`<h2>Audit history</h2><div class="cbb-table-wrap"><table class="cbb-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th></tr></thead><tbody>${data.logs.map(l=>`<tr><td>${new Date(l.createdAt).toLocaleString()}</td><td>${escapeHTML(l.actorEmail)}</td><td>${escapeHTML(l.action)}</td><td>${escapeHTML(l.entity)} · ${escapeHTML(l.entityId)}</td></tr>`).join('')||'<tr><td colspan="4">No audit records yet.</td></tr>'}</tbody></table></div>`;
      }
    } catch (error) { panel.innerHTML = `<div class="cbb-notice error">${escapeHTML(error.message)}</div>`; }
  }
  async function init() {
    try { const data = await api('/api/products'); products = data.products; } catch (error) { console.warn('Could not load product catalogue:', error.message); }
    try { const me = await api('/api/auth/me'); currentUser = me.user; } catch { currentUser = null; }
    injectNavigation(); initOriginalPages(); installChat(); updateCartCount();
    if (currentUser) { const link = $('.cbb-account-link'); if (link) { link.textContent = currentUser.name.split(' ')[0]; link.href = 'account.html'; } }
    await Promise.all([loadCartPage(), loadCheckoutPage(), loadAccountPage(), loadOrdersPage(), loadConfirmationPage(), loadPartnerPage(), loadSupportPage(), loadReservationPage(), loadAdminPage()]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
