import { getCommercialSettings } from "./settings-service.js";

export function getProductionCosts(db) {
  const settings = getCommercialSettings(db);
  const exchangeRate = Number(settings.usdExchangeRate || 0);
  const hourlyCostArs = Number(settings.productionHourlyCostArs || 0);
  const items = db.prepare(`SELECT id,item_code,name,item_kind,item_type,unit,product_id,currency,purchase_cost,conversion_factor,active
    FROM inventory_items`).all();
  const itemById = new Map(items.map((item) => [item.id, item]));
  const products = db.prepare(`SELECT id,km_code,ean13,name,base_price_cents,production_minutes_per_unit,production_commission_cents
    FROM products WHERE active=1 ORDER BY km_code COLLATE NOCASE`).all();
  const productById = new Map(products.map((product) => [product.id, product]));
  const productComponents = groupRows(db.prepare(`SELECT b.product_id,b.component_item_id,b.quantity
    FROM product_bom b WHERE b.active=1 ORDER BY b.id`).all(), "product_id");
  const itemRecipes = new Map(db.prepare(`SELECT item_id,output_quantity,notes FROM inventory_item_recipes`).all()
    .map((recipe) => [recipe.item_id, recipe]));
  const itemRecipeComponents = groupRows(db.prepare(`SELECT item_id,component_item_id,quantity
    FROM inventory_item_recipe_components ORDER BY item_id,component_item_id`).all(), "item_id");
  const itemMemo = new Map();
  const productMemo = new Map();

  function calculateItem(itemId, trail = new Set()) {
    if (itemMemo.has(itemId)) return itemMemo.get(itemId);
    const item = itemById.get(itemId);
    if (!item) return missingCost("Insumo inexistente");
    const marker = `item:${itemId}`;
    if (trail.has(marker)) return missingCost(`Ciclo detectado en ${item.item_code}`);
    const nextTrail = new Set(trail).add(marker);
    let result;
    if (item.product_id) {
      const productCost = calculateProduct(item.product_id, nextTrail);
      result = {
        unitCostArs: productCost.totalCostArs,
        complete: productCost.complete,
        missing: productCost.missing,
        source: "manufactured_product",
        sourceProductId: item.product_id,
        components: productCost.components
      };
    } else if (itemRecipes.has(itemId)) {
      const recipe = itemRecipes.get(itemId);
      const components = (itemRecipeComponents.get(itemId) || []).map((component) => {
        const componentItem = itemById.get(component.component_item_id);
        const componentCost = calculateItem(component.component_item_id, nextTrail);
        return {
          itemId: component.component_item_id,
          itemCode: componentItem?.item_code || "",
          name: componentItem?.name || "Insumo inexistente",
          quantity: Number(component.quantity),
          unit: componentItem?.unit || "",
          unitCostArs: componentCost.unitCostArs,
          subtotalArs: componentCost.unitCostArs * Number(component.quantity),
          complete: componentCost.complete,
          missing: componentCost.missing
        };
      });
      const missing = unique(components.flatMap((component) => component.missing));
      result = {
        unitCostArs: components.reduce((total, component) => total + component.subtotalArs, 0) / Number(recipe.output_quantity),
        complete: missing.length === 0,
        missing,
        source: "intermediate_recipe",
        outputQuantity: Number(recipe.output_quantity),
        notes: recipe.notes || "",
        components
      };
    } else {
      const purchaseCost = Number(item.purchase_cost || 0);
      const conversionFactor = Number(item.conversion_factor || 0);
      const missing = [];
      if (purchaseCost <= 0) missing.push(`Falta el costo de ${item.item_code}`);
      if (conversionFactor <= 0) missing.push(`Falta la conversión de ${item.item_code}`);
      const currencyFactor = item.currency === "USD" ? exchangeRate : 1;
      if (item.currency === "USD" && exchangeRate <= 0) missing.push("Falta el tipo de cambio USD");
      result = {
        unitCostArs: purchaseCost > 0 && conversionFactor > 0 && currencyFactor > 0 ? purchaseCost * currencyFactor / conversionFactor : 0,
        complete: missing.length === 0,
        missing,
        source: "purchase",
        currency: item.currency === "ARS" ? "ARS" : "USD",
        purchaseCost,
        conversionFactor
      };
    }
    itemMemo.set(itemId, result);
    return result;
  }

  function calculateProduct(productId, trail = new Set()) {
    if (productMemo.has(productId)) return productMemo.get(productId);
    const product = productById.get(productId);
    if (!product) return { ...missingCost("Producto inexistente"), components: [], materialCostArs: 0, laborCostArs: 0, commissionArs: 0, totalCostArs: 0 };
    const marker = `product:${productId}`;
    if (trail.has(marker)) return { ...missingCost(`Ciclo detectado en ${product.km_code}`), components: [], materialCostArs: 0, laborCostArs: 0, commissionArs: 0, totalCostArs: 0 };
    const nextTrail = new Set(trail).add(marker);
    const components = (productComponents.get(productId) || []).map((component) => {
      const item = itemById.get(component.component_item_id);
      const itemCost = calculateItem(component.component_item_id, nextTrail);
      return {
        itemId: component.component_item_id,
        itemCode: item?.item_code || "",
        name: item?.name || "Insumo inexistente",
        itemKind: item?.item_kind || item?.item_type || "",
        quantity: Number(component.quantity),
        unit: item?.unit || "",
        unitCostArs: itemCost.unitCostArs,
        subtotalArs: itemCost.unitCostArs * Number(component.quantity),
        complete: itemCost.complete,
        missing: itemCost.missing,
        source: itemCost.source
      };
    });
    const materialCostArs = components.reduce((total, component) => total + component.subtotalArs, 0);
    const minutes = Number(product.production_minutes_per_unit || 0);
    const laborCostArs = minutes > 0 && hourlyCostArs > 0 ? minutes / 60 * hourlyCostArs : 0;
    const commissionArs = Number(product.production_commission_cents || 0) / 100;
    const missing = components.flatMap((component) => component.missing);
    if (!components.length) missing.push(`Falta la receta de ${product.km_code}`);
    if (minutes <= 0) missing.push(`Falta el tiempo de fabricación de ${product.km_code}`);
    if (hourlyCostArs <= 0) missing.push("Falta el costo por hora de producción");
    const uniqueMissing = unique(missing);
    const totalCostArs = materialCostArs + laborCostArs + commissionArs;
    const listPriceArs = Number(product.base_price_cents || 0) / 100;
    const complete = uniqueMissing.length === 0;
    const result = {
      productId, kmCode: product.km_code, ean13: product.ean13 || "", name: product.name,
      listPriceArs, productionMinutesPerUnit: minutes, hourlyCostArs, materialCostArs, laborCostArs,
      commissionArs, totalCostArs, marginArs: complete ? listPriceArs - totalCostArs : null,
      marginPercent: complete && listPriceArs > 0 ? (listPriceArs - totalCostArs) / listPriceArs * 100 : null,
      complete, missing: uniqueMissing, components
    };
    productMemo.set(productId, result);
    return result;
  }

  const productCosts = products.map((product) => calculateProduct(product.id));
  const intermediates = items.filter((item) => item.active && itemRecipes.has(item.id)).map((item) => {
    const cost = calculateItem(item.id);
    const recipe = itemRecipes.get(item.id);
    return {
      itemId: item.id, itemCode: item.item_code, name: item.name, unit: item.unit,
      unitCostArs: cost.unitCostArs, outputQuantity: Number(recipe.output_quantity), notes: recipe.notes || "",
      complete: cost.complete, missing: cost.missing, components: cost.components || []
    };
  });
  const completeProducts = productCosts.filter((product) => product.complete);
  return {
    generatedAt: new Date().toISOString(),
    settings: { usdExchangeRate: exchangeRate, productionHourlyCostArs: hourlyCostArs },
    summary: {
      products: productCosts.length,
      complete: completeProducts.length,
      incomplete: productCosts.length - completeProducts.length,
      intermediates: intermediates.length,
      averageMarginPercent: completeProducts.length ? completeProducts.reduce((total, product) => total + product.marginPercent, 0) / completeProducts.length : null
    },
    products: productCosts,
    intermediates
  };
}

function groupRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const values = groups.get(row[key]) || [];
    values.push(row);
    groups.set(row[key], values);
  }
  return groups;
}

function missingCost(message) { return { unitCostArs: 0, complete: false, missing: [message], source: "missing" }; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
