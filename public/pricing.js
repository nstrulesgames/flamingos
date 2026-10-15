// Prices are integer centavos; weight is the net weight of one serving in grams.
export const weightBasisLabel = grams => grams === 1000 ? 'kg' : grams === 1 ? 'g' : '100 g';
export function servingPrice(product, weightGrams, unitPrice) {
  if (product.allow_manual_price) return Number.isSafeInteger(unitPrice) && unitPrice >= 1 && unitPrice <= 10000000 ? unitPrice : null;
  if (product.pricing_mode !== 'weight') return product.price;
  if (!Number.isSafeInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000) return null;
  const basis = product.weight_basis_grams || 100;
  if (![1,100,1000].includes(basis)) return null;
  return Math.round(product.price * weightGrams / basis);
}
export const cartLineKey = line => line.manual_price ? `${line.id}:free:${line.price}` : `${line.id}:${line.weight_grams || 0}`;
