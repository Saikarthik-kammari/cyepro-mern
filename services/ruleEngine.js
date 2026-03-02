const Rule = require('../models/Rule');

// Check a single condition against the notification
function evaluateCondition(notification, condition) {
  console.log('Field:', condition.field, '| Value in notification:', notification[condition.field], '| Condition value:', condition.value);
  
  const fieldValue = String(notification[condition.field] || '').toLowerCase();
  const condValue = Array.isArray(condition.value)
    ? condition.value.map(v => String(v).toLowerCase())
    : String(condition.value).toLowerCase();
  switch (condition.operator) {
    case 'equals':
      return fieldValue === condValue;

    case 'not_equals':
      return fieldValue !== condValue;

    case 'contains':
      return fieldValue.includes(condValue);

    case 'starts_with':
      return fieldValue.startsWith(condValue);

    case 'in':
      return Array.isArray(condition.value) && condValue.includes(fieldValue);

    case 'not_in':
      return Array.isArray(condition.value) && !condValue.includes(fieldValue);

    default:
      return false;
  }
}

async function evaluateRules(notification) {
  // Always fetch fresh from DB - no caching
  // This means rule changes take effect immediately
  const rules = await Rule.find({
    isActive: true,
    isDeleted: false
  }).sort({ priority: -1 }).lean();

  console.log(`Evaluating ${rules.length} active rules...`);

  for (const rule of rules) {
    // ALL conditions must match (AND logic)
    const allConditionsMet = rule.conditions.every(condition =>
      evaluateCondition(notification, condition)
    );

    if (allConditionsMet) {
      console.log(`Rule matched: "${rule.name}" → ${rule.action}`);
      return {
        matched: true,
        rule: rule,
        action: rule.action,
        defer_minutes: rule.defer_minutes || 60,
        reason: `Rule "${rule.name}" matched — ${rule.description || rule.conditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(' AND ')}`
      };
    }
  }

  // No rule matched
  console.log('No rules matched — will proceed to AI');
  return { matched: false };
}

module.exports = { evaluateRules };