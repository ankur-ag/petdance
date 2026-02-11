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
    const isActive = hasEntitlement && (
      entitlement.expires_date == null ||
      new Date(entitlement.expires_date) > new Date()
    );

    const subscriptionStatus = isActive ? 'active'
      : (subscriber.subscriptions && Object.keys(subscriber.subscriptions).length ? 'trial' : 'none');

    return {
      hasAccess: isActive || subscriptionStatus === 'trial',
      subscriptionStatus: isActive ? 'active' : subscriptionStatus,
    };
  } catch (error) {
    console.error('RevenueCat validation error:', error);
    return { hasAccess: false, subscriptionStatus: 'none' };
  }
}

module.exports = { validateSubscription };
