function extractAmount(str) {
  if (!str) return null;
  const cleaned = str.replace(/(?:rs|lkr|usd|eur|gbp|inr|aud|cad|\$)\.?/gi, ' ').trim();
  const match = cleaned.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function parseBankSMS(trimmed) {
  if (
    /^(?:avail(?:able)?\s+bal|bal|current\s+bal|closing\s+bal|total\s+bal|otp|dear\s+customer|thank\s+you|regards)/i.test(
      trimmed
    ) &&
    !/(?:debited|spent|charged|credited|paid|withdrawn|approved)/i.test(trimmed)
  ) {
    return null;
  }
  const explicitMatch = trimmed.match(
    /(?:for|of|amount|is|rs\.?|lkr|usd|eur|gbp)\s*(?:rs\.?|lkr|usd|eur|gbp)?\s*([0-9,]+(?:\.\d+)?)/i
  );
  let amount = 0;
  if (explicitMatch && explicitMatch[1]) {
    amount = extractAmount(explicitMatch[1]);
  }
  if (!amount || isNaN(amount)) {
    return null;
  }
  let type = 'expense';
  const isIncome = /(?:credited|received|deposit|salary|refund|added)/i.test(trimmed);
  if (isIncome) type = 'income';

  let title = 'Expense';
  const merchantMatch = trimmed.match(
    /\b(?:at|to|in)\s+([A-Za-z0-9\s&'-]+?)(?:\s+(?:on|using|via|ref|bal|avail(?:able)?|dated|call\b)|[.,;]|$)/i
  );
  if (merchantMatch && merchantMatch[1]) {
    title = merchantMatch[1].trim();
  } else {
    const cardMatch = trimmed.match(/([A-Za-z0-9]+\s+card|[A-Za-z0-9]+\s+bank)/i);
    if (cardMatch) {
      title = cardMatch[1].trim();
    } else {
      title = isIncome ? 'Income' : 'Card Expense';
    }
  }

  return { title, amount, type };
}

console.log(parseBankSMS("Transaction Approved on your Card 376657***2137 for LKR 2500.00 at DAMITH ENTERPRISE Available Bal LKR 139619.20  Call 0114315315 for any inquiry."));
