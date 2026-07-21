import { getStorageStatus } from "./storage-status-service.js";
import { getProductionCosts } from "./production-cost-service.js";

const CLOSED_STATUSES = new Set(["delivered", "cancelled"]);
const OPEN_PAYMENT_STATUSES = new Set(["pending_payment", "receipt_uploaded", "credit_account", "overdue", "rejected"]);

export function getAdminOperationDashboard(db, options = {}) {
  snapshotMissingOrderItemCosts(db);
  const orders = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_status,
           o.total_cents, o.paid_cents, o.balance_cents, o.payment_due_date,
           o.sales_rep_name, o.sales_rep_email, o.sales_commission_cents,
           o.created_at, c.business_name, c.tax_id
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ORDER BY o.created_at DESC
  `).all();

  const items = db.prepare(`
    SELECT oi.order_id, oi.km_code, oi.product_name, oi.quantity, oi.confirmed_quantity,
           oi.subtotal_net_cents, oi.confirmed_subtotal_net_cents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status <> 'cancelled'
  `).all();

  const accountPayments = listCurrentAccountPayments(db);
  const accountPaymentsByOrder = groupAccountPayments(accountPayments);

  const now = new Date();
  const today = isoDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const closedOrders = orders.filter((order) => !CLOSED_STATUSES.has(order.status));
  const activeOrders = orders.filter((order) => !CLOSED_STATUSES.has(order.status) && order.fulfillment_status !== "delivered");
  const finalizedOrders = orders.filter((order) => order.status === "delivered" || order.fulfillment_status === "delivered");
  const monthOrders = orders.filter((order) => (order.created_at || "").slice(0, 10) >= monthStart && order.status !== "cancelled");
  const openBalanceOrders = orders
    .filter((order) => Number(order.balance_cents || 0) > 0 && OPEN_PAYMENT_STATUSES.has(order.payment_status))
    .sort(compareCurrentAccountOrders);
  const overdueOrders = openBalanceOrders.filter((order) => order.payment_due_date && order.payment_due_date < today);
  const dueSoonOrders = openBalanceOrders.filter((order) => order.payment_due_date && order.payment_due_date >= today && order.payment_due_date <= addDaysIsoDate(now, 2));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      finalizedOrders: finalizedOrders.length,
      monthTotalCents: sum(monthOrders, "total_cents"),
      monthPaidCents: sum(monthOrders, "paid_cents"),
      openBalanceCents: sum(openBalanceOrders, "balance_cents"),
      overdueBalanceCents: sum(overdueOrders, "balance_cents"),
      dueSoonBalanceCents: sum(dueSoonOrders, "balance_cents"),
      pendingReceipts: orders.filter((order) => order.payment_status === "receipt_uploaded").length,
      pendingDispatch: orders.filter((order) => order.fulfillment_status === "ready").length
    },
    sales: {
      byDay: groupOrdersByDay(monthOrders),
      byCustomer: groupByCustomer(monthOrders),
      bySalesRep: groupBySalesRep(monthOrders)
    },
    currentAccounts: {
      open: openBalanceOrders.map((order) => mapCurrentAccountOrder(order, accountPaymentsByOrder)),
      overdue: overdueOrders.map((order) => mapCurrentAccountOrder(order, accountPaymentsByOrder)),
      dueSoon: dueSoonOrders.map((order) => mapCurrentAccountOrder(order, accountPaymentsByOrder))
    },
    products: topProducts(items),
    monthlyReport: buildMonthlyReport(db, options.month, accountPayments),
    queues: buildQueues(orders),
    storage: getStorageStatus()
  };
}

function snapshotMissingOrderItemCosts(db) {
  const missing = db.prepare(`SELECT DISTINCT oi.product_id FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    WHERE oi.industrial_cost_snapshot_at IS NULL AND o.status<>'order_created' AND o.status<>'cancelled'`).all();
  if (!missing.length) return;
  const costs = new Map(getProductionCosts(db).products.map((cost) => [Number(cost.productId), cost]));
  const update = db.prepare(`UPDATE order_items SET industrial_unit_cost_cents=?,industrial_material_cost_cents=?,
    industrial_labor_cost_cents=?,industrial_production_commission_cents=?,industrial_cost_complete=?,
    industrial_cost_snapshot_at=CURRENT_TIMESTAMP WHERE product_id=? AND industrial_cost_snapshot_at IS NULL`);
  for (const row of missing) {
    const cost = costs.get(Number(row.product_id));
    if (!cost) continue;
    update.run(Math.round(cost.totalCostArs*100),Math.round(cost.materialCostArs*100),Math.round(cost.laborCostArs*100),
      Math.round(cost.commissionArs*100),cost.complete?1:0,row.product_id);
  }
}

function buildMonthlyReport(db, requestedMonth, payments) {
  const month = /^\d{4}-\d{2}$/.test(String(requestedMonth || "")) ? String(requestedMonth) : new Date().toISOString().slice(0,7);
  const orderRows = db.prepare(`SELECT o.id,o.status,o.payment_status,o.fulfillment_status,o.total_cents,o.balance_cents,
    o.commercial_adjustment_cents,o.sales_commission_bps,o.created_at,o.updated_at
    FROM orders o WHERE o.status<>'cancelled'`).all();
  const itemRows = db.prepare(`SELECT oi.order_id,oi.product_id,oi.km_code,oi.product_name,oi.quantity,oi.confirmed_quantity,
    oi.subtotal_net_cents,oi.confirmed_subtotal_net_cents,oi.industrial_unit_cost_cents,oi.industrial_cost_complete,
    COALESCE(f.name,'Sin familia') family_name FROM order_items oi JOIN orders o ON o.id=oi.order_id
    LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN product_families f ON f.id=p.family_id WHERE o.status<>'cancelled'`).all();
  const itemsByOrder = new Map();
  for (const item of itemRows) {
    const values=itemsByOrder.get(Number(item.order_id))||[]; values.push(item); itemsByOrder.set(Number(item.order_id),values);
  }
  const datesByOrder = buildOrderEventDates(db, orderRows);
  const produced = db.prepare(`SELECT pri.product_id,p.km_code,p.name product_name,COALESCE(f.name,'Sin familia') family_name,
    SUM(pri.good_quantity) quantity FROM production_daily_report_items pri
    JOIN production_daily_reports pr ON pr.id=pri.report_id JOIN products p ON p.id=pri.product_id
    LEFT JOIN product_families f ON f.id=p.family_id
    WHERE pr.status='confirmed' AND substr(pr.production_date,1,7)=? GROUP BY pri.product_id,p.km_code,p.name,f.name`).all(month);
  const productMap = new Map();
  const productEntry = (item) => {
    const key=Number(item.product_id); if (!productMap.has(key)) productMap.set(key,{productId:key,kmCode:item.km_code||"",productName:item.product_name||"",familyName:item.family_name||"Sin familia",sold:0,produced:0,dispatched:0,delivered:0,paid:0,netSalesCents:0,industrialCostCents:0,salesCommissionCents:0,utilityCents:0,marginPercent:null,costIncomplete:false});
    return productMap.get(key);
  };
  const finance={netSalesCents:0,collectionsCents:0,balanceGeneratedCents:0,industrialCostCents:0,salesCommissionCents:0,utilityCents:0,marginPercent:null};
  const articles={sold:0,produced:0,dispatched:0,delivered:0,paid:0};
  for (const order of orderRows) {
    const dates=datesByOrder.get(Number(order.id)); const orderItems=itemsByOrder.get(Number(order.id))||[];
    const soldIn=dates.sold.slice(0,7)===month, dispatchedIn=dates.dispatched.slice(0,7)===month, deliveredIn=dates.delivered.slice(0,7)===month;
    if (soldIn) finance.balanceGeneratedCents+=Number(order.balance_cents||0);
    for (const item of orderItems) {
      const quantity=Number(item.confirmed_quantity||item.quantity||0); const entry=productEntry(item);
      if (soldIn) {
        const net=Number(item.confirmed_subtotal_net_cents||item.subtotal_net_cents||0);
        const cost=Number(item.industrial_unit_cost_cents||0)*quantity;
        const commission=Math.round(net*Number(order.sales_commission_bps||0)/10000);
        entry.sold+=quantity; entry.netSalesCents+=net; entry.industrialCostCents+=cost; entry.salesCommissionCents+=commission;
        entry.costIncomplete ||= !Number(item.industrial_cost_complete); articles.sold+=quantity;
        finance.netSalesCents+=net; finance.industrialCostCents+=cost; finance.salesCommissionCents+=commission;
      }
      if (dispatchedIn) { entry.dispatched+=quantity; articles.dispatched+=quantity; }
      if (deliveredIn) { entry.delivered+=quantity; articles.delivered+=quantity; }
    }
  }
  for (const row of produced) { const entry=productEntry(row); entry.produced+=Number(row.quantity||0); articles.produced+=Number(row.quantity||0); }
  for (const payment of payments) if (String(payment.created_at||"").slice(0,7)===month) finance.collectionsCents+=Number(payment.amount_cents||0);
  const paidDates=calculatePaidDates(orderRows,payments);
  for (const order of orderRows) if ((paidDates.get(Number(order.id))||"").slice(0,7)===month) for (const item of itemsByOrder.get(Number(order.id))||[]) {
    const quantity=Number(item.confirmed_quantity||item.quantity||0); productEntry(item).paid+=quantity; articles.paid+=quantity;
  }
  for (const entry of productMap.values()) { entry.utilityCents=entry.netSalesCents-entry.industrialCostCents-entry.salesCommissionCents; entry.marginPercent=entry.netSalesCents?entry.utilityCents/entry.netSalesCents*100:null; }
  finance.utilityCents=finance.netSalesCents-finance.industrialCostCents-finance.salesCommissionCents;
  finance.marginPercent=finance.netSalesCents?finance.utilityCents/finance.netSalesCents*100:null;
  const products=[...productMap.values()].filter((row)=>row.sold||row.produced||row.dispatched||row.delivered||row.paid).sort((a,b)=>b.netSalesCents-a.netSalesCents||a.kmCode.localeCompare(b.kmCode));
  return {month,label:monthLabel(month),articles,finance,products,trend:buildTrend(db,month,datesByOrder,orderRows,itemsByOrder)};
}

function buildOrderEventDates(db, orders) {
  const result=new Map(orders.map((order)=>[Number(order.id),{sold:order.status==='order_created'?"":order.created_at||"",dispatched:"",delivered:""}]));
  for (const event of db.prepare("SELECT order_id,event_type,after_json,created_at FROM order_events ORDER BY created_at,id").all()) {
    const dates=result.get(Number(event.order_id)); if (!dates) continue;
    if (event.event_type==='availability_confirmed') dates.sold=event.created_at||dates.sold;
    if (event.event_type==='customer_received') dates.delivered=event.created_at||dates.delivered;
    if (event.event_type==='fulfillment_updated') { let after={}; try { after=JSON.parse(event.after_json||"{}"); } catch {}
      const status=after.fulfillmentStatus||after.fulfillment_status; if (status==='shipped'&&!dates.dispatched) dates.dispatched=event.created_at||""; if(status==='delivered') dates.delivered=event.created_at||dates.delivered; }
  }
  return result;
}

function calculatePaidDates(orders,payments) {
  const orderById=new Map(orders.map((order)=>[Number(order.id),order])); const grouped=new Map();
  for (const payment of [...payments].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")))) { const id=Number(payment.order_id); const values=grouped.get(id)||[]; values.push(payment); grouped.set(id,values); }
  const result=new Map(); for (const [id,values] of grouped) { const order=orderById.get(id); if(!order) continue; const target=Math.max(0,Number(order.total_cents||0)-Number(order.commercial_adjustment_cents||0)); let total=0; for(const payment of values){total+=Number(payment.amount_cents||0); if(total>=target&&target>0){result.set(id,payment.created_at||"");break;}} }
  return result;
}

function buildTrend(db, selectedMonth, datesByOrder, orders, itemsByOrder) {
  const months=[]; const base=new Date(`${selectedMonth}-01T00:00:00Z`); for(let offset=11;offset>=0;offset--){const date=new Date(base);date.setUTCMonth(date.getUTCMonth()-offset);months.push(date.toISOString().slice(0,7));}
  const rows=months.map((month)=>({month,label:monthLabel(month),netSalesCents:0,industrialCostCents:0,salesCommissionCents:0,utilityCents:0,marginPercent:null})); const byMonth=new Map(rows.map((row)=>[row.month,row]));
  for(const order of orders){const month=(datesByOrder.get(Number(order.id))?.sold||"").slice(0,7);const row=byMonth.get(month);if(!row)continue;for(const item of itemsByOrder.get(Number(order.id))||[]){const quantity=Number(item.confirmed_quantity||item.quantity||0);const net=Number(item.confirmed_subtotal_net_cents||item.subtotal_net_cents||0);row.netSalesCents+=net;row.industrialCostCents+=Number(item.industrial_unit_cost_cents||0)*quantity;row.salesCommissionCents+=Math.round(net*Number(order.sales_commission_bps||0)/10000);}}
  for(const row of rows){row.utilityCents=row.netSalesCents-row.industrialCostCents-row.salesCommissionCents;row.marginPercent=row.netSalesCents?row.utilityCents/row.netSalesCents*100:null;} return rows;
}

function monthLabel(month) { const [year,value]=month.split('-').map(Number); return new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,value-1,1))); }

function buildQueues(orders) {
  return {
    received: orders.filter((order) => order.status === "order_created").length,
    receipts: orders.filter((order) => order.payment_status === "receipt_uploaded").length,
    collection: orders.filter((order) => OPEN_PAYMENT_STATUSES.has(order.payment_status) && order.status !== "order_created").length,
    preparation: orders.filter((order) => ["paid", "credit_account", "settled_adjustment"].includes(order.payment_status) && ["availability_confirmed", "confirmed", "in_preparation", "ready"].includes(order.status) && order.fulfillment_status === "pending").length,
    dispatch: orders.filter((order) => order.fulfillment_status === "ready").length,
    transit: orders.filter((order) => order.fulfillment_status === "shipped").length
  };
}

function groupOrdersByDay(orders) {
  const byDay = new Map();
  for (const order of orders) {
    const day = (order.created_at || "").slice(0, 10) || "Sin fecha";
    const entry = byDay.get(day) || { day, orders: 0, totalCents: 0, paidCents: 0, balanceCents: 0 };
    entry.orders += 1;
    entry.totalCents += Number(order.total_cents || 0);
    entry.paidCents += Number(order.paid_cents || 0);
    entry.balanceCents += Number(order.balance_cents || 0);
    byDay.set(day, entry);
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 31);
}

function groupByCustomer(orders) {
  const byCustomer = new Map();
  for (const order of orders) {
    const key = order.tax_id || order.business_name || "Sin cliente";
    const entry = byCustomer.get(key) || {
      businessName: order.business_name || "Sin cliente",
      taxId: order.tax_id || "",
      orders: 0,
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0
    };
    entry.orders += 1;
    entry.totalCents += Number(order.total_cents || 0);
    entry.paidCents += Number(order.paid_cents || 0);
    entry.balanceCents += Number(order.balance_cents || 0);
    byCustomer.set(key, entry);
  }
  return [...byCustomer.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 12);
}

function groupBySalesRep(orders) {
  const byRep = new Map();
  for (const order of orders) {
    const key = order.sales_rep_email || "sin-vendedor";
    const entry = byRep.get(key) || {
      name: order.sales_rep_name || "Sin vendedor",
      email: order.sales_rep_email || "",
      orders: 0,
      totalCents: 0,
      commissionCents: 0
    };
    entry.orders += 1;
    entry.totalCents += Number(order.total_cents || 0);
    entry.commissionCents += Number(order.sales_commission_cents || 0);
    byRep.set(key, entry);
  }
  return [...byRep.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 12);
}

function topProducts(items) {
  const byProduct = new Map();
  for (const item of items) {
    const key = item.km_code;
    const confirmedQuantity = Number(item.confirmed_quantity || 0);
    const quantity = confirmedQuantity > 0 ? confirmedQuantity : Number(item.quantity || 0);
    const subtotalCents = Number(item.confirmed_subtotal_net_cents || item.subtotal_net_cents || 0);
    const entry = byProduct.get(key) || { kmCode: item.km_code, productName: item.product_name, quantity: 0, subtotalCents: 0 };
    entry.quantity += quantity;
    entry.subtotalCents += subtotalCents;
    byProduct.set(key, entry);
  }
  return [...byProduct.values()].sort((a, b) => b.subtotalCents - a.subtotalCents).slice(0, 15);
}

function mapCurrentAccountOrder(order, accountPaymentsByOrder = new Map()) {
  const today = isoDate(new Date());
  const paidCents = Number(order.paid_cents || 0);
  const accountPayments = [...(accountPaymentsByOrder.get(Number(order.id)) || [])];
  const detailedPaidCents = accountPayments.reduce((total, payment) => total + Number(payment.amountCents || 0), 0);
  if (paidCents > detailedPaidCents) {
    accountPayments.push({
      id: `previous-${order.id}`,
      amountCents: paidCents - detailedPaidCents,
      method: "previous_credit",
      reference: "",
      note: "Acreditación anterior sin detalle individual",
      createdAt: ""
    });
  }
  return {
    id: order.id,
    orderNumber: order.order_number,
    businessName: order.business_name,
    salesRepName: order.sales_rep_name || "",
    salesRepEmail: order.sales_rep_email || "",
    paymentStatus: order.payment_status,
    totalCents: Number(order.total_cents || 0),
    paidCents,
    balanceCents: Number(order.balance_cents || 0),
    dueDate: order.payment_due_date || "",
    daysToDue: order.payment_due_date ? daysBetween(today, order.payment_due_date) : null,
    createdAt: order.created_at,
    accountPayments
  };
}

function listCurrentAccountPayments(db) {
  const payments = [];
  if (tableExists(db, "account_payments")) {
    payments.push(...db.prepare(`
      SELECT id, order_id, amount_cents, method, reference, note, created_at
      FROM account_payments
    `).all().map((payment) => ({ ...payment, id: `account-${payment.id}` })));
  }
  if (tableExists(db, "payment_receipts")) {
    payments.push(...db.prepare(`
      SELECT id, order_id, amount_cents, original_filename, review_reason,
             COALESCE(reviewed_at, created_at) AS payment_date
      FROM payment_receipts
      WHERE status = 'accepted' AND amount_cents > 0
    `).all().map((payment) => ({
      id: `receipt-${payment.id}`,
      order_id: payment.order_id,
      amount_cents: payment.amount_cents,
      method: "approved_receipt",
      reference: payment.original_filename || "",
      note: payment.review_reason || "Comprobante aprobado",
      created_at: payment.payment_date || ""
    })));
  }
  if (tableExists(db, "mercadopago_payments")) {
    payments.push(...db.prepare(`
      SELECT id, order_id, amount_cents, payment_id, status_detail, updated_at, created_at
      FROM mercadopago_payments
      WHERE status = 'approved' AND amount_cents > 0
    `).all().map((payment) => ({
      id: `mercadopago-${payment.id}`,
      order_id: payment.order_id,
      amount_cents: payment.amount_cents,
      method: "mercadopago",
      reference: payment.payment_id || "",
      note: payment.status_detail || "Pago acreditado automáticamente",
      created_at: payment.updated_at || payment.created_at || ""
    })));
  }
  return payments.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function groupAccountPayments(payments) {
  const byOrder = new Map();
  for (const payment of payments) {
    const orderId = Number(payment.order_id);
    const entries = byOrder.get(orderId) || [];
    entries.push({
      id: payment.id,
      amountCents: Number(payment.amount_cents || 0),
      method: payment.method || "",
      reference: payment.reference || "",
      note: payment.note || "",
      createdAt: payment.created_at || ""
    });
    byOrder.set(orderId, entries);
  }
  return byOrder;
}

function compareCurrentAccountOrders(a, b) {
  const aDate = a.payment_due_date || "9999-12-31";
  const bDate = b.payment_due_date || "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return Number(b.balance_cents || 0) - Number(a.balance_cents || 0);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysIsoDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return isoDate(next);
}

function daysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
