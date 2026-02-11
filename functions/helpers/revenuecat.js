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
    
    // Check entitlements - customize "pro" to match your RevenueCat entitlement ID
    const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID || 'pro';
    const entitlements = data.subscriber?.entitlements || {};
    const entitlement = entitlements[entitlementId];

    const isActive = entitlement?.expires_date 
      ? new Date(entitlement.expires_date) > new Date() 
      : false;

    const subscriptionStatus = isActive ? 'active' 
      : (data.subscriber?.subscriptions ? 'trial' : 'none');

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
