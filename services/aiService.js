const Groq = require('groq-sdk');
const circuitBreaker = require('./circuitBreaker');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const buildPrompt = (notification) => `
You are a Notification Prioritization Engine.
Analyze this notification and classify it.

Notification Details:
- Event Type: ${notification.event_type}
- Message: ${notification.message}
- Source: ${notification.source}
- Priority Hint: ${notification.priority_hint}
- Channel: ${notification.channel}

Classification Rules:
- NOW: Urgent, needs immediate attention (security alerts, payment failures, critical errors)
- LATER: Important but not urgent (meeting reminders, project updates, weekly reports)
- NEVER: Spam, promotions, duplicates, irrelevant (marketing, discount offers)

Respond ONLY with valid JSON like this:
{
  "classification": "NOW",
  "confidence": 0.95,
  "reasoning": "Security alert requires immediate attention"
}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fallbackClassification(notification) {
  console.log('Using fallback classification - AI unavailable');

  const hint = notification.priority_hint?.toLowerCase();
  const type = notification.event_type?.toLowerCase();
  const message = notification.message?.toLowerCase();

  if (hint === 'critical' || 
      type?.includes('security') || 
      type?.includes('error') ||
      message?.includes('urgent') ||
      message?.includes('alert')) {
    return {
      classification: 'NOW',
      confidence: 0.6,
      reasoning: 'Fallback: critical priority or urgent keywords detected',
      model: 'rule-based-fallback',
      is_fallback: true
    };
  }

  if (hint === 'low' ||
      type?.includes('marketing') ||
      type?.includes('promo') ||
      message?.includes('discount') ||
      message?.includes('offer') ||
      message?.includes('sale')) {
    return {
      classification: 'NEVER',
      confidence: 0.6,
      reasoning: 'Fallback: low priority or promotional content detected',
      model: 'rule-based-fallback',
      is_fallback: true
    };
  }

  return {
    classification: 'LATER',
    confidence: 0.5,
    reasoning: 'Fallback: no strong signals detected, deferring',
    model: 'rule-based-fallback',
    is_fallback: true
  };
}

async function callGroqWithRetry(notification, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`AI attempt ${attempt}/${maxRetries}...`);

      const message = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 256,
        messages: [{ role: 'user', content: buildPrompt(notification) }]
      });

      const text = message.choices[0].message.content.trim();
      const parsed = JSON.parse(text);

      if (!['NOW', 'LATER', 'NEVER'].includes(parsed.classification)) {
        throw new Error('Invalid classification from AI');
      }

      return {
        classification: parsed.classification,
        confidence: parsed.confidence || 0.8,
        reasoning: parsed.reasoning,
        model: 'llama-3.1-8b-instant',
        is_fallback: false
      };

    } catch (error) {
      lastError = error;
      console.log(`AI attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) {
        await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError;
}

async function classifyWithAI(notification) {
  if (circuitBreaker.isOpen()) {
    console.log('Circuit breaker OPEN - skipping AI, using fallback');
    return fallbackClassification(notification);
  }

  try {
    const result = await callGroqWithRetry(notification);
    circuitBreaker.recordSuccess();
    console.log(`AI classified as ${result.classification} (${result.confidence} confidence)`);
    return result;

  } catch (error) {
    circuitBreaker.recordFailure();
    console.log(`AI failed after all retries: ${error.message}`);
    return fallbackClassification(notification);
  }
}

module.exports = { classifyWithAI };
