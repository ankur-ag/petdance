/**
 * RevenueCat API helper for subscription validation
 * Docs: https://www.revenuecat.com/docs/api-v1
 */

const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

/**
 * Validate user subscription via RevenueCat Web API
 * @param {string} revenuecatUserId - The RevenueCat app user ID (typically Firebase UID)
 * @returns {Promise<{hasAccess: boolean, subscriptionStatus: string}>}
 */
async function validateSubscription(revenuecatUserId, secretKey) {
  secretKey = secretKey || process.env.REVENUECAT_SECRET_KEY;
  if (!secretKey) {
    console.warn('REVENUECAT_SECRET_KEY not set - allowing request (dev mode)');
    return { hasAccess: true, subscriptionStatus: 'active' };
  }

  try {
    const response = await fetch(
      `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(revenuecatUserId)}`,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RevenueCat API error:', response.status, errorText);
      return { hasAccess: false, subscriptionStatus: 'none' };
    }

    const data = await response.json();
    const subscriber = data.subscriber || data;

    // Check entitlements - REVENUECAT_ENTITLEMENT_ID must match RevenueCat dashboard (e.g. "pro")
    const entitlementId = (process.env.REVENUECAT_ENTITLEMENT_ID || 'pro').toLowerCase();
    const entitlements = subscriber.entitlements || {};
    const entitlement = entitlements[entitlementId] || Object.entries(entitlements).find(
      ([k]) => k.toLowerCase() === entitlementId
    )?.[1];

    // Active if: entitlement exists AND (expires_date is null = lifetime, OR expires_date > now)
    const hasEntitlement = !!entitlement;
    let isActiveFromEntitlement = hasEntitlement && (
      entitlement.expires_date == null ||
      new Date(entitlement.expires_date) > new Date()
    );

    // Fallback: check subscriptions object (Web Billing / Stripe) - any active sub = active
    let isActiveFromSubscriptions = false;
    const subs = subscriber.subscriptions || {};
    for (const sub of Object.values(subs)) {
      if (sub && (sub.expires_date == null || new Date(sub.expires_date) > new Date())) {
        isActiveFromSubscriptions = true;
        break;
      }
    }

    const isActive = isActiveFromEntitlement || isActiveFromSubscriptions;

    // Use 'trial' only when in actual trial period (period_type); otherwise active paid = 'active'
    const subsList = Object.values(subs);
    const inTrialPeriod = subsList.some(s => s?.period_type === 'trial');
    const subscriptionStatus = isActive
      ? (inTrialPeriod ? 'trial' : 'active')
      : 'none';

    return {
      hasAccess: isActive,
      subscriptionStatus,
      managementUrl: subscriber.management_url || null,
    };
  } catch (error) {
    console.error('RevenueCat validation error:', error);
    return { hasAccess: false, subscriptionStatus: 'none' };
  }
}

module.exports = { validateSubscription };
