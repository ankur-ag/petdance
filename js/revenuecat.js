/**
 * RevenueCat Web SDK integration
 * Requires: REVENUECAT_PUBLIC_API_KEY in firebase-config.js
 * Docs: https://www.revenuecat.com/docs/web/web-billing/web-sdk
 */

let purchasesInstance = null;
const ENTITLEMENT_ID = window.REVENUECAT_ENTITLEMENT_ID || 'pro';

async function initRevenueCat(appUserId) {
  const apiKey = window.REVENUECAT_PUBLIC_API_KEY;
  if (!apiKey || !appUserId) return null;

  if (purchasesInstance) return purchasesInstance;

  try {
    const RC = window.Purchases;
    if (!RC) {
      console.warn('RevenueCat Purchases not loaded');
      return null;
    }
    // UMD build may expose as Purchases.Purchases
    const PurchasesClass = RC.Purchases || RC;
    purchasesInstance = PurchasesClass.configure({
      apiKey,
      appUserId,
    });
    return purchasesInstance;
  } catch (e) {
    console.error('RevenueCat init error:', e);
    return null;
  }
}

async function showRevenueCatPaywall(containerEl) {
  const user = window.firebaseAuth?.currentUser;
  if (!user) {
    alert('Please sign in to upgrade');
    return;
  }

  const purchases = await initRevenueCat(user.uid);
  if (!purchases) {
    console.warn('RevenueCat: init failed - check REVENUECAT_PUBLIC_API_KEY in firebase-config.js');
    alert('Upgrade is not configured. Add REVENUECAT_PUBLIC_API_KEY in firebase-config.js');
    return;
  }

  try {
    const paywallContainer = containerEl || document.getElementById('paywall-container');
    if (!paywallContainer) {
      console.error('Paywall container not found');
      return;
    }

    const plansContainer = document.getElementById('plans-container');
    if (plansContainer) plansContainer.style.display = 'none';
    paywallContainer.style.display = 'block';
    paywallContainer.innerHTML = '<div class="paywall-loading"><p>Loading...</p></div>';

    // Custom paywall - avoids "paywall not attached" error; we render packages and call purchase()
    const offerings = await purchases.getOfferings();
    const packages = offerings?.current?.availablePackages || [];

    if (!packages.length) {
      paywallContainer.innerHTML = '<p>No subscription packages configured. Add products and an offering in the RevenueCat dashboard.</p>';
      if (plansContainer) plansContainer.style.display = '';
      return;
    }

    function formatPrice(val) {
      if (val == null) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return '$' + val.toFixed(2);
      if (typeof val !== 'object') return '';
      const o = val;
      if (o.formattedPrice) return String(o.formattedPrice);
      if (o.formatted) return String(o.formatted);
      if (o.string) return String(o.string);
      if (o.localized) return String(o.localized);
      if (o.display) return String(o.display);
      if (o.amountMicros != null) {
        const amt = Number(o.amountMicros) / 1_000_000;
        const cur = o.currency || 'USD';
        return (cur === 'USD' ? '$' : cur + ' ') + amt.toFixed(2);
      }
      if (o.amount != null) {
        const amt = Number(o.amount);
        const cur = o.currency_code || o.currency || '$';
        return (amt >= 100 ? (amt / 100).toFixed(2) : amt.toFixed(2)) + (cur !== '$' ? ' ' + cur : '');
      }
      if (o.value != null) return '$' + Number(o.value).toFixed(2);
      return '';
    }
    paywallContainer.innerHTML = packages.map((pkg, i) => {
      const product = pkg.webBillingProduct || {};
      const p = product.price ?? product.defaultPrice ?? product.purchaseOptions?.[0]?.basePrice ?? product.basePrice;
      let price = formatPrice(p) || formatPrice(product.priceString) || formatPrice(product.formattedPrice) || 'Subscribe';
      if (typeof price !== 'string') price = 'Subscribe';
      const t = product.title ?? product.displayName;
      const title = (typeof t === 'string' ? t : (t && (t.string ?? t.formatted ?? t.display))) || product.displayName || pkg.identifier || 'Pro';
      return `
        <div class="paywall-package" data-pkg-idx="${i}">
          <div class="paywall-package-title">${title}</div>
          <div class="paywall-package-price">${price}</div>
          <button class="btn btn-primary btn-full paywall-purchase-btn" data-pkg-idx="${i}">Subscribe</button>
        </div>
      `;
    }).join('');

    paywallContainer.innerHTML += '<p class="paywall-restore"><a href="#" id="refresh-subscription-link">Already subscribed? Refresh status</a></p>';
    paywallContainer.classList.add('paywall-packages-grid');
    paywallContainer._revenueCatPackages = packages;

    const refreshLink = document.getElementById('refresh-subscription-link');
    if (refreshLink) {
      refreshLink.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!window.PetDanceAPI) return;
        try {
          await window.PetDanceAPI.refreshSubscription();
          if (typeof closeSubscription === 'function') closeSubscription();
        } catch (err) {
          console.warn('Refresh failed:', err);
          alert('Could not refresh. Try again or create a video to sync.');
        }
      });
    }

    if (!paywallContainer._purchaseHandlerAttached) {
      paywallContainer._purchaseHandlerAttached = true;
      paywallContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('.paywall-purchase-btn');
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = 'Processing...';
        const idx = parseInt(btn.dataset.pkgIdx, 10);
        const pkg = paywallContainer._revenueCatPackages?.[idx];
        if (!pkg) return;
        try {
          const result = await purchases.purchase({ rcPackage: pkg });
          const customerInfo = result?.customerInfo ?? result;
          const active = customerInfo?.entitlements?.active || {};
          const hasAccess = Object.keys(active).includes(ENTITLEMENT_ID) ||
            (customerInfo?.activeSubscriptions && customerInfo.activeSubscriptions.size > 0);
          if (hasAccess) {
            if (typeof closeSubscription === 'function') closeSubscription();
            if (window.PetDanceAPI) {
              PetDanceAPI.refreshSubscription().catch((e) => console.warn('Refresh subscription:', e));
            }
          } else if (customerInfo) {
            // Purchase completed but entitlement may sync slightly later - still close and refresh
            if (typeof closeSubscription === 'function') closeSubscription();
            if (window.PetDanceAPI) {
              PetDanceAPI.refreshSubscription().catch((e) => console.warn('Refresh subscription:', e));
            }
          }
        } catch (err) {
          if (err?.name === 'PurchasesError' && (err?.code === 'USER_CANCELLED' || err?.errorCode === 'UserCancelledError')) {
            // User cancelled - reset button
          } else {
            console.error('Purchase error:', err);
            alert('Purchase failed: ' + (err?.message || err?.toString?.() || 'Unknown error'));
          }
        } finally {
          btn.disabled = false;
          btn.textContent = 'Subscribe';
        }
      });
    }
  } catch (e) {
    if (e?.name === 'PurchasesError' && e?.code === 'USER_CANCELLED') {
      return;
    }
    console.error('RevenueCat paywall error:', e);
    const msg = e?.message || e?.toString?.() || 'Unknown error';
    alert('Something went wrong. Please try again.\n\nDetails: ' + msg + '\n\nCheck the browser console for more info.');
  }
}

async function checkEntitlement() {
  const purchases = purchasesInstance || (window.Purchases && await initRevenueCat(window.firebaseAuth?.currentUser?.uid));
  if (!purchases) return false;

  try {
    const customerInfo = await purchases.getCustomerInfo();
    return Object.keys(customerInfo.entitlements?.active || {}).includes(ENTITLEMENT_ID);
  } catch {
    return false;
  }
}

window.initRevenueCat = initRevenueCat;
window.showRevenueCatPaywall = showRevenueCatPaywall;
window.checkEntitlement = checkEntitlement;
