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
    const listPriceCents = Number(product.base_price_cents || 0);
    const listPriceArs = listPriceCents / 100;
    const maximumDiscountCents = Math.round(listPriceCents * Number(settings.maximumDiscountBps || 0) / 10_000);
    const priceAfterMaximumDiscountCents = listPriceCents - maximumDiscountCents;
    const maximumSalesCommissionCents = Math.round(priceAfterMaximumDiscountCents * Number(settings.maximumCommissionBps || 0) / 10_000);
    const netCommercialRevenueArs = (priceAfterMaximumDiscountCents - maximumSalesCommissionCents) / 100;
    const complete = uniqueMissing.length === 0;
    const profitabilityArs = complete ? netCommercialRevenueArs - totalCostArs : null;
    const profitabilityPercent = complete && netCommercialRevenueArs > 0 ? profitabilityArs / netCommercialRevenueArs * 100 : null;
    const profitabilityLevel = classifyProfitability(profitabilityPercent, settings, complete, netCommercialRevenueArs);
    const result = {
      productId, kmCode: product.km_code, ean13: product.ean13 || "", name: product.name,
      listPriceArs, productionMinutesPerUnit: minutes, hourlyCostArs, materialCostArs, laborCostArs,
      commissionArs, totalCostArs, marginArs: complete ? listPriceArs - totalCostArs : null,
      marginPercent: complete && listPriceArs > 0 ? (listPriceArs - totalCostArs) / listPriceArs * 100 : null,
      maximumDiscountArs: maximumDiscountCents / 100,
      priceAfterMaximumDiscountArs: priceAfterMaximumDiscountCents / 100,
      maximumSalesCommissionArs: maximumSalesCommissionCents / 100,
      netCommercialRevenueArs, profitabilityArs, profitabilityPercent, profitabilityLevel,
      complete, missing: uniqueMissing, components
    };
    productMemo.set(productId, result);
    return result;
  }

  const productCosts = products.map((product) => calculateProduct(product.id));
  const materials = items.filter((item) => item.active && !item.product_id).map((item) => {
    const cost = calculateItem(item.id);
    return {
      itemId: item.id, itemCode: item.item_code, name: item.name, itemKind: item.item_kind || item.item_type,
      unit: item.unit, unitCostArs: cost.unitCostArs, complete: cost.complete, missing: cost.missing,
      source: cost.source
    };
  });
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
    settings: {
      usdExchangeRate: exchangeRate,
      productionHourlyCostArs: hourlyCostArs,
      maximumDiscountBps: settings.maximumDiscountBps,
      maximumCommissionBps: settings.maximumCommissionBps,
      profitMarginMinimumBps: settings.profitMarginMinimumBps,
      profitMarginMediumBps: settings.profitMarginMediumBps,
      profitMarginMaximumBps: settings.profitMarginMaximumBps
    },
    summary: {
      products: productCosts.length,
      complete: completeProducts.length,
      incomplete: productCosts.length - completeProducts.length,
      intermediates: intermediates.length,
      averageMarginPercent: completeProducts.length ? completeProducts.reduce((total, product) => total + product.marginPercent, 0) / completeProducts.length : null
    },
    products: productCosts,
    materials,
    intermediates
  };
}

export function getInventoryValuation(db) {
  const costs = getProductionCosts(db);
  const itemCosts = new Map((costs.materials || []).map((item) => [Number(item.itemId), item]));
  const productCosts = new Map((costs.products || []).map((product) => [Number(product.productId), product]));
  const rows = db.prepare(`
    SELECT i.id,i.item_code,i.name,i.item_type,i.item_kind,i.unit,i.product_id,
      COALESCE(b.quantity,0) AS quantity,b.updated_at,p.km_code,p.warehouse_location,
      COALESCE(r.committed_quantity,0) AS committed_quantity,
      ps.name AS primary_supplier
    FROM inventory_items i
    LEFT JOIN inventory_balances b ON b.item_id=i.id
    LEFT JOIN products p ON p.id=i.product_id
    LEFT JOIN (
      SELECT oi.product_id,SUM(CASE WHEN COALESCE(oi.confirmed_quantity,0)>0 THEN oi.confirmed_quantity ELSE oi.quantity END) AS committed_quantity
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE oi.line_status IN ('confirmed','partial') AND o.status!='cancelled' AND o.fulfillment_status IN ('pending','ready')
      GROUP BY oi.product_id
    ) r ON r.product_id=i.product_id
    LEFT JOIN production_supplier_items psi ON psi.item_id=i.id AND psi.active=1 AND psi.is_primary=1
    LEFT JOIN production_suppliers ps ON ps.id=psi.supplier_id
    WHERE i.active=1 AND i.tracks_stock=1
    ORDER BY i.product_id IS NOT NULL,i.item_kind,i.item_code COLLATE NOCASE
  `).all().map((row) => {
    const quantity = Number(row.quantity || 0);
    const committedQuantity = Number(row.committed_quantity || 0);
    const availableQuantity = quantity - committedQuantity;
    const cost = row.product_id ? productCosts.get(Number(row.product_id)) : itemCosts.get(Number(row.id));
    const unitCostArs = Number(row.product_id ? cost?.totalCostArs : cost?.unitCostArs || 0);
    const complete = Boolean(cost?.complete);
    const category = row.product_id
      ? "finished_products"
      : (cost?.source === "intermediate_recipe" || row.item_kind === "intermediate" || row.item_type === "intermediate")
        ? "intermediates"
        : "raw_materials";
    return {
      itemId: row.id, productId: row.product_id || null, itemCode: row.product_id ? row.km_code : row.item_code,
      name: row.name, category, unit: row.unit, quantity, committedQuantity, availableQuantity,
      unitCostArs, physicalValueArs: Math.max(0, quantity) * unitCostArs,
      availableValueArs: Math.max(0, availableQuantity) * unitCostArs,
      committedValueArs: Math.max(0, Math.min(Math.max(0, quantity), committedQuantity)) * unitCostArs,
      shortageQuantity: Math.max(0, committedQuantity - Math.max(0, quantity)),
      complete, missing: cost?.missing || ["Costo no disponible"], primarySupplier: row.primary_supplier || "Sin proveedor",
      warehouseLocation: row.warehouse_location || "Sin ubicación", updatedAt: row.updated_at || ""
    };
  });
  const groups = {
    rawMaterials: rows.filter((row) => row.category === "raw_materials"),
    intermediates: rows.filter((row) => row.category === "intermediates"),
    finishedProducts: rows.filter((row) => row.category === "finished_products")
  };
  const valueOf = (items, field = "physicalValueArs") => items.reduce((total, item) => total + Number(item[field] || 0), 0);
  const latestStockUpdate = rows.map((row) => row.updatedAt).filter(Boolean).sort().at(-1) || "";
  return {
    generatedAt: new Date().toISOString(),
    settings: { usdExchangeRate: costs.settings.usdExchangeRate },
    summary: {
      rawMaterialsValueArs: valueOf(groups.rawMaterials),
      intermediatesValueArs: valueOf(groups.intermediates),
      finishedProductsValueArs: valueOf(groups.finishedProducts),
      finishedProductsAvailableValueArs: valueOf(groups.finishedProducts, "availableValueArs"),
      totalInventoryValueArs: valueOf(rows),
      incompleteItems: rows.filter((row) => row.quantity > 0 && !row.complete).length,
      negativeBalances: rows.filter((row) => row.quantity < 0).length,
      latestStockUpdate
    },
    groups
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
function classifyProfitability(percent, settings, complete, netRevenue) {
  if (!complete) return "cost_incomplete";
  if (netRevenue <= 0) return "no_net_revenue";
  const minimum = Number(settings.profitMarginMinimumBps || 0) / 100;
  const medium = Number(settings.profitMarginMediumBps || 0) / 100;
  const maximum = Number(settings.profitMarginMaximumBps || 0) / 100;
  if (minimum === 0 && medium === 0 && maximum === 0) return "parameters_pending";
  if (percent < minimum) return "below_minimum";
  if (percent < medium) return "minimum";
  if (percent < maximum) return "medium";
  return "maximum";
}
