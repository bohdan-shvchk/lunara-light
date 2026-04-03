class BundleSave {
  constructor(container) {
    this.container = container;
    this.product = JSON.parse(container.dataset.product);
    this.settings = JSON.parse(container.dataset.settings);
    this.moneyFormat = container.dataset.moneyFormat || '${{amount}}';

    this.selectedTier = parseInt(this.settings.default_tier) || 2;
    // selectedVariants[tier][itemIndex] = variantId
    this.selectedVariants = { 1: {}, 2: {}, 3: {} };
    this.hasVariants = this.product.variants.length > 1;

    if (this.hasVariants) this._preselectVariants();

    this._render();
    this._bindEvents();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _formatMoney(cents) {
    const amount = (cents / 100).toFixed(2);
    return this.moneyFormat
      .replace('{{amount}}', amount)
      .replace('{{amount_no_decimals}}', Math.round(cents / 100))
      .replace('{{amount_with_comma_separator}}', amount.replace('.', ','));
  }

  _preselectVariants() {
    const first = this.product.variants.find(v => v.available) || this.product.variants[0];
    [1, 2, 3].forEach(tier => {
      for (let i = 0; i < tier; i++) {
        this.selectedVariants[tier][i] = first.id;
      }
    });
  }

  _getVariantById(id) {
    return this.product.variants.find(v => v.id === id);
  }

  _getTierPrice(tier) {
    const base = this.product.price;
    const compareAt = this.product.compare_at_price;
    const pct = tier === 2
      ? parseFloat(this.settings.discount_2) || 0
      : tier === 3
        ? parseFloat(this.settings.discount_3) || 0
        : 0;
    const discounted = Math.round(base * tier * (1 - pct / 100));
    const original = base * tier;
    const compareTotal = compareAt && compareAt > base ? compareAt * tier : null;
    const totalSaved = compareTotal ? compareTotal - discounted : original - discounted;
    return { discounted, original, compareTotal, pct, saved: totalSaved };
  }

  _getTierLabel(tier) {
    const map = {
      1: this.settings.label_1 || this.product.title,
      2: this.settings.label_2 || `${this.product.title} Duo`,
      3: this.settings.label_3 || `${this.product.title} Trio`,
    };
    return map[tier];
  }

  _getTierSubtitle(tier) {
    if (tier === 1) return this.settings.sublabel_1 || 'Standard price';
    const pct = tier === 2 ? this.settings.discount_2 : this.settings.discount_3;
    return pct > 0 ? `Save ${pct}% · ${tier} items` : `${tier} items`;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    const tiers = [1, 2, 3].map(t => this._renderTier(t)).join('');
    const bgColor = this.settings.atc_bg_color || '';
    const textColor = this.settings.atc_text_color || '';
    const btnStyle = [
      bgColor ? `background-color:${bgColor}` : '',
      textColor ? `color:${textColor}` : '',
    ].filter(Boolean).join(';');
    this.container.innerHTML = `
      <div class="bundle-save__heading">${this.settings.heading || 'Bundle & Save'}</div>
      <div class="bundle-save__tiers">${tiers}</div>
      <button class="bundle-save__atc" type="button" style="${btnStyle}">${this.settings.atc_label || 'Add to Cart'}</button>
      <p class="bundle-save__success"></p>
      <p class="bundle-save__error"></p>
    `;
    if (this.settings.sticky_mobile_atc !== false && this.settings.sticky_mobile_atc !== 'false') {
      this._initStickyAtc();
    }
  }

  _renderTier(tier) {
    const { discounted, original, pct, saved } = this._getTierPrice(tier);
    const isSelected = this.selectedTier === tier;
    const isMostPopular = parseInt(this.settings.most_popular_tier) === tier;

    const badge = isMostPopular
      ? `<span class="bundle-tier__badge">${this.settings.badge_label || 'Most Popular'}</span>`
      : '';

    const compareColor = this.settings.compare_price_color || '#999';
    const compareSize = this.settings.compare_price_size || 13;
    const compareSource = compareTotal || (pct > 0 ? original : null);
    const compareHtml = compareSource
      ? `<span class="bundle-tier__price-compare" style="color:${compareColor};font-size:${compareSize}px">${this._formatMoney(compareSource)}</span>` : '';
    const saveHtml = saved > 0
      ? `<span class="bundle-tier__price-save">Save ${this._formatMoney(saved)}</span>` : '';

    const variantsHtml = this.hasVariants ? this._renderVariants(tier) : '';

    return `
      <div class="bundle-tier${isSelected ? ' is-selected' : ''}${isMostPopular ? ' bundle-tier--popular' : ''}" data-tier="${tier}">
        ${badge}
        <div class="bundle-tier__header">
          <div class="bundle-tier__radio"></div>
          <div class="bundle-tier__info">
            <p class="bundle-tier__title">${this._getTierLabel(tier)}</p>
            <p class="bundle-tier__subtitle">${this._getTierSubtitle(tier)}</p>
          </div>
          <div class="bundle-tier__price">
            <span class="bundle-tier__price-current">${this._formatMoney(discounted)}</span>
            ${compareHtml}
            ${saveHtml}
          </div>
        </div>
        ${variantsHtml}
      </div>`;
  }

  _renderVariants(tier) {
    let rows = '';
    for (let i = 0; i < tier; i++) {
      rows += this._renderVariantRow(tier, i);
    }
    return `<div class="bundle-tier__variants">${rows}</div>`;
  }

  _renderVariantRow(tier, itemIndex) {
    const selectedId = this.selectedVariants[tier][itemIndex];
    const selectedVariant = this._getVariantById(selectedId);
    const itemLabel = tier > 1 ? `Item ${itemIndex + 1}` : '';

    const selects = this.product.options.map((optionName, optIdx) => {
      const values = [...new Set(this.product.variants.map(v => v.options[optIdx]))];
      const currentValue = selectedVariant ? selectedVariant.options[optIdx] : values[0];

      const options = values.map(val => {
        const available = this.product.variants.some(
          v => v.options[optIdx] === val && v.available
        );
        return `<option value="${val}" ${val === currentValue ? 'selected' : ''} ${!available ? 'disabled' : ''}>${val}${!available ? ' (unavailable)' : ''}</option>`;
      }).join('');

      return `
        <div class="bundle-variant-select-wrap">
          <label class="bundle-variant-select-label">${optionName}</label>
          <div class="bundle-variant-select-outer">
            <select
              class="bundle-variant-select"
              data-tier="${tier}"
              data-item="${itemIndex}"
              data-option-index="${optIdx}"
            >${options}</select>
            <svg class="bundle-variant-select-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
              <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
            </svg>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="bundle-variant-row">
        ${itemLabel ? `<span class="bundle-variant-row__label">${itemLabel}</span>` : ''}
        <div class="bundle-variant-selects">${selects}</div>
      </div>`;
  }

  // ─── Variant resolution ───────────────────────────────────────────────────

  _resolveVariantFromSelects(tier, itemIndex) {
    const selects = this.container.querySelectorAll(
      `.bundle-tier[data-tier="${tier}"] .bundle-variant-select[data-item="${itemIndex}"]`
    );
    const targetOptions = [];
    selects.forEach(sel => {
      targetOptions[parseInt(sel.dataset.optionIndex)] = sel.value;
    });
    return (
      this.product.variants.find(v => v.options.every((opt, i) => opt === targetOptions[i])) ||
      this.product.variants.find(v => v.options[0] === targetOptions[0])
    );
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  _bindEvents() {
    this.container.addEventListener('click', e => {
      if (e.target.closest('select') || e.target.closest('.bundle-variant-select-outer')) return;

      const tierEl = e.target.closest('.bundle-tier');
      if (tierEl) {
        const tier = parseInt(tierEl.dataset.tier);
        if (!isNaN(tier)) this._selectTier(tier);
      }

      if (e.target.classList.contains('bundle-save__atc')) {
        this._handleAddToCart();
      }
    });

    this.container.addEventListener('change', e => {
      const sel = e.target.closest('.bundle-variant-select');
      if (!sel) return;
      const tier = parseInt(sel.dataset.tier);
      const itemIndex = parseInt(sel.dataset.item);
      const variant = this._resolveVariantFromSelects(tier, itemIndex);
      if (variant) this.selectedVariants[tier][itemIndex] = variant.id;
    });
  }

  _selectTier(tier) {
    if (this.selectedTier === tier) return;
    this.selectedTier = tier;
    this.container.querySelectorAll('.bundle-tier').forEach(el => {
      el.classList.toggle('is-selected', parseInt(el.dataset.tier) === tier);
    });
    this._hideMessages();
  }

  _hideMessages() {
    this.container.querySelector('.bundle-save__success')?.classList.remove('is-visible');
    this.container.querySelector('.bundle-save__error')?.classList.remove('is-visible');
  }

  // ─── Add to Cart ──────────────────────────────────────────────────────────

  async _handleAddToCart() {
    const btn = this.container.querySelector('.bundle-save__atc');
    const errorEl = this.container.querySelector('.bundle-save__error');
    const successEl = this.container.querySelector('.bundle-save__success');

    this._hideMessages();
    btn.disabled = true;
    btn.classList.add('is-loading');

    try {
      const items = this._buildCartItems();
      await this._addToCart(items);
      btn.disabled = false;
      btn.classList.remove('is-loading');
      this._updateCartCount();

      const action = this.settings.redirect_action || 'drawer';
      if (action === 'checkout') {
        window.location.href = '/checkout';
      } else if (action === 'cart') {
        window.location.href = '/cart';
      } else {
        successEl.textContent = this.settings.success_message || 'Added to cart!';
        successEl.classList.add('is-visible');
        this._openCartDrawer();
      }
    } catch (err) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      errorEl.textContent = err.message || 'Could not add to cart. Please try again.';
      errorEl.classList.add('is-visible');
    }
  }

  _initStickyAtc() {
    const mq = window.matchMedia('(max-width: 767px)');
    const origBtn = this.container.querySelector('.bundle-save__atc');
    if (!origBtn) return;

    let wrap = document.querySelector('.bundle-save-sticky');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'bundle-save-sticky';
      const clone = document.createElement('button');
      clone.type = 'button';
      clone.className = 'bundle-save__atc bundle-save-sticky__btn';
      wrap.appendChild(clone);
      document.body.appendChild(wrap);
    }
    const cloneBtn = wrap.querySelector('.bundle-save-sticky__btn');

    const syncClone = () => {
      cloneBtn.disabled = origBtn.disabled;
      cloneBtn.innerHTML = origBtn.innerHTML;
      cloneBtn.style.cssText = origBtn.style.cssText;
    };
    syncClone();

    cloneBtn.addEventListener('click', () => {
      if (!origBtn.disabled) this._handleAddToCart();
    });

    const io = new IntersectionObserver(entries => {
      const visible = entries[0]?.isIntersecting;
      wrap.style.display = (!visible && mq.matches) ? 'block' : 'none';
      document.body.classList.toggle('has-bundle-sticky', !visible && mq.matches);
    }, { threshold: [0, 0.01] });
    io.observe(origBtn);

    new MutationObserver(syncClone).observe(origBtn, { attributes: true, childList: true, subtree: true });
    mq.addEventListener ? mq.addEventListener('change', () => {
      if (!mq.matches) { wrap.style.display = 'none'; document.body.classList.remove('has-bundle-sticky'); }
    }) : mq.addListener(() => {});
  }

  _buildCartItems() {
    const tier = this.selectedTier;
    if (!this.hasVariants) {
      return [{ id: this.product.variants[0].id, quantity: tier }];
    }
    const items = [];
    for (let i = 0; i < tier; i++) {
      const variantId = this.selectedVariants[tier][i];
      if (!variantId) throw new Error('Please select all options.');
      const existing = items.find(x => x.id === variantId);
      if (existing) existing.quantity += 1;
      else items.push({ id: variantId, quantity: 1 });
    }
    return items;
  }

  async _addToCart(items) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.description || 'Could not add to cart.');
    }
    return res.json();
  }

  _updateCartCount() {
    fetch('/cart.js')
      .then(r => r.json())
      .then(cart => {
        document.querySelectorAll('.cart-count-bubble span, [data-cart-count], .js-cart-count')
          .forEach(el => { el.textContent = cart.item_count; });
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));
      })
      .catch(() => {});
  }

  _openCartDrawer() {
    document.querySelector('[data-cart-drawer-trigger], #cart-icon-bubble')?.click();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-bundle-save]').forEach(el => new BundleSave(el));
});
